import { createQRBill } from "./createqrbill";
import { getReferenceCode } from "./utils";

window.frappe.ui.form.on("Sales Invoice", {
  on_submit: (frm) => {
    createQRBill(frm);
  },

  onload: (frm) => {
    // esr_reference_code is now generated per-schedule at QR-bill generation time
    // (multi-schedule invoices need distinct references per schedule).
    if (!frm.doc.esr_reference_code) {
      frm.doc.esr_reference_code = "";
    }
  },

  before_submit: (frm) => {
    // Legacy single reference for backward compat with the esr_reference_code field.
    // Multi-schedule references are generated with a per-schedule suffix at generation time.
    const reference = getReferenceCode(frm.doc.name, "", 0);
    frm.doc.esr_reference_code = reference;
  },

  refresh: (frm) => {
    const scheduleCount =
      frm.doc.payment_schedule && frm.doc.payment_schedule.length;
    const label = scheduleCount && scheduleCount > 1
      ? __("Create QR Bill ({0} echeances)", [scheduleCount])
      : __("Create QR Bill");
    // Remove existing button to avoid duplicates on re-render
    frm.remove_custom_button(label, __("Actions"));
    frm.add_custom_button(label, function () {
      createQRBill(frm);
    }, __("Actions"));
  },
});
