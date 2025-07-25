const EMBEDDING_SDK_DOCS_MAIN_PAGE_URL =
  "/docs/latest/embedding/sdk/introduction";

/** @type {import("typedoc").TypeDocOptions} */
const config = {
  name: "Embedded analytics SDK API",
  tsconfig: "./tsconfig.sdk-docs.json",
  plugin: [
    "typedoc-plugin-mdn-links",
    "typedoc-plugin-dt-links",
    "typedoc-plugin-redirect",
    "./typedoc-plugin-replace-text.js",
  ],
  entryPoints: ["../resources/embedding-sdk/dist/index.d.ts"],
  router: "structure",
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
  sort: ["kind", "alphabetical"],
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
  disableSources: true,
  includeHierarchySummary: false,
  navigation: {
    includeCategories: true,
    includeGroups: false,
    includeFolders: false,
    compactFolders: true,
    excludeReferences: true,
  },
  treatWarningsAsErrors: false,
  treatValidationWarningsAsErrors: true,
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
  replaceText: {
    // To properly inject custom header tags
    '<meta\\s+name="description"[^>]*>':
      "{% include docs/embedded-analytics-sdk-metadata.html %}",
    // For some reason typedoc updates data-refl value having the same visual output
    // This data attribute is used for full hierarchy page, but we don't use it, it is disabled, so we can safely remove the attribute
    ' data-refl="[^"]*"': "",
  },
  logLevel: "Warn",
};

module.exports = config;
