// @ts-check

/**
 * Shared list of ESM packages that need to be transformed by Jest.
 * This list is used by both jest.config.js and jest.tz.unit.conf.js
 */
const esmPackages = [
  "ccount",
  "character-entities-html4",
  "comma-separated-tokens",
  "color",
  "color-convert",
  "color-name",
  "color-string",
  "csv-parse",
  "d3-.*",
  "d3",
  "decode-named-character-reference",
  "delaunator",
  "robust-predicates",
  "devlop",
  "echarts",
  "escape-string-regexp",
  "estree.*",
  "fetch-mock",
  "hast.*",
  "html-void-elements",
  "is-absolute-url",
  "internmap",
  "is-plain-obj",
  "jose",
  "property-information",
  "rehype-external-links",
  "space-separated-tokens",
  "stringify-entities",
  "unist-util-visit-parents",
  "unist-util-visit",
  "vfile-location",
  "vfile-message",
  "vfile",
  "web-namespaces",
  "zrender",
  "zwitch",
];

// eslint-disable-next-line import/no-commonjs
module.exports = esmPackages;
