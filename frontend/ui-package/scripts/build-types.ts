/* eslint-disable no-console */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, relative, resolve } from "path";

import ts from "typescript";

import {
  APP_ALLOWLIST,
  isAllowedSourceFile,
  isAppCodeFile,
} from "./app-allowlist";

const packageDir = resolve(import.meta.dirname, "..");
const repoRoot = resolve(packageDir, "../..");
const uiDir = resolve(repoRoot, "frontend/src/metabase/ui");
const distDir = resolve(packageDir, "dist");

const configPath = resolve(packageDir, "tsconfig.lib.json");
const config = ts.getParsedCommandLineOfConfigFile(
  configPath,
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(String(d.messageText));
    },
  },
);
if (!config) {
  throw new Error(`Could not parse ${configPath}`);
}

const { options } = config;
const host = ts.createCompilerHost(options);

// Mantine does not export the types these inferred declarations need (TS2883, or an implicit
// `any`), and /ui stays unchanged, so annotate them in memory.
const mantine = (name: string) => `import("@mantine/core").${name}`;
const themeComponent = mantine("MantineThemeComponent");
const REPLACEMENTS: Record<string, [from: string, to: string]> = {
  "components/overlays/Menu/Menu.config.ts": [
    "export const menuOverrides = {",
    `export const menuOverrides: Record<"Menu" | "MenuSub", ${themeComponent}> = {`,
  ],
  "components/overlays/Popover/Popover.config.ts": [
    "export const popoverOverrides = {",
    `export const popoverOverrides: Record<"Popover", ${themeComponent}> = {`,
  ],
  "components/overlays/Modal/index.tsx": [
    "Modal.Content = MantineModal.Content;",
    `Modal.Content = MantineModal.Content as ${mantine("MantineComponent")}<{ props: ${mantine("ModalContentProps")}; ref: HTMLDivElement; stylesNames: "content" | "inner"; compound: true }>;`,
  ],
};
const getSourceFile = host.getSourceFile;
host.getSourceFile = (fileName, languageVersionOrOptions, ...rest) => {
  const file = getSourceFile(fileName, languageVersionOrOptions, ...rest);
  const replacement = REPLACEMENTS[relative(uiDir, fileName)];
  if (!file || !replacement) {
    return file;
  }
  const [from, to] = replacement;
  if (!file.text.includes(from)) {
    throw new Error(
      `${relative(repoRoot, fileName)}: build-types.ts REPLACEMENTS expects "${from}", which is not in the file; update or drop the replacement`,
    );
  }
  return ts.createSourceFile(
    fileName,
    file.text.replace(from, to),
    languageVersionOrOptions,
  );
};

const program = ts.createProgram({
  rootNames: config.fileNames,
  options,
  host,
});
// The same file rule as the JS build, applied to the program's sources.
const importerOf = new Map<string, string>();
for (const file of program.getSourceFiles()) {
  for (const { fileName: text } of ts.preProcessFile(file.text, true, true)
    .importedFiles) {
    const resolved = ts.resolveModuleName(text, file.fileName, options, host)
      .resolvedModule?.resolvedFileName;
    if (resolved && !importerOf.has(resolved)) {
      importerOf.set(resolved, file.fileName);
    }
  }
}
const outsideAllowlist = program
  .getSourceFiles()
  .filter(
    (file) =>
      isAppCodeFile(file.fileName) &&
      !isAllowedSourceFile(file.fileName) &&
      // Ambient declarations that tsconfig.lib.json lists itself.
      !(file.isDeclarationFile && config.fileNames.includes(file.fileName)),
  )
  .map((file) => {
    const importer = importerOf.get(file.fileName);
    return `${relative(repoRoot, file.fileName)}${importer ? ` (imported by ${relative(repoRoot, importer)})` : ""}`;
  });
if (outsideAllowlist.length > 0) {
  console.error(
    `App code outside the package allowlist (scripts/app-allowlist.ts):\n${outsideAllowlist.join("\n")}`,
  );
  process.exit(1);
}

// Node's ESM resolution (moduleResolution NodeNext) needs `.js` on every relative specifier.
// /ui also imports itself as `metabase/ui[/...]` and a few app files by alias, which consumers
// cannot resolve. Both are rewritten to a relative path to the resolved file, using the same
// resolver and paths mapping as type-checking.
const isRewritten = (specifier: string) =>
  specifier.startsWith(".") ||
  /^metabase\/ui(\/|$)/.test(specifier) ||
  specifier in APP_ALLOWLIST;
function rewriteSpecifier(containingFile: string, specifier: string) {
  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    options,
    host,
  ).resolvedModule;
  if (!resolved || !isAllowedSourceFile(resolved.resolvedFileName)) {
    throw new Error(
      `${containingFile}: cannot resolve "${specifier}" inside /ui or the app allowlist`,
    );
  }
  if (!/\.(ts|tsx)$/.test(resolved.resolvedFileName)) {
    throw new Error(
      `${containingFile}: "${specifier}" resolves to ${resolved.resolvedFileName}, which has no declaration to point to`,
    );
  }
  const target = resolved.resolvedFileName.replace(/(\.d)?\.(ts|tsx)$/, "");
  const path = relative(dirname(containingFile), target);
  return `${path.startsWith(".") ? path : `./${path}`}.js`;
}
function relativizeSelfImports(
  context: ts.TransformationContext,
): ts.Transformer<ts.SourceFile | ts.Bundle> {
  const { factory } = context;
  return (root) => {
    if (!ts.isSourceFile(root)) {
      return root;
    }
    const literal = (node: ts.Node) =>
      ts.isStringLiteral(node) && isRewritten(node.text)
        ? factory.createStringLiteral(
            rewriteSpecifier(root.fileName, node.text),
          )
        : undefined;
    const visit = (node: ts.Node): ts.Node => {
      if (ts.isImportDeclaration(node)) {
        const spec = literal(node.moduleSpecifier);
        if (spec) {
          return factory.updateImportDeclaration(
            node,
            node.modifiers,
            node.importClause,
            spec,
            node.attributes,
          );
        }
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const spec = literal(node.moduleSpecifier);
        if (spec) {
          return factory.updateExportDeclaration(
            node,
            node.modifiers,
            node.isTypeOnly,
            node.exportClause,
            spec,
            node.attributes,
          );
        }
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument)
      ) {
        const spec = literal(node.argument.literal);
        if (spec) {
          return factory.updateImportTypeNode(
            node,
            factory.updateLiteralTypeNode(node.argument, spec),
            node.attributes,
            node.qualifier,
            node.typeArguments,
            node.isTypeOf,
          );
        }
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        const spec = literal(node.moduleReference.expression);
        if (spec) {
          return factory.updateImportEqualsDeclaration(
            node,
            node.modifiers,
            node.isTypeOnly,
            node.name,
            factory.updateExternalModuleReference(node.moduleReference, spec),
          );
        }
      } else if (
        ts.isModuleDeclaration(node) &&
        ts.isStringLiteral(node.name) &&
        isRewritten(node.name.text)
      ) {
        throw new Error(
          `${root.fileName}: \`declare module "${node.name.text}"\` cannot be made relative`,
        );
      }
      return ts.visitEachChild(node, visit, context);
    };
    return ts.visitEachChild(root, visit, context);
  };
}

const result = program.emit(undefined, undefined, undefined, undefined, {
  afterDeclarations: [relativizeSelfImports],
});
const diagnostics = [
  ...ts.getPreEmitDiagnostics(program),
  ...result.diagnostics,
];
if (diagnostics.length > 0) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => packageDir,
      getNewLine: () => "\n",
    }),
  );
  process.exit(1);
}

// tsc does not emit .d.ts inputs, so copy the Mantine augmentation next to the
// declarations that its imports point to, rewriting its module specifiers.
const augmentation = "types/src/metabase/ui/mantine";
const augmentationPath = resolve(distDir, `${augmentation}.d.ts`);
mkdirSync(dirname(augmentationPath), { recursive: true });
const augmentationSource = resolve(uiDir, "mantine.d.ts");
const augmentationFile = ts.createSourceFile(
  augmentationSource,
  readFileSync(augmentationSource, "utf-8"),
  ts.ScriptTarget.Latest,
);
const specifierLiterals: ts.StringLiteral[] = [];
const collectSpecifiers = (node: ts.Node) => {
  const literal =
    ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
      ? node.moduleSpecifier
      : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
        ? node.argument.literal
        : undefined;
  if (literal && ts.isStringLiteral(literal) && isRewritten(literal.text)) {
    specifierLiterals.push(literal);
  }
  ts.forEachChild(node, collectSpecifiers);
};
collectSpecifiers(augmentationFile);
let augmentationText = augmentationFile.text;
for (const literal of specifierLiterals.reverse()) {
  augmentationText =
    augmentationText.slice(0, literal.getStart(augmentationFile) + 1) +
    rewriteSpecifier(augmentationSource, literal.text) +
    augmentationText.slice(literal.getEnd() - 1);
}
writeFileSync(augmentationPath, augmentationText);

writeFileSync(
  resolve(distDir, "index.d.ts"),
  `import "./${augmentation}.js";\nexport * from "./types/ui-package/src/index.js";\n`,
);
console.log("Wrote declarations to dist/types and dist/index.d.ts");
