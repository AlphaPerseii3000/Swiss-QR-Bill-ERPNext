/**
 * Sales Invoice data assembly for QR-bill generation.
 *
 * Extracts, validates and shapes everything needed from a Frappe Sales Invoice
 * form/doc to produce an array of swissqrbill configs (one per payment
 * schedule entry). PDF rendering lives in ./generator.
 */
import {
  getCurrency,
  getDocument,
  getLanguageCode,
  getReferenceCode,
  formatDate,
} from "../utils";
import { generateQRConfig } from "../qrconfig";

/**
 * Builds a sorted list of QR-bill schedules from the Sales Invoice payment_schedule.
 * Falls back to a single schedule (grand_total) when no payment_schedule is defined.
 *
 * Each returned item has: { paymentTerm, description, dueDate, amount, index }
 *
 * @param {Object} doc The Sales Invoice document (frm.doc)
 * @returns {Array} Schedule entries
 */
export const buildSchedule = (doc) => {
  const schedule = (doc.payment_schedule || []).slice();
  schedule.sort((a, b) => (a.idx || 0) - (b.idx || 0));
  const entries = schedule.map((entry, i) => ({
    paymentTerm: entry.payment_term || "",
    description: entry.description || "",
    dueDate: entry.due_date || "",
    amount: Number(entry.payment_amount) || 0,
    index: i + 1,
  }));
  if (entries.length === 0) {
    // Fallback: single schedule with grand_total
    entries.push({
      paymentTerm: "",
      description: "",
      dueDate: doc.due_date || "",
      amount: Number(doc.grand_total) || 0,
      index: 1,
    });
  }
  return entries;
};

/**
 * Resolves the company address name: frm.doc.company_address, else the
 * company's primary linked address. Throws if none found.
 */
const resolveCompanyAddressName = async (doc) => {
  let companyAddressName = doc.company_address;
  if (!companyAddressName) {
    const linked = await window.frappe.db.get_value(
      "Address",
      { link_doctype: "Company", link_name: doc.company, is_primary_address: 1 },
      "name"
    );
    companyAddressName = linked && linked.message ? linked.message.name : null;
  }
  if (!companyAddressName) {
    throw new Error(
      `No address linked to company "${doc.company}". Please create a primary address for the company.`
    );
  }
  return companyAddressName;
};

/**
 * Assembles the QR-bill configs for a Sales Invoice doc.
 * One config per payment schedule entry (SCOR/QRR reference unique per entry).
 *
 * @param {Object} doc The Sales Invoice document (frm.doc)
 * @returns {Promise<{ configs: Array<Object>, language: String, scheduleCount: Number }>}
 * @throws {Error} Validation errors (currency, missing addresses, non-Swiss company)
 */
export const assembleQRBillData = async (doc) => {
  const customer = doc.customer_name || doc.customer;
  const company = doc.company;
  const language = getLanguageCode(doc.language);
  const currency = getCurrency(doc.currency);
  if (!currency) {
    throw new Error("Currency Should Be Either CHF or EUR");
  }

  const bank = await getDocument("Swiss QR Bill Settings", company);
  const { iban } = await getDocument("Bank Account", bank.bank_account);

  const companyAddressName = await resolveCompanyAddressName(doc);
  const companyAddress = await getDocument("Address", companyAddressName);
  if (companyAddress.country !== "Switzerland") {
    throw new Error("Company Should Be Switzerland");
  }

  if (!doc.customer_address) {
    throw new Error(
      `No address linked to customer "${customer}". Please set a customer address on the invoice.`
    );
  }
  const customerAddress = await getDocument("Address", doc.customer_address);

  const companyCountry = await getDocument("Country", companyAddress.country);
  const customerCountry = await getDocument("Country", customerAddress.country);
  const companyAddressCode = companyCountry.code.toUpperCase();
  const customerAddressCode = customerCountry.code.toUpperCase();

  const schedules = buildSchedule(doc);

  // Build a config for each schedule
  const configs = schedules.map((s) => {
    const reference = getReferenceCode(doc.name, iban, s.index);
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
    msgParts.push(`Facture ${doc.name} (${s.index}/${schedules.length})`);
    config.message = msgParts.join(" | ").substring(0, 140);
    return config;
  });

  return { configs, language, scheduleCount: schedules.length };
};
