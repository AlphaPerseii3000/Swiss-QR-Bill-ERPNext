import { buildQRBillPDF } from "./qrbill";
import { showError, showProgress, uploadFileAsAttachment } from "./utils";

/**
 * Generates a multi-page QR-bill PDF (one QR-bill page per config) and uploads it
 * as an attachment to the Sales Invoice.
 *
 * Thin adapter over ./qrbill/generator (buildQRBillPDF), wiring Frappe progress
 * display and the attachment upload. Kept at this path for backward compatibility
 * with existing imports.
 *
 * @param {Array<Object>} configs Array of QR-bill configs (one per payment schedule entry)
 * @param {String} docname Document name (for the attachment filename)
 * @param {Object} frm Frappe form object
 * @param {String} papersize Paper size (default A4)
 * @param {String} language Language code (DE/FR/IT/EN)
 */
export const generateQRPDF = (configs, docname, frm, papersize, language) => {
  buildQRBillPDF(configs, {
    papersize,
    language,
    onProgress: showProgress,
  })
    .then((blob) => {
      showProgress(90, "uploading pdf...");
      uploadFileAsAttachment(blob, docname, frm);
    })
    .catch(showError);
};
