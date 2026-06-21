import { sleep, unique, normalizeText } from "./utils.js";

const jikanCache = new Map();
let lastJikanRequestAt = 0;
const JIKAN_MIN_INTERVAL_MS = 2600;

function mediaKey(type) {
  return type === "ANIME" ? "anime" : "manga";
}

function sourceTypeToKitsuKind(type) {
  return type === "ANIME" ? "anime" : "manga";
}

export async function fetchAniList(username, type) {
  const query = `
    query ($username: String, $type: MediaType) {
      MediaListCollection(userName: $username, type: $type) {
        lists {
          entries {
            status
            score(format: POINT_10_DECIMAL)
            progress
            repeat
            notes
            startedAt { year month day }
            completedAt { year month day }
            media {
              idMal
              title {
                romaji
                english
                native
              }
              synonyms
            }
          }
        }
      }
    }
  `;

  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      query,
      variables: { username, type }
    })
  });

  const json = await response.json();
  if (!response.ok || json.errors?.length) {
    throw new Error(json.errors?.[0]?.message || "AniList request failed.");
  }

  const lists = json?.data?.MediaListCollection?.lists || [];
  const entries = lists.flatMap((list) => list.entries || []);

  return entries.map((e) => {
    const titleCandidates = unique([
      e?.media?.title?.english,
      e?.media?.title?.romaji,
      e?.media?.title?.native,
      ...(e?.media?.synonyms || [])
    ]);

    return {
      idMal: e?.media?.idMal || null,
      title: titleCandidates[0] || "Unknown",
      titleCandidates,
      score: Number(e?.score) || 0,
      status: e?.status || "",
      progress: Number(e?.progress) || 0,
      rewatches: Number(e?.repeat) || 0,
      notes: e?.notes || "",
      startDate: formatDateObj(e?.startedAt),
      finishDate: formatDateObj(e?.completedAt),
      source: "ANILIST"
    };
  });
}

export async function fetchMAL(username, type) {
  const listType = type === "ANIME" ? "animelist" : "mangalist";
  let entries = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `https://myanimelist.net/${listType}/${encodeURIComponent(username)}/load.json?status=7&offset=${offset}`
    );

    if (!response.ok) {
      throw new Error("MAL profile not found, private, or blocked.");
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      hasMore = false;
      break;
    }

    entries = entries.concat(data);
    offset += 300;
  }

  return entries.map((e) => {
    const title = type === "ANIME" ? e.anime_title : e.manga_title;
    return {
      idMal: type === "ANIME" ? e.anime_id : e.manga_id,
      title: title || "Unknown",
      titleCandidates: unique([title]),
      score: Number(e.score) || 0,
      status: e.status || "",
      progress: type === "ANIME" ? Number(e.num_watched_episodes) || 0 : Number(e.num_read_chapters) || 0,
      rewatches: Number(e.is_rewatching || e.is_rereading ? 1 : 0),
      notes: e.tags || "",
      startDate: e.start_date_string || "",
      finishDate: e.finish_date_string || "",
      source: "MAL"
    };
  });
}

export async function fetchKitsu(username, type) {
  const userRes = await fetch(
    `https://kitsu.io/api/edge/users?filter[slug]=${encodeURIComponent(username)}`
  );
  const userJson = await userRes.json();

  if (!userJson?.data?.length) {
    throw new Error("Kitsu user not found.");
  }

  const userId = userJson.data[0].id;
  let nextUrl = `https://kitsu.io/api/edge/library-entries?filter[user_id]=${userId}&filter[kind]=${sourceTypeToKitsuKind(type)}&include=anime,manga,anime.mappings,manga.mappings&page[limit]=500`;
  let entries = [];

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) throw new Error("Kitsu request failed.");

    const data = await response.json();
    const mediaMap = new Map();
    const mappingMap = new Map();

    (data.included || []).forEach((inc) => {
      if (inc.type === "anime" || inc.type === "manga") {
        mediaMap.set(inc.id, inc);
      }

      if (
        inc.type === "mappings" &&
        String(inc.attributes?.externalSite || "").toLowerCase().includes("myanimelist")
      ) {
        mappingMap.set(inc.id, inc.attributes?.externalId || null);
      }
    });

    const kind = sourceTypeToKitsuKind(type);

    const parsed = (data.data || []).map((entry) => {
      const mediaId = entry.relationships?.[kind]?.data?.id;
      const media = mediaMap.get(mediaId);

      let idMal = null;
      const mappingRefs = media?.relationships?.mappings?.data || [];

      for (const ref of mappingRefs) {
        if (mappingMap.has(ref.id)) {
          idMal = mappingMap.get(ref.id);
          break;
        }
      }

      const title = media?.attributes?.canonicalTitle || "Unknown";
      const titleCandidates = unique([
        title,
        media?.attributes?.slug
      ]);

      return {
        idMal,
        title,
        titleCandidates,
        score: (Number(entry.attributes?.ratingTwenty) || 0) / 2,
        status: entry.attributes?.status || "",
        progress: Number(entry.attributes?.progress) || 0,
        rewatches: Number(entry.attributes?.reconsumeCount) || 0,
        notes: entry.attributes?.notes || "",
        startDate: formatKitsuDate(entry.attributes?.startedAt),
        finishDate: formatKitsuDate(entry.attributes?.finishedAt),
        source: "KITSU"
      };
    });

    entries = entries.concat(parsed);
    nextUrl = data.links?.next || null;
  }

  return entries;
}

export async function resolveMissingMalIds(items, type, enabled = true, onProgress = () => {}) {
  if (!enabled) return items;

  const out = items.map((item) => ({
    ...item,
    titleCandidates: unique([
      ...(item.titleCandidates || []),
      item.title
    ])
  }));

  const unresolvedIndexes = out
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.idMal);

  const total = unresolvedIndexes.length;

  onProgress({
    phase: "start",
    done: 0,
    total,
    matched: out.length - total,
    unmatched: total
  });

  for (let i = 0; i < unresolvedIndexes.length; i += 1) {
    const { item, index } = unresolvedIndexes[i];
    const resolvedId = await resolveMalIdByTitles(item.titleCandidates || [item.title], type);

    out[index] = {
      ...out[index],
      idMal: resolvedId || null
    };

    onProgress({
      phase: "batch",
      done: i + 1,
      total,
      matched: out.filter((x) => x.idMal).length,
      unmatched: out.filter((x) => !x.idMal).length
    });
  }

  onProgress({
    phase: "done",
    done: total,
    total,
    matched: out.filter((x) => x.idMal).length,
    unmatched: out.filter((x) => !x.idMal).length
  });

  return out;
}

async function resolveMalIdByTitles(titles, type) {
  const kind = mediaKey(type);
  const cleaned = unique((titles || []).filter(Boolean).map((t) => String(t).trim()).filter(Boolean));

  if (!cleaned.length) return null;

  const cacheKeys = cleaned.map((title) => `${kind}:${normalizeText(title)}`);
  for (const key of cacheKeys) {
    if (jikanCache.has(key)) {
      const cached = jikanCache.get(key);
      if (cached) return cached;
    }
  }

  const searchTitle = pickSearchTitle(cleaned);
  if (!searchTitle) return null;

  const results = await searchJikan(kind, searchTitle);
  const best = pickBestJikanMatch(results, cleaned);

  const malId = best?.mal_id || null;
  for (const key of cacheKeys) {
    jikanCache.set(key, malId);
  }

  return malId;
}

function pickSearchTitle(titles) {
  const cleaned = unique((titles || []).filter(Boolean).map((t) => String(t).trim()).filter(Boolean));
  if (!cleaned.length) return "";

  const decent = cleaned.find((t) => t.length >= 4);
  return decent || cleaned[0] || "";
}

async function searchJikan(kind, query, attempt = 0) {
  const url = `https://api.jikan.moe/v4/${kind}?q=${encodeURIComponent(query)}&limit=5&sfw=true`;
  const response = await rateLimitedFetch(url);

  if (response.status === 429) {
    if (attempt >= 3) {
      throw new Error("Jikan rate limit hit while resolving missing MAL IDs.");
    }

    await sleep(3000 + attempt * 1500);
    return searchJikan(kind, query, attempt + 1);
  }

  if (!response.ok) {
    return [];
  }

  const json = await response.json();
  return json?.data || [];
}

async function rateLimitedFetch(url, options = {}) {
  const now = Date.now();
  const wait = Math.max(0, JIKAN_MIN_INTERVAL_MS - (now - lastJikanRequestAt));

  if (wait > 0) {
    await sleep(wait);
  }

  lastJikanRequestAt = Date.now();
  return fetch(url, options);
}

function pickBestJikanMatch(results, candidates) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const queryCandidates = unique((candidates || []).map(normalizeText).filter(Boolean));
  if (!queryCandidates.length) return null;

  let best = null;
  let bestScore = -1;

  for (const item of results) {
    const resultTitles = unique([
      item?.title,
      item?.title_english,
      item?.title_japanese,
      ...(item?.titles || []).map((t) => t?.title),
      ...(item?.title_synonyms || [])
    ])
      .map(normalizeText)
      .filter(Boolean);

    let score = 0;

    for (const q of queryCandidates) {
      if (resultTitles.includes(q)) {
        score = Math.max(score, 100);
      } else if (resultTitles.some((t) => t === q)) {
        score = Math.max(score, 100);
      } else if (resultTitles.some((t) => t.includes(q) || q.includes(t))) {
        score = Math.max(score, 85);
      } else if (resultTitles.some((t) => sharedTokenCount(t, q) >= 2)) {
        score = Math.max(score, 60);
      } else if (resultTitles.some((t) => sharedTokenCount(t, q) >= 1)) {
        score = Math.max(score, 35);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return bestScore >= 60 ? best : null;
}

function sharedTokenCount(a, b) {
  const setA = new Set(String(a).split(/\s+/).filter(Boolean));
  const setB = new Set(String(b).split(/\s+/).filter(Boolean));
  let count = 0;

  for (const token of setA) {
    if (setB.has(token)) count += 1;
  }

  return count;
}

function formatDateObj(obj) {
  if (!obj || !obj.year) return "";
  const m = String(obj.month || 1).padStart(2, "0");
  const d = String(obj.day || 1).padStart(2, "0");
  return `${obj.year}-${m}-${d}`;
}

function formatKitsuDate(value) {
  if (!value) return "";
  return String(value).split("T")[0];
}
