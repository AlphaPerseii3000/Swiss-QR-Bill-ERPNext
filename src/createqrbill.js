import { generateQRPDF } from "./generateqrpdf";
import { generateQRConfig } from "./qrconfig";
import {
  getCurrency,
  getDocument,
  getLanguageCode,
  getReferenceCode,
  showError,
  showProgress,
  formatDate,
} from "./utils";

/**
 * Builds a sorted list of QR-bill schedules from the Sales Invoice payment_schedule.
 * Falls back to a single schedule (grand_total) when no payment_schedule is defined.
 *
 * Each returned item has: { paymentTerm, description, dueDate, amount, index }
 *
 * @param {Object} doc The Sales Invoice document (frm.doc)
 * @returns {Array} Schedule entries
 */
const buildSchedule = (doc) => {
  const schedule = (doc.payment_schedule || []).slice();
  schedule.sort((a, b) => (a.idx || 0) - (b.idx || 0));
  return schedule.map((entry, i) => ({
    paymentTerm: entry.payment_term || "",
    description: entry.description || "",
    dueDate: entry.due_date || "",
    amount: Number(entry.payment_amount) || 0,
    index: i + 1,
  }));
};

export const createQRBill = async (frm) => {
  showProgress(5, "getting data...");
  const customer = frm.doc.customer_name || frm.doc.customer;
  const company = frm.doc.company;
  const language = getLanguageCode(frm.doc.language);
  const currency = getCurrency(frm.doc.currency);
  if (!currency) return;

  const bank = await getDocument("Swiss QR Bill Settings", company);
  const bankAccountName = bank.bank_account;
  const { iban } = await getDocument("Bank Account", bankAccountName);

  // Company address: prefer frm.doc.company_address, else resolve via company
  let companyAddressName = frm.doc.company_address;
  if (!companyAddressName) {
    // Fallback: find the primary address linked to the company
    const linked = await window.frappe.db.get_value(
      "Address",
      { link_doctype: "Company", link_name: company, is_primary_address: 1 },
      "name"
    );
    companyAddressName = linked && linked.message ? linked.message.name : null;
  }
  if (!companyAddressName) {
    showError(
      `No address linked to company "${company}". Please create a primary address for the company.`
    );
    return;
  }

  const companyAddress = await getDocument("Address", companyAddressName);
  if (companyAddress.country !== "Switzerland") {
    showError("Company Should Be Switzerland");
    return;
  }

  const customerAddressName = frm.doc.customer_address;
  if (!customerAddressName) {
    showError(
      `No address linked to customer "${customer}". Please set a customer address on the invoice.`
    );
    return;
  }
  const customerAddress = await getDocument("Address", customerAddressName);

  const companyCountry = await getDocument("Country", companyAddress.country);
  const customerCountry = await getDocument("Country", customerAddress.country);
  const companyAddressCode = companyCountry.code.toUpperCase();
  const customerAddressCode = customerCountry.code.toUpperCase();

  // Build schedule
  const schedules = buildSchedule(frm.doc);
  if (schedules.length === 0) {
    // Fallback: single schedule with grand_total
    schedules.push({
      paymentTerm: "",
      description: "",
      dueDate: frm.doc.due_date || "",
      amount: Number(frm.doc.grand_total) || 0,
      index: 1,
    });
  }

  showProgress(20, `generating ${schedules.length} QR-bill(s)...`);

  // Build a config for each schedule
  const configs = schedules.map((s) => {
    const reference = getReferenceCode(frm.doc.name, iban, s.index);
    const config = generateQRConfig(
      currency,
      s.amount,
      company,
      companyAddress,
      companyAddressCode,
      iban,
      customer,
      customerAddress,
      customerAddressCode,
      reference
    );
    // Add payment-schedule metadata for the PDF header / additionalInformation
    config.scheduleIndex = s.index;
    config.scheduleCount = schedules.length;
    config.paymentTerm = s.paymentTerm;
    config.scheduleDescription = s.description;
    config.dueDate = s.dueDate;
    // Put due date + invoice number in the unstructured message (visible on the QR-bill)
    const dueDateFmt = formatDate(s.dueDate, language);
    const msgParts = [];
    if (s.paymentTerm) msgParts.push(s.paymentTerm);
    if (dueDateFmt) msgParts.push(`Echeance: ${dueDateFmt}`);
    msgParts.push(`Facture ${frm.doc.name} (${s.index}/${schedules.length})`);
    config.message = msgParts.join(" | ").substring(0, 140);
    return config;
  });

  // Generate one multi-page PDF (one QR-bill page per schedule)
  generateQRPDF(configs, frm.docname, frm, "A4", language);
};