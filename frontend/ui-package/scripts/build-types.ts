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

// tsc does not emit .d.ts inputs; ship the consumer augmentation, not the app's.
function copyDeclaration(path: string) {
  const source = resolve(repoRoot, "frontend", `${path}.d.ts`);
  const target = resolve(distDir, "types", `${path}.d.ts`);
  const file = ts.createSourceFile(
    source,
    readFileSync(source, "utf-8"),
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
  collectSpecifiers(file);
  let text = file.text;
  for (const literal of specifierLiterals.reverse()) {
    text =
      text.slice(0, literal.getStart(file) + 1) +
      rewriteSpecifier(source, literal.text) +
      text.slice(literal.getEnd() - 1);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

const augmentation = "ui-package/src/mantine-consumer";
copyDeclaration("src/metabase/ui/mantine-shared");
copyDeclaration(augmentation);

writeFileSync(
  resolve(distDir, "index.d.ts"),
  `import "./types/${augmentation}.js";\nexport * from "./types/ui-package/src/index.js";\n`,
);
writeFileSync(resolve(distDir, "css.d.ts"), "export {};\n");
console.log("Wrote declarations to dist/");
