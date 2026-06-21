import { escapeXml, safeCdata, csvEscape, getStatusLabel } from "./utils.js";

export function buildXML(data, type) {
  const isAnime = type === "ANIME";
  const itemTag = isAnime ? "anime" : "manga";
  const idTag = isAnime ? "series_animedb_id" : "series_mangadb_id";

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<myanimelist>\n`;
  xml += `  <myinfo>\n`;
  xml += `    <user_export_type>${isAnime ? 1 : 2}</user_export_type>\n`;
  xml += `  </myinfo>\n`;

  for (const item of data) {
    xml += `  <${itemTag}>\n`;
    xml += `    <${idTag}>${escapeXml(item.idMal || "")}</${idTag}>\n`;
    xml += `    <series_title>${safeCdata(item.title || "")}</series_title>\n`;

    if (isAnime) {
      xml += `    <series_type>0</series_type>\n`;
      xml += `    <series_episodes>0</series_episodes>\n`;
      xml += `    <my_watched_episodes>${escapeXml(item.progress || 0)}</my_watched_episodes>\n`;
      xml += `    <my_times_watched>${escapeXml(item.rewatches || 0)}</my_times_watched>\n`;
      xml += `    <my_rewatch_value>0</my_rewatch_value>\n`;
    } else {
      xml += `    <series_type>0</series_type>\n`;
      xml += `    <series_volumes>0</series_volumes>\n`;
      xml += `    <series_chapters>0</series_chapters>\n`;
      xml += `    <my_read_volumes>0</my_read_volumes>\n`;
      xml += `    <my_read_chapters>${escapeXml(item.progress || 0)}</my_read_chapters>\n`;
      xml += `    <my_times_read>${escapeXml(item.rewatches || 0)}</my_times_read>\n`;
      xml += `    <my_reread_value>0</my_reread_value>\n`;
    }

    xml += `    <my_score>${escapeXml(item.score || 0)}</my_score>\n`;
    xml += `    <my_status>${escapeXml(item.malStatus || 0)}</my_status>\n`;
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

export function buildJSON(data, meta = {}) {
  const payload = {
    meta,
    exportedAt: new Date().toISOString(),
    entries: data
  };

  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
}

export function buildTXT(data, type) {
  let txt = `Akashic Export\n${"=".repeat(30)}\n`;
  txt += `Media Type: ${type}\nTotal Entries: ${data.length}\n\n`;

  for (const item of data) {
    txt += `Title: ${item.title}\n`;
    txt += `Score: ${item.score}/10\n`;
    txt += `Status: ${getStatusLabel(item.malStatus)}\n`;
    txt += `Progress: ${item.progress}\n`;
    txt += `MAL ID: ${item.idMal || "N/A"}\n`;
    txt += `Notes: ${item.notes || ""}\n`;
    txt += `\n`;
  }

  return new Blob([txt], { type: "text/plain;charset=utf-8" });
}

export async function buildDOCX(data, type) {
  const docx = await import("https://cdn.jsdelivr.net/npm/docx@9.1.1/+esm");
  const {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    WidthType
  } = docx;

  const rows = [
    new TableRow({
      children: [
        "Title",
        "Score",
        "Status",
        "Progress",
        "MAL ID"
      ].map((text) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })]
      }))
    })
  ];

  for (const item of data) {
    rows.push(
      new TableRow({
        children: [
          item.title || "",
          String(item.score ?? ""),
          getStatusLabel(item.malStatus),
          String(item.progress ?? ""),
          String(item.idMal || "")
        ].map((text) => new TableCell({
          children: [new Paragraph(String(text))]
        }))
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "Akashic Export",
                bold: true,
                size: 32
              })
            ]
          }),
          new Paragraph(`Media Type: ${type}`),
          new Paragraph(`Total Entries: ${data.length}`),
          new Paragraph(""),
          new Table({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE
            },
            rows
          })
        ]
      }
    ]
  });

  return await Packer.toBlob(doc);
}
