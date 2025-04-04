/** @type {Partial<import("typedoc").TypeDocOptions>} */
const config = {
  tsconfig: "./tsconfig.sdk-docs.json",
  plugin: [
    "typedoc-plugin-missing-exports",
    "typedoc-plugin-markdown",
    "typedoc-plugin-frontmatter",
  ],
  entryPoints: ["../resources/embedding-sdk/dist/index.d.ts"],
  router: "structure",
  customJs: "page-custom-logic.js",
  customCss: "page-custom-styles.css",
  internalModule: "internal",
  collapseInternalModule: true,
  favicon: "../resources/frontend_client/favicon.ico",
  outputs: [
    {
      name: "html",
      path: "../docs/embedding/sdk/generated/html",
      options: {
        hideGenerator: true,
        navigation: {
          includeCategories: false,
          includeGroups: false,
          includeFolders: false,
          compactFolders: true,
          excludeReferences: true,
        },
        visibilityFilters: {},
        includeHierarchySummary: false,
        frontmatterGlobals: {
          layout: "docs-api",
        },
        pretty: true,
        customFooterHtml:
          '<script type="text/javascript" src="/gdpr-cookie-notice/dist/script.js"></script>' +
          '<script type="text/javascript" src="/js/cookie-consent.js"></script>' +
          '<link href="/gdpr-cookie-notice/dist/style.css" rel="stylesheet" />' +
          '<link href="/css/gdpr.css" rel="stylesheet" />',
      },
    },
  ],
  defaultCategory: "other",
  kindSortOrder: [
    "Reference",
    "Project",
    "Namespace",
    "Function",
    "Variable",
    "Enum",
    "EnumMember",
    "Class",
    "Interface",
    "TypeAlias",
    "Constructor",
    "Property",
    "Accessor",
    "Method",
    "Parameter",
    "TypeParameter",
    "TypeLiteral",
    "CallSignature",
    "ConstructorSignature",
    "IndexSignature",
    "GetSignature",
    "SetSignature",
    "Module",
  ],
  readme: "none",
  excludePrivate: true,
  excludeExternals: true,
  excludeInternal: true,
  excludeNotDocumented: true,
  excludeReferences: true,
  excludeNotDocumentedKinds: [
    "Module",
    "Namespace",
    "Enum",
    "EnumMember",
    "Variable",
    "Function",
    "Class",
    "Constructor",
    "Method",
    "CallSignature",
    "IndexSignature",
    "ConstructorSignature",
    "Accessor",
    "GetSignature",
    "SetSignature",
    "Reference",
  ],
  treatWarningsAsErrors: true,
  disableSources: true,
  validation: {
    notExported: true,
    invalidLink: true,
    rewrittenLink: true,
    notDocumented: false,
    unusedMergeModuleWith: true,
  },
};

export default config;
