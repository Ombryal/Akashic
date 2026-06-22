import { csvEscape, getStatusLabel } from "../utils.js";

export function buildCSV(data, type) {
  const progressHeader = type === "ANIME" ? "Episodes" : "Chapters";

  const rows = [
    [
      "MAL_ID",
      "Title",
      "Score",
      "Status_Code",
      "Status_Label",
      progressHeader,
      "Rewatches",
      "Start_Date",
      "Finish_Date",
      "Notes"
    ].join(",")
  ];

  for (const item of data) {
    rows.push([
      item.idMal || "",
      csvEscape(item.title || ""),
      item.score ?? "",
      item.malStatus ?? "",
      csvEscape(getStatusLabel(item.malStatus)),
      item.progress ?? "",
      item.rewatches ?? "",
      csvEscape(item.startDate || ""),
      csvEscape(item.finishDate || ""),
      csvEscape(item.notes || "")
    ].join(","));
  }

  return new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
}
