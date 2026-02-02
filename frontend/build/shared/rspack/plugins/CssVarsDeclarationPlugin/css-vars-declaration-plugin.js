// @ts-check
/* eslint-env node */
const fs = require("fs");
const path = require("path");

const { Project } = require("ts-morph");

const PLUGIN_NAME = "CssVarsDeclarationPlugin";

/**
 * @typedef {Object} ExtractionSource
 * @property {string} [file] - Path to source file (defaults to config's path)
 * @property {"objectKeys" | "unionType"} type - Extraction method
 * @property {string[]} names - Variable or type alias names to extract from
 * @property {string} [varPrefix] - Prefix to add to extracted values (e.g. "--mb-color-")
 */

/**
 * @typedef {Object} CssVarConfig
 * @property {string} path - File path (relative to frontendSrcPath), output is derived as .d.css
 * @property {string[]} [staticVars] - Static CSS variable names to include
 * @property {ExtractionSource[]} [sources] - Extraction sources
 */

/** @type {CssVarConfig[]} */
const CSS_VAR_CONFIGS = [
  {
    path: "metabase/embedding-sdk/theme/css-vars-to-sdk-theme.ts",
    sources: [
      {
        type: "objectKeys",
        names: [
          "CSS_VARIABLES_TO_SDK_THEME_MAP",
          "COLLECTION_BROWSER_THEME_OPTIONS",
        ],
      },
    ],
  },
  {
    path: "metabase/embedding-sdk/theme/dynamic-css-vars-config.ts",
    sources: [{ type: "objectKeys", names: ["DYNAMIC_CSS_VARIABLES"] }],
  },
  {
    path: "metabase/styled-components/theme/css-variables.ts",
    staticVars: [
      "--mb-default-monospace-font-family",
      "--mb-default-font-family",
    ],
  },
  {
    path: "metabase/lib/colors/types/color-keys.ts",
    sources: [
      {
        type: "unionType",
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- referencing TypeScript type names
        names: ["MetabaseColorKey"],
        varPrefix: "--mb-color-",
      },
    ],
  },
];

/**
 * Rspack plugin that generates .d.css files for CSS variables defined in TypeScript files.
 * These provide IDE autocomplete for --mb-* CSS variables.
 * Only runs in development mode.
 */
class CssVarsDeclarationPlugin {
  /** @type {string} */
  #frontendSrcPath;
  /** @type {string} */
  #rootPath;
  /** @type {CssVarConfig[]} */
  #configs;

  /**
   * @param {{ frontendSrcPath: string, rootPath: string, configs?: CssVarConfig[] }} options
   */
  constructor({ frontendSrcPath, rootPath, configs }) {
    this.#frontendSrcPath = frontendSrcPath;
    this.#rootPath = rootPath;
    this.#configs = configs ?? CSS_VAR_CONFIGS;
  }

  /**
   * @param {import('@rspack/core').Compiler} compiler
   */
  apply(compiler) {
    // `environment` runs once per compiler init, not on HMR rebuilds
    compiler.hooks.environment.tap(PLUGIN_NAME, () => {
      this.#generateAllDeclarationFiles();
    });
  }

  #generateAllDeclarationFiles() {
    const project = new Project({
      tsConfigFilePath: path.join(this.#rootPath, "tsconfig.json"),
      skipAddingFilesFromTsConfig: true,
    });

    for (const config of this.#configs) {
      this.#processConfig(project, config);
    }
  }

  /**
   * @param {Project} project
   * @param {CssVarConfig} config
   */
  #processConfig(project, config) {
    const cssVars = new Set();

    // Add static variables
    for (const staticVar of config.staticVars ?? []) {
      cssVars.add(staticVar);
    }

    // Process each extraction source
    for (const source of config.sources ?? []) {
      const relativePath = source.file ?? config.path;
      const filePath = path.join(this.#frontendSrcPath, relativePath);

      if (!fs.existsSync(filePath)) {
        this.#warn(`Source file not found: ${relativePath}`);
        continue;
      }

      const sourceFile = project.addSourceFileAtPath(filePath);
      const extracted = new Set();

      for (const name of source.names) {
        switch (source.type) {
          case "objectKeys":
            this.#extractObjectKeys(sourceFile, name, extracted);
            break;
          case "unionType":
            this.#extractUnionTypeStrings(sourceFile, name, extracted);
            break;
        }
      }

      // Apply prefix and add to result
      const prefix = source.varPrefix ?? "";
      for (const value of extracted) {
        cssVars.add(`${prefix}${value}`);
      }
    }

    const outputPath = config.path.replace(/\.ts$/, ".d.css");
    this.#writeCssDeclarationFile(
      path.join(this.#frontendSrcPath, outputPath),
      cssVars,
    );
  }

  /**
   * @param {string} message
   */
  #warn(message) {
    console.warn(`\x1b[33m[${PLUGIN_NAME}] WARNING: ${message}\x1b[0m`);
  }

  /**
   * Extract --mb-* keys from an object literal variable.
   * @param {import('ts-morph').SourceFile} sourceFile
   * @param {string} varName
   * @param {Set<string>} result
   */
  #extractObjectKeys(sourceFile, varName, result) {
    const decl = sourceFile.getVariableDeclaration(varName);
    if (!decl) {
      this.#warn(
        `Variable "${varName}" not found in ${sourceFile.getBaseName()}`,
      );
      return;
    }

    const initializer = this.#unwrapExpression(decl.getInitializer());
    if (
      !initializer ||
      initializer.getKindName() !== "ObjectLiteralExpression"
    ) {
      return;
    }

    const objLiteral =
      /** @type {import('ts-morph').ObjectLiteralExpression} */ (initializer);

    for (const prop of objLiteral.getProperties()) {
      if (prop.getKindName() === "PropertyAssignment") {
        const propAssignment =
          /** @type {import('ts-morph').PropertyAssignment} */ (prop);
        const name = propAssignment.getName();
        const cleanName = name.replace(/^["']|["']$/g, "");

        if (cleanName.startsWith("--mb-")) {
          result.add(cleanName);
        }
      }
    }
  }

  /**
   * Extract string literals from a union type alias.
   * Uses the type checker to fully resolve nested type references
   * and indexed access types (e.g. `(typeof FOO)[number]`).
   * @param {import('ts-morph').SourceFile} sourceFile
   * @param {string} typeName
   * @param {Set<string>} result
   */
  #extractUnionTypeStrings(sourceFile, typeName, result) {
    const typeAlias = sourceFile.getTypeAlias(typeName);
    if (!typeAlias) {
      this.#warn(
        `Type alias "${typeName}" not found in ${sourceFile.getBaseName()}`,
      );
      return;
    }

    const resolvedType = typeAlias.getType();
    if (resolvedType.isUnion()) {
      for (const member of resolvedType.getUnionTypes()) {
        if (member.isStringLiteral()) {
          result.add(/** @type {string} */ (member.getLiteralValue()));
        }
      }
    }
  }

  /**
   * Unwrap SatisfiesExpression and AsExpression to get the underlying expression.
   * @param {import('ts-morph').Expression | undefined} expr
   * @returns {import('ts-morph').Expression | undefined}
   */
  #unwrapExpression(expr) {
    if (!expr) {
      return expr;
    }

    while (
      expr.getKindName() === "SatisfiesExpression" ||
      expr.getKindName() === "AsExpression"
    ) {
      if (expr.getKindName() === "SatisfiesExpression") {
        expr = /** @type {import('ts-morph').SatisfiesExpression} */ (
          expr
        ).getExpression();
      } else if (expr.getKindName() === "AsExpression") {
        expr = /** @type {import('ts-morph').AsExpression} */ (
          expr
        ).getExpression();
      }
    }

    return expr;
  }

  /**
   * Write CSS declaration file.
   * @param {string} outputPath
   * @param {Set<string>} cssVars
   */
  #writeCssDeclarationFile(outputPath, cssVars) {
    const sortedVars = Array.from(cssVars).sort();
    const content = [
      "/* Auto-generated by CssVarsDeclarationPlugin. Do not edit. */",
      ":root {",
      ...sortedVars.map((v) => `  ${v}: ;`),
      "}",
      "",
    ].join("\n");

    fs.writeFileSync(outputPath, content);
    // eslint-disable-next-line no-console
    console.log(`[${PLUGIN_NAME}] Generated ${path.basename(outputPath)}`);
  }
}

module.exports.CssVarsDeclarationPlugin = CssVarsDeclarationPlugin;
