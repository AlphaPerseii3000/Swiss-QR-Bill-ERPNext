import {
  calculateQRReferenceChecksum,
  calculateSCORReferenceChecksum,
  isQRIBAN,
} from "swissqrbill/utils";
import { FRAPPE_FILE_UPLOAD_ENDPOINT } from "./constant";
import { updateMessage } from "./message";

/**
 * Shows Progress Bar For Uploading QR Bill
 * @param {Number} current Current Progress
 * @param {String} description Description
 */
export const showProgress = (current, description) => {
  const title = updateMessage;
  const total = 100;
  window.frappe.show_progress(title, current, total, description, true);
};

/**
 * Creates Filename For Uploading File
 * @param {String} name Name of File
 * @returns String
 */
const _filename = (name) => `${name}-QRBILL.pdf`;

/**
 * Frappe Upload File As Attachment to
 * Frappe Cloud
 * @param {Blob} file PDF File Blob
 * @param {String} docname Document Name
 * @param {Object} frm Frappe Form Object
 */
export const uploadFileAsAttachment = (file, docname, frm) => {
  let formdata = new FormData();
  formdata.append("is_private", 1);
  formdata.append("folder", "Home/Attachments");
  formdata.append("doctype", "Sales Invoice");
  formdata.append("docname", docname);
  formdata.append("file", file, _filename(docname));
  fetch(FRAPPE_FILE_UPLOAD_ENDPOINT, {
    headers: {
      Accept: "application/json",
      "X-Frappe-CSRF-Token": window.frappe.csrf_token,
    },
    method: "POST",
    body: formdata,
  }).then(() => {
    showProgress(100, "done");
    frm.reload_doc();
  });
};

/**
 * Shows Error Alert
 * @param {String} error Error Message
 */
export const showError = (error) => {
  window.frappe.hide_progress();
  window.frappe.throw(error);
};

/**
 * Download File Name
 * @param {URL} uri URL to Set For Virtual Button
 * @param {String} filename File Name of Download
 */
export const triggerDownload = (uri, filename) => {
  var evt = new MouseEvent("click", {
    view: window,
    bubbles: false,
    cancelable: true,
  });
  var a = document.createElement("a");
  a.setAttribute("download", filename);
  a.setAttribute("href", uri);
  a.setAttribute("target", "_blank");
  a.dispatchEvent(evt);
};

/**
 * Returns Language Code For Swiss QR Bill
 * @param {String} language Language
 * @returns {String} Returns Language Code For Download
 */
export const getLanguageCode = (language) => {
  if (language === "en-US" || language === "en-GB") {
    return "EN";
  }

  if (
    language === "en" ||
    language === "fr" ||
    language === "it" ||
    language === "de"
  ) {
    return language.toUpperCase();
  }
  return "DE";
};

/**
 *
 * @param {String} doctype Doctype
 * @param {String} docname Docname
 * @param {String} error Error Message
 * @returns {Promise} Doc
 */
export const getDocument = async (doctype, docname) => {
  try {
    return await window.frappe.db.get_doc(doctype, docname);
  } catch (error) {
    showError(error);
  }
};

/**
 * Generates a reference code for a QR bill.
 * For QR-IBAN (IID 30000-31999): generates a QRR reference (27 numeric digits with mod10 checksum).
 * For regular IBAN: generates a SCOR reference (RF + mod97 checksum + alphanumeric base, max 25 chars).
 *
 * @param {String} docname Document name (e.g. ACC-SINV-2026-00001)
 * @param {String} iban The creditor IBAN (used to determine QRR vs SCOR)
 * @param {Number} scheduleIndex Optional 1-based schedule index for multi-schedule invoices
 * @returns {String} Reference code (QRR 27 digits or SCOR RF...)
 */
export const getReferenceCode = (docname, iban, scheduleIndex = 0) => {
  const scheduleSuffix =
    scheduleIndex > 0 ? scheduleIndex.toString().padStart(2, "0") : "";

  if (isQRIBAN(iban)) {
    // QRR reference: 26 digits + 1 mod10 checksum digit = 27 total
    const digits = docname.replace(/\D/g, "");
    const base = `${digits}${scheduleSuffix}`;
    const padded = base.padStart(26, "0").substring(0, 26);
    const checksum = calculateQRReferenceChecksum(padded);
    return `${padded}${checksum}`;
  } else {
    // SCOR reference: RF + 2-digit mod97 checksum + alphanumeric base (max 25 total)
    const alphaNum = docname
      .split("-")
      .join("")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const base = `${alphaNum}${scheduleSuffix}`.substring(0, 21);
    const checksum = calculateSCORReferenceChecksum(base);
    return `RF${checksum}${base}`;
  }
};

/**
 * Formats a date string (YYYY-MM-DD) into a human-readable format.
 * @param {String} dateStr Date in YYYY-MM-DD format
 * @param {String} language Language code (FR, DE, EN, IT)
 * @returns {String} Formatted date
 */
export const formatDate = (dateStr, language = "FR") => {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T00:00:00");
  const localeMap = { FR: "fr-CH", DE: "de-CH", EN: "en-CH", IT: "it-CH" };
  const locale = localeMap[language] || "fr-CH";
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

/**
 * Returns Currency Code or Shows Error
 * @param {String 'CHF' | 'EUR'} currency Currency
 * @returns Currency Code
 * @throws {Error} Currency Should Either Be CHF or EUR
 */
export const getCurrency = (currency) => {
  if (currency === "CHF" || currency === "EUR") {
    return currency;
  }
  showError("Currency Should Be Either CHF or EUR");
};