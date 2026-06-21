import { EXPORT_EXTENSIONS } from "./config.js";
import { fetchAniList, fetchMAL, fetchKitsu, resolveMissingMalIds } from "./api.js";
import { applyScoreRule, normalizeStatusToMalCode, downloadBlob } from "./utils.js";
import { buildXML, buildCSV, buildJSON, buildTXT, buildDOCX } from "./exporters.js";

const els = {
  sourcePlatform: document.getElementById("sourcePlatform"),
  username: document.getElementById("username"),
  mediaType: document.getElementById("mediaType"),
  exportFormat: document.getElementById("exportFormat"),
  scoreRule: document.getElementById("scoreRule"),
  fallbackSearch: document.getElementById("fallbackSearch"),
  exportBtn: document.getElementById("exportBtn"),
  loadingState: document.getElementById("loadingState"),
  logSection: document.getElementById("logSection"),
  statsBox: document.getElementById("statsBox"),
  phantomBox: document.getElementById("phantomBox"),
  phantomList: document.getElementById("phantomList")
};

els.exportBtn.addEventListener("click", runTranslator);

async function runTranslator() {
  const sourcePlatform = els.sourcePlatform.value;
  const username = els.username.value.trim();
  const mediaType = els.mediaType.value;
  const exportFormat = els.exportFormat.value;
  const scoreRule = els.scoreRule.value;
  const fallbackSearch = els.fallbackSearch.checked;

  if (!username) {
    alert("Please enter a username.");
    return;
  }

  setLoading(true);
  clearLog();

  try {
    let rawData = [];

    if (sourcePlatform === "ANILIST") rawData = await fetchAniList(username, mediaType);
    if (sourcePlatform === "MAL") rawData = await fetchMAL(username, mediaType);
    if (sourcePlatform === "KITSU") rawData = await fetchKitsu(username, mediaType);

    const standardized = rawData.map((item) => ({
      ...item,
      titleCandidates: item.titleCandidates || [item.title],
      score: Number(item.score) || 0,
      malStatus: normalizeStatusToMalCode(item.status)
    }));

    const resolved = await resolveMissingMalIds(
      standardized,
      mediaType,
      fallbackSearch,
      () => {}
    );

    const translated = resolved.map((item) => ({
      ...item,
      score: applyScoreRule(item.score, scoreRule),
      malStatus: normalizeStatusToMalCode(item.status)
    }));

    const exportable = exportFormat === "XML"
      ? translated.filter((item) => item.idMal)
      : translated;

    const phantoms = translated.filter((item) => !item.idMal);
    const filename = buildFilename(username, sourcePlatform, exportFormat, mediaType);

    let blob;

    switch (exportFormat) {
      case "XML":
        blob = buildXML(exportable, mediaType);
        break;
      case "CSV":
        blob = buildCSV(translated, mediaType);
        break;
      case "JSON":
        blob = buildJSON(translated, {
          username,
          sourcePlatform,
          mediaType,
          exportFormat
        });
        break;
      case "TXT":
        blob = buildTXT(translated, mediaType);
        break;
      case "DOCX":
        blob = await buildDOCX(translated, mediaType);
        break;
      default:
        throw new Error("Unsupported export format.");
    }

    downloadBlob(blob, filename);

    renderStats({
      total: translated.length,
      exported: exportable.length,
      matched: translated.length - phantoms.length,
      unmatched: phantoms.length,
      exportFormat
    });

    renderPhantoms(phantoms);
    els.logSection.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    alert(`Error: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  els.exportBtn.disabled = isLoading;

  if (isLoading) {
    els.exportBtn.classList.add("hidden");
    els.loadingState.classList.remove("hidden");
    els.loadingState.classList.add("flex");
  } else {
    els.exportBtn.classList.remove("hidden");
    els.loadingState.classList.add("hidden");
    els.loadingState.classList.remove("flex");
  }
}

function clearLog() {
  els.logSection.classList.add("hidden");
  els.statsBox.innerHTML = "";
  els.phantomBox.classList.add("hidden");
  els.phantomList.innerHTML = "";
}

function renderStats({ total, exported, matched, unmatched, exportFormat }) {
  els.statsBox.innerHTML = `
    <div>Total entries: <strong>${total}</strong></div>
    <div>Matched MAL IDs: <strong>${matched}</strong></div>
    <div>Unmatched: <strong>${unmatched}</strong></div>
    <div>Export format: <strong>${exportFormat}</strong></div>
    ${exportFormat === "XML" ? `<div>XML exported entries: <strong>${exported}</strong></div>` : ""}
  `;
}

function renderPhantoms(phantoms) {
  if (!phantoms.length) return;

  els.phantomBox.classList.remove("hidden");
  els.phantomList.innerHTML = "";

  for (const item of phantoms) {
    const li = document.createElement("li");
    li.textContent = item.title;
    els.phantomList.appendChild(li);
  }
}

function buildFilename(username, sourcePlatform, exportFormat, mediaType) {
  const ext = EXPORT_EXTENSIONS[exportFormat] || exportFormat.toLowerCase();
  return `${username}_${sourcePlatform.toLowerCase()}_${mediaType.toLowerCase()}.${ext}`;
}
