const { LICENSE_TEXT } = require("../../shared/constants");

// To force the SDK to be a client component in Next.js
const USE_CLIENT_DIRECTIVE = '"use client";';

module.exports.SDK_PACKAGE_BANNER = [USE_CLIENT_DIRECTIVE, LICENSE_TEXT].join(
  "\n\n",
);
