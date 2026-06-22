import { escapeXml, safeCdata, getStatusLabel } from "../utils.js";

export function buildXML(data, type) {
  const isAnime = type === "ANIME";
  const itemTag = isAnime ? "anime" : "manga";
  const idTag = isAnime ? "series_animedb_id" : "series_mangadb_id";
  const progressTag = isAnime ? "my_watched_episodes" : "my_read_chapters";
  const progressVolumeTag = isAnime ? null : "my_read_volumes";
  const countTag = isAnime ? "my_times_watched" : "my_times_read";
  const repeatFlagTag = isAnime ? "my_rewatching" : "my_rereading";
  const repeatProgressTag = isAnime ? "my_rewatching_ep" : null;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<myanimelist>\n`;
  xml += `  <myinfo>\n`;
  xml += `    <user_export_type>${isAnime ? 1 : 2}</user_export_type>\n`;
  xml += `  </myinfo>\n`;

  for (const item of data) {
    const status = Number(item.malStatus || 6);

    xml += `  <${itemTag}>\n`;
    xml += `    <${idTag}>${escapeXml(item.idMal || "")}</${idTag}>\n`;
    xml += `    <series_title>${safeCdata(item.title || "")}</series_title>\n`;
    xml += `    <series_type>0</series_type>\n`;

    if (isAnime) {
      xml += `    <series_episodes>0</series_episodes>\n`;
      xml += `    <${progressTag}>${escapeXml(item.progress || 0)}</${progressTag}>\n`;
      xml += `    <${countTag}>${escapeXml(item.rewatches || 0)}</${countTag}>\n`;
      xml += `    <${repeatFlagTag}>${item.rewatches > 0 ? 1 : 0}</${repeatFlagTag}>\n`;
      xml += `    <${repeatProgressTag}>0</${repeatProgressTag}>\n`;
    } else {
      xml += `    <series_volumes>0</series_volumes>\n`;
      xml += `    <series_chapters>0</series_chapters>\n`;
      xml += `    <my_read_volumes>0</my_read_volumes>\n`;
      xml += `    <${progressTag}>${escapeXml(item.progress || 0)}</${progressTag}>\n`;
      xml += `    <${countTag}>${escapeXml(item.rewatches || 0)}</${countTag}>\n`;
      xml += `    <${repeatFlagTag}>${item.rewatches > 0 ? 1 : 0}</${repeatFlagTag}>\n`;
    }

    xml += `    <my_score>${escapeXml(item.score || 0)}</my_score>\n`;
    xml += `    <my_status>${status}</my_status>\n`;
    xml += `    <my_comments>${safeCdata(item.notes || "")}</my_comments>\n`;

    if (item.startDate) xml += `    <my_start_date>${escapeXml(item.startDate)}</my_start_date>\n`;
    if (item.finishDate) xml += `    <my_finish_date>${escapeXml(item.finishDate)}</my_finish_date>\n`;

    xml += `    <my_tags>${safeCdata(item.notes || "")}</my_tags>\n`;
    xml += `    <update_on_import>1</update_on_import>\n`;
    xml += `  </${itemTag}>\n`;
  }

  xml += `</myanimelist>`;
  return new Blob([xml], { type: "application/xml" });
}
