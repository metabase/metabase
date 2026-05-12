const commonConfig = require("./typedoc.common.config.js");

/** @type {import("typedoc").TypeDocOptions} */
const htmlConfig = {
  ...commonConfig,
  out: "../docs-build/public/embedding/sdk/api",
  favicon: "../resources/frontend_client/favicon.ico",
  customJs: "./page-custom-logic.js",
  customCss: "./page-custom-styles.css",
  pretty: true,
  visibilityFilters: {},
  hideGenerator: true,
  // Override commonConfig.replaceText: drop the Jekyll Liquid include that
  // it injects into <meta name="description"> (would render as literal
  // `{% include %}` text under Astro), keep the data-refl scrubber.
  replaceText: {
    ' data-refl="[^"]*"': "",
  },
  customFooterHtml:
    '<script type="text/javascript" src="/gdpr-cookie-notice/dist/script.js"></script>' +
    '<script type="text/javascript" src="/js/cookie-consent.js"></script>' +
    '<link href="/gdpr-cookie-notice/dist/style.css" rel="stylesheet" />' +
    '<link href="/css/gdpr.css" rel="stylesheet" />',
};

module.exports = htmlConfig;
