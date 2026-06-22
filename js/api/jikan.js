import { sleep, unique, normalizeText, sharedTokenCount } from "../utils.js";

const jikanCache = new Map();
let lastJikanRequestAt = 0;
const JIKAN_MIN_INTERVAL_MS = 2600;

function mediaKey(type) {
  return type === "ANIME" ? "anime" : "manga";
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

  if (!response.ok) return [];

  const json = await response.json();
  return json?.data || [];
}

function pickSearchTitle(titles) {
  const cleaned = unique((titles || []).filter(Boolean).map((t) => String(t).trim()).filter(Boolean));
  if (!cleaned.length) return "";

  const preferred = cleaned.find((t) => t.length >= 4);
  return preferred || cleaned[0] || "";
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
    ]).map(normalizeText).filter(Boolean);

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

export async function resolveMissingMalIds(items, type, options = {}) {
  const {
    enabled = true,
    onProgress = () => {},
    onCurrent = () => {}
  } = options;

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

    onCurrent({
      title: item.title || "Unknown",
      done: i,
      total,
      matched: out.filter((x) => x.idMal).length,
      unmatched: out.filter((x) => !x.idMal).length
    });

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

  onCurrent({
    title: "-",
    done: total,
    total,
    matched: out.filter((x) => x.idMal).length,
    unmatched: out.filter((x) => !x.idMal).length
  });

  onProgress({
    phase: "done",
    done: total,
    total,
    matched: out.filter((x) => x.idMal).length,
    unmatched: out.filter((x) => !x.idMal).length
  });

  return out;
                            }
