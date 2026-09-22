import { assembleQRBillData } from "./qrbill";
import { generateQRPDF } from "./generateqrpdf";
import { showError, showProgress } from "./utils";

/**
 * Sales Invoice → QR-bill orchestration: assembles the QR-bill configs from the
 * form's document, then renders and uploads the multi-page PDF as an attachment.
 * Data assembly lives in ./qrbill/assembler, PDF rendering in ./qrbill/generator
 * (exposed via generateQRPDF).
 *
 * @param {Object} frm Frappe form object (Sales Invoice)
 */
export const createQRBill = async (frm) => {
  showProgress(5, "getting data...");
  try {
    const { configs, language, scheduleCount } = await assembleQRBillData(
      frm.doc
    );
    showProgress(20, `generating ${scheduleCount} QR-bill(s)...`);
    generateQRPDF(configs, frm.docname, frm, "A4", language);
  } catch (error) {
    showError(error && error.message ? error.message : error);
  }
};
