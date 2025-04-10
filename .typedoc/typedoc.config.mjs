const EMBEDDING_SDK_DOCS_MAIN_PAGE_URL =
  "/docs/latest/embedding/sdk/introduction";

/** @type {Partial<import("typedoc").TypeDocOptions>} */
const config = {
  name: "Embedding SDK API",
  tsconfig: "./tsconfig.sdk-docs.json",
  plugin: [
    "typedoc-plugin-missing-exports",
    "typedoc-plugin-mdn-links",
    "./typedoc-plugin-frontmatter.js",
  ],
  entryPoints: ["../resources/embedding-sdk/dist/index.d.ts"],
  router: "structure",
  internalModule: "internal",
  outputs: [
    {
      name: "html",
      path: "../docs/embedding/sdk/api",
      options: {
        favicon: "./resources/frontend_client/favicon.ico",
        customJs: "./.typedoc/page-custom-logic.js",
        customCss: "./.typedoc/page-custom-styles.css",
        hideGenerator: true,
        collapseInternalModule: true,
        visibilityFilters: {},
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
  includeHierarchySummary: false,
  navigation: {
    includeCategories: true,
    includeGroups: false,
    includeFolders: false,
    compactFolders: true,
    excludeReferences: true,
  },
  validation: {
    notExported: true,
    invalidLink: true,
    rewrittenLink: true,
    notDocumented: false,
    unusedMergeModuleWith: true,
  },
  externalSymbolLinkMappings: {
    "@mantine/core": {
      "*": "https://v7.mantine.dev/overview",
      ButtonProps: "https://v7.mantine.dev/core/button/?t=props",
      MenuProps: "https://v7.mantine.dev/core/menu/?t=props",
      PopoverProps: "https://v7.mantine.dev/core/popover/?t=props",
      StackProps: "https://v7.mantine.dev/core/stack/?t=props",
    },
  },
  navigationLinks: {
    "Back to documentation": `javascript:navigateBack({ fallbackUrl: '${EMBEDDING_SDK_DOCS_MAIN_PAGE_URL}' })`,
  },
};

export default config;
