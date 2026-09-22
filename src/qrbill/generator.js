/**
 * QR-bill PDF rendering module.
 *
 * Pure rendering pipeline: takes one or more fully-built swissqrbill configs
 * and produces a PDF Blob (one QR-bill page per config, optional page header).
 * No Frappe dependencies — usable outside the Sales Invoice form.
 */
import { SwissQRBill } from "swissqrbill/pdf";
import PDFDocument from "pdfkit";
import blobStream from "blob-stream";
import { mm2pt } from "swissqrbill/utils";

const HEADER_LABELS = {
  DE: { schedule: "Rate", of: "von", due: "Fällig" },
  FR: { schedule: "Echéance", of: "sur", due: "Échéance" },
  IT: { schedule: "Rata", of: "di", due: "Scadenza" },
  EN: { schedule: "Instalment", of: "of", due: "Due" },
};

/**
 * Prints a small header at the top of a QR-bill page identifying the schedule.
 * Expects optional config metadata: scheduleIndex, scheduleCount, dueDate, paymentTerm.
 *
 * @param {PDFDocument} pdfDoc The active PDF document
 * @param {Object} config QR-bill config enriched with schedule metadata
 * @param {String} language Language code (DE/FR/IT/EN)
 */
const renderScheduleHeader = (pdfDoc, config, language) => {
  const lang = language || "DE";
  const L = HEADER_LABELS[lang] || HEADER_LABELS.DE;
  const topY = 5; // mm from top of page
  const pageWidth = pdfDoc.page.width;

  if (config.scheduleIndex) {
    const headerText = `${L.schedule} ${config.scheduleIndex}/${config.scheduleCount || 1}`;
    pdfDoc.fontSize(9);
    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text(headerText, mm2pt(5), mm2pt(topY), {
      align: "left",
      width: pageWidth - mm2pt(10),
    });
  }

  if (config.dueDate) {
    pdfDoc.fontSize(9);
    pdfDoc.font("Helvetica-Bold");
    pdfDoc.text(`${L.due}: ${config.dueDate}`, mm2pt(5), mm2pt(topY), {
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

/**
 * Builds a multi-page QR-bill PDF (one QR-bill page per config).
 *
 * @param {Array<Object>} configs Array of QR-bill configs (one per payment schedule entry)
 * @param {Object} options Options
 * @param {String} options.papersize Paper size (default "A4")
 * @param {String} options.language Language code (default "DE")
 * @param {Boolean} options.withPageHeader Print the schedule header on each page (default true)
 * @param {function(number, string): void} options.onProgress Progress callback (percent, label)
 * @returns {Promise<Blob>} Resolves with the generated PDF blob
 */
export const buildQRBillPDF = (configs, options = {}) =>
  new Promise((resolve, reject) => {
    if (!Array.isArray(configs) || configs.length === 0) {
      reject(new Error("No QR-bill configs provided"));
      return;
    }
    const {
      papersize = "A4",
      language = "DE",
      withPageHeader = true,
      onProgress,
    } = options;

    try {
      const pdf = new PDFDocument({
        size: papersize,
        lang: language,
        margin: 0,
      });

      configs.forEach((config, i) => {
        if (i > 0) {
          // Add a fresh page for each subsequent QR-bill
          pdf.addPage({ size: papersize, margin: 0 });
        }
        const qrbill = new SwissQRBill(config, {
          language,
          scissors: true,
          outlines: true,
        });
        // attachTo places the QR slip at the bottom of the page (105mm tall, A4=297mm)
        qrbill.attachTo(pdf);
        if (withPageHeader) {
          renderScheduleHeader(pdf, config, language);
        }
        if (onProgress) {
          onProgress(
            20 + Math.round((70 * (i + 1)) / configs.length),
            `page ${i + 1}/${configs.length}...`
          );
        }
      });

      const stream = pdf.pipe(blobStream());
      pdf.end();
      stream.on("finish", () => resolve(stream.toBlob("application/pdf")));
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
