/**
 * Creates Address Configuration
 * @param {String} currency CHF | EUR
 * @param {*} amount Amount To Pay
 * @param {String} reference Reference Code
 * @param {String} company Company Name
 * @param {Object} companyAddress Company Address
 * @param {String} companyAddressCode ALPHA-2 Address Code
 * @param {String} iban QR-IBAN
 * @param {String} customer Customer Name
 * @param {Object} customerAddress Customer Address
 * @param {String} customerAddressCode Customer Address Code
 * @returns Address Configuration
 */
// Joins non-empty address parts with a space, ignoring null/undefined/"".
const joinAddress = (...parts) => parts.filter((p) => p && String(p).trim()).join(" ");

export const generateQRConfig = (
  currency,
  amount,
  company,
  companyAddress,
  companyAddressCode,
  iban,
  customer,
  customerAddress,
  customerAddressCode,
  reference
) => ({
  currency,
  amount,
  reference,
  creditor: {
    name: company,
    address: joinAddress(companyAddress.address_line1, companyAddress.address_line2),
    zip: parseInt(companyAddress.pincode),
    city: companyAddress.city,
    account: iban,
    country: companyAddressCode,
  },
  debtor: {
    name: customer,
    address: joinAddress(customerAddress.address_line1, customerAddress.address_line2),
    zip: customerAddress.pincode,
    city: customerAddress.city,
    country: customerAddressCode,
  },
});
