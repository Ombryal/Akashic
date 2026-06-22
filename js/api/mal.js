import { unique } from "../utils.js";

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

  return entries.map((entry) => {
    const title = type === "ANIME" ? entry.anime_title : entry.manga_title;

    return {
      idMal: type === "ANIME" ? entry.anime_id : entry.manga_id,
      title: title || "Unknown",
      titleCandidates: unique([title]),
      score: Number(entry.score) || 0,
      status: entry.status || "",
      progress: type === "ANIME"
        ? Number(entry.num_watched_episodes) || 0
        : Number(entry.num_read_chapters) || 0,
      rewatches: Number(entry.is_rewatching || entry.is_rereading ? 1 : 0),
      notes: entry.tags || "",
      startDate: entry.start_date_string || "",
      finishDate: entry.finish_date_string || "",
      source: "MAL"
    };
  });
}
