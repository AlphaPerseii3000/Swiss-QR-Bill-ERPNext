import { SwissQRBill } from "swissqrbill/pdf";
import PDFDocument from "pdfkit";
import blobStream from "blob-stream";
import { mm2pt } from "swissqrbill/utils";
import { showError, showProgress, uploadFileAsAttachment } from "./utils";

/**
 * Generates a multi-page QR-bill PDF (one QR-bill page per config) and uploads it
 * as an attachment to the Sales Invoice.
 *
 * @param {Array<Object>} configs Array of QR-bill configs (one per payment schedule entry)
 * @param {String} docname Document name (for the attachment filename)
 * @param {Object} frm Frappe form object
 * @param {String} papersize Paper size (default A4)
 * @param {String} language Language code (DE/FR/IT/EN)
 */
export const generateQRPDF = (
  configs,
  docname,
  frm,
  papersize,
  language
) => {
  if (!Array.isArray(configs) || configs.length === 0) {
    showError("No QR-bill configs provided");
    return;
  }
  try {
    const pdf = new PDFDocument({
      size: papersize || "A4",
      lang: language || "DE",
      margin: 0,
    });

    // Header label per page: echeance X/Y + due date, printed at the top of each page.
    const renderHeader = (pdfDoc, config, language) => {
      const lang = language || "DE";
      const labels = {
        DE: { schedule: "Rate", of: "von", due: "Fällig" },
        FR: { schedule: "Echéance", of: "sur", due: "Échéance" },
        IT: { schedule: "Rata", of: "di", due: "Scadenza" },
        EN: { schedule: "Instalment", of: "of", due: "Due" },
      };
      const L = labels[lang] || labels.DE;
      const headerText = `${L.schedule} ${config.scheduleIndex}/${config.scheduleCount}`;
      const rightText = config.dueDate
        ? `${L.due}: ${config.dueDate}`
        : "";
      const topY = 5; // mm from top of page
      const pageWidth = pdfDoc.page.width;
      pdfDoc.fontSize(9);
      pdfDoc.font("Helvetica-Bold");
      pdfDoc.text(headerText, mm2pt(5), mm2pt(topY), {
        align: "left",
        width: pageWidth - mm2pt(10),
      });
      if (rightText) {
        pdfDoc.fontSize(9);
        pdfDoc.font("Helvetica-Bold");
        pdfDoc.text(rightText, mm2pt(5), mm2pt(topY), {
          align: "right",
          width: pageWidth - mm2pt(10),
        });
      }
      if (config.paymentTerm) {
        pdfDoc.fontSize(8);
        pdfDoc.font("Helvetica");
        pdfDoc.text(config.paymentTerm, mm2pt(5), mm2pt(topY + 4), {
          align: "center",
          width: pageWidth - mm2pt(10),
        });
      }
    };

    configs.forEach((config, i) => {
      if (i > 0) {
        // Add a fresh page for each subsequent QR-bill
        pdf.addPage({ size: papersize || "A4", margin: 0 });
      }
      const qrbill = new SwissQRBill(config, { language: language || "DE", scissors: true, outlines: true });
      // attachTo places the QR slip at the bottom of the page (105mm tall, A4=297mm)
      qrbill.attachTo(pdf);
      // Print a small header at the top of the page identifying the schedule
      renderHeader(pdf, config, language);
      showProgress(
        20 + Math.round((70 * (i + 1)) / configs.length),
        `page ${i + 1}/${configs.length}...`
      );
    });

    showProgress(90, "uploading pdf...");
    const stream = pdf.pipe(blobStream());
    pdf.end();
    stream.on("finish", () => {
      uploadFileAsAttachment(stream.toBlob("application/pdf"), docname, frm);
    });
  } catch (error) {
    showError(error);
  }
};