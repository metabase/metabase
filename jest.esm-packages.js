// @ts-check

/**
 * Shared list of ESM packages that need to be transformed by Jest.
 * This list is used by both jest.config.js and jest.tz.unit.conf.js
 */
const esmPackages = [
  "bail",
  "ccount",
  "character-entities.*",
  "character-reference-invalid",
  "comma-separated-tokens",
  "color",
  "color-convert",
  "color-name",
  "color-string",
  "csv-parse",
  "d3-*",
  "d3",
  "decode-named-character-reference",
  "devlop",
  "echarts",
  "estree.*",
  "fetch-mock",
  "hast.*",
  "html-url-attributes",
  "html-void-elements",
  "is-alphabetical",
  "is-alphanumerical",
  "is-decimal",
  "is-hexadecimal",
  "is-absolute-url",
  "is-plain-obj",
  "jose",
  "longest-streak",
  "markdown-table",
  "mdast.*",
  "micromark.*",
  "parse-entities",
  "property-information",
  "react-markdown",
  "rehype-external-links",
  "remark.*",
  "space-separated-tokens",
  "stringify-entities",
  "trim-lines",
  "trough",
  "unified",
  "unist.*",
  "vfile-location",
  "vfile-message",
  "vfile",
  "web-namespaces",
  "zrender",
  "zwitch",
];

// eslint-disable-next-line import/no-commonjs
module.exports = esmPackages;
