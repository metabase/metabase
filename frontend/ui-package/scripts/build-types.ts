/* eslint-disable no-console */
import { copyFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, relative, resolve } from "path";
import { fileURLToPath } from "url";

import ts from "typescript";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
)!;

const host = ts.createCompilerHost(config.options);

const program = ts.createProgram({
  rootNames: config.fileNames,
  options: config.options,
  host,
});
// /ui imports itself as `metabase/ui[/...]`, which consumers cannot resolve.
// An AST transformer (not a regex) only touches real module specifiers and
// resolves them with the same paths mapping that type-checking uses.
const selfImport = /^metabase\/ui(\/|$)/;
function relativizeSelfImports(
  context: ts.TransformationContext,
): ts.Transformer<ts.SourceFile | ts.Bundle> {
  const { factory } = context;
  return (root) => {
    if (!ts.isSourceFile(root)) {
      return root;
    }
    const rewrite = (specifier: string) => {
      const resolved = ts.resolveModuleName(
        specifier,
        root.fileName,
        config.options,
        host,
      ).resolvedModule;
      if (!resolved || !resolved.resolvedFileName.startsWith(`${uiDir}/`)) {
        throw new Error(
          `${root.fileName}: cannot resolve "${specifier}" inside /ui`,
        );
      }
      const target = resolved.resolvedFileName.replace(/(\.d)?\.(ts|tsx)$/, "");
      const path = relative(dirname(root.fileName), target);
      return path.startsWith(".") ? path : `./${path}`;
    };
    const literal = (node: ts.Node) =>
      ts.isStringLiteral(node) && selfImport.test(node.text)
        ? factory.createStringLiteral(rewrite(node.text))
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
        selfImport.test(node.name.text)
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
// declarations that its relative imports point to.
const augmentation = "types/src/metabase/ui/mantine";
mkdirSync(dirname(resolve(distDir, augmentation)), { recursive: true });
copyFileSync(
  resolve(uiDir, "mantine.d.ts"),
  resolve(distDir, `${augmentation}.d.ts`),
);

writeFileSync(
  resolve(distDir, "index.d.ts"),
  `import "./${augmentation}";\nexport * from "./types/ui-package/src/index";\n`,
);
console.log("Wrote declarations to dist/types and dist/index.d.ts");
