const commonConfig = require("./typedoc.common.config.js");

/** @type {import("typedoc").TypeDocOptions} */
const htmlConfig = {
  ...commonConfig,
  plugin: [
    ...commonConfig.plugin,
    "typedoc-plugin-missing-exports",
    "./typedoc-plugin-frontmatter.js",
  ],
  out: "../docs/embedding/sdk/api",
  favicon: "../resources/frontend_client/favicon.ico",
  customJs: "./page-custom-logic.js",
  customCss: "./page-custom-styles.css",
  internalModule: "internal",
  collapseInternalModule: true,
  pretty: true,
  visibilityFilters: {},
  frontmatterGlobals: {
    title: "Embedded analytics SDK documentation",
    layout: "docs-api",
  },
  redirects: {
    "internal.html": "index.html",
  },
  hideGenerator: true,
  customFooterHtml:
    '<script type="text/javascript" src="/gdpr-cookie-notice/dist/script.js"></script>' +
    '<script type="text/javascript" src="/js/cookie-consent.js"></script>' +
    '<link href="/gdpr-cookie-notice/dist/style.css" rel="stylesheet" />' +
    '<link href="/css/gdpr.css" rel="stylesheet" />',
};

module.exports = htmlConfig;
