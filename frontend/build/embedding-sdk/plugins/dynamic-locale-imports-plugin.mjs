import fs from "node:fs/promises";
import path from "path";

import glob from "glob";

const DYNAMIC_IMPORT_REGEX =
  /\bimport(\s*(\/\*[\s\S]*?\*\/|\/\/.*))*\s*\(([^)]+)\)/g;

export const dynamicLocaleImportsPlugin = ({
  basePath,
  filter,
  libraryLocalePaths,
}) => {
  const nodeModulesPath = path.join(basePath, "node_modules");

  const availableLocales = glob
    .sync(path.join(basePath, "resources/i18n/*"))
    .map((localePath) => path.parse(localePath).name);

  const localePathsByLibrary = libraryLocalePaths.reduce(
    (acc, libraryLocalePath) => {
      const libraryLocaleGlobPath = path.join(libraryLocalePath, "*");

      const foundLocales = glob.sync(libraryLocaleGlobPath, {
        cwd: nodeModulesPath,
      });
      const filteredLocales = foundLocales.filter((localePath) => {
        const localeName = path.parse(localePath).name;

        return availableLocales.includes(localeName);
      });

      acc[libraryLocalePath] = filteredLocales;

      return acc;
    },
    {},
  );

  return {
    name: "dynamic-import",
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        const { path: resolvePath } = args;

        let contents = await fs.readFile(resolvePath, "utf8");

        const matches = contents.matchAll(DYNAMIC_IMPORT_REGEX);

        let dynamicImportIndex = -1;

        for (const match of matches) {
          // eslint-disable-next-line no-unused-vars
          const [full, _, __, importPath] = match;

          if (
            !libraryLocalePaths.some((libraryLocalePath) =>
              importPath.startsWith(`\`${libraryLocalePath}`),
            ) ||
            !importPath.endsWith("`") ||
            !importPath.includes("${")
          ) {
            continue;
          }

          const targetLibraryLocalePaths = libraryLocalePaths.find(
            (libraryLocalePath) => importPath.includes(libraryLocalePath),
          );
          const localePaths = localePathsByLibrary[targetLibraryLocalePaths];

          const caseStatements = localePaths
            .map(
              (localeImport) =>
                `case '${localeImport}': return import('${localeImport}');`,
            )
            .join("\n");

          dynamicImportIndex++;

          const adjustedContent = contents.replace(
            full,
            full.replace(
              "import",
              `__dynamicLocaleImportRuntime${dynamicImportIndex}__`,
            ),
          );

          contents =
            `function __dynamicLocaleImportRuntime${dynamicImportIndex}__(path) {
              switch (path) {
                ${caseStatements}
                default:
                  return Promise.resolve().then(() => {
                    throw new Error("Unknown variable dynamic import: " + path)
                  })
              }
            }` + adjustedContent;
        }

        return dynamicImportIndex === -1 ? null : { contents, loader: "js" };
      });
    },
  };
};
