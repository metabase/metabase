const commonConfig = require("./typedoc.common.config.js");

/** @type {import("typedoc").TypeDocOptions} */
const markdownConfig = {
  ...commonConfig,
  plugin: [
    ...commonConfig.plugin,
    "typedoc-plugin-markdown",
    "./typedoc-plugin-markdown-prepare-for-embedding.js",
  ],
  out: "../docs/embedding/sdk/api/snippets",
  cleanOutputDir: true,
  entryFileName: "index",
  publicPath: "./api/",
  flattenOutputFiles: false,
  hideBreadcrumbs: true,
  useCodeBlocks: true,
  expandObjects: true,
  expandParameters: true,
  formatWithPrettier: true,
  prettierConfigFile: "../.prettierrc",
  hidePageHeader: true,
  hidePageTitle: true,
  hideGroupHeadings: true,
  indexFormat: "table",
  parametersFormat: "table",
  interfacePropertiesFormat: "table",
  classPropertiesFormat: "table",
  enumMembersFormat: "table",
  propertyMembersFormat: "table",
  typeAliasPropertiesFormat: "table",
  typeDeclarationFormat: "table",
  tableColumnSettings: {
    hideDefaults: true,
    hideInherited: true,
    hideModifiers: true,
    hideOverrides: true,
    hideSources: true,
    hideValues: false,
    leftAlignHeaders: true,
  },
  validation: {
    ...commonConfig.validation,
    notExported: false,
  },
};

module.exports = markdownConfig;
