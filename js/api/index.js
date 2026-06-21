import { fetchAniList } from "./anilist.js";
import { fetchMAL } from "./mal.js";
import { fetchKitsu } from "./kitsu.js";
import { resolveMissingMalIds } from "./jikan.js";

export async function fetchSource(platform, username, type) {
  switch (platform) {
    case "ANILIST":
      return fetchAniList(username, type);
    case "MAL":
      return fetchMAL(username, type);
    case "KITSU":
      return fetchKitsu(username, type);
    default:
      throw new Error(`Unsupported source platform: ${platform}`);
  }
}

export { fetchAniList, fetchMAL, fetchKitsu, resolveMissingMalIds };
