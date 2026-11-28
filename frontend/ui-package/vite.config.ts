/* eslint-disable import/no-default-export */
import { createHash } from "crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { createRequire } from "module";
import { basename, dirname, relative, resolve } from "path";

import type { Plugin as PostcssPlugin } from "postcss";
import { type Plugin, defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

import type SharedPostcssConfig from "../../postcss.config.js";
import { SVGO_CONFIG } from "../build/shared/rspack/svgo-config.js";

import {
  APP_ALLOWLIST,
  isAllowedSourceFile,
  isAppCodeFile,
  toSourcePath,
} from "./scripts/app-allowlist";
import { readPackageJson } from "./scripts/package-json";

const require = createRequire(import.meta.url);
const packageDir = import.meta.dirname;
const repoRoot = resolve(packageDir, "../..");
const pkg = readPackageJson(resolve(packageDir, "package.json"));

const uiDir = resolve(repoRoot, "frontend/src/metabase/ui");
const esmAdapters = new Map([
  ["ttag", resolve(packageDir, "src/ttag.ts")],
  ["react-use", resolve(packageDir, "src/react-use.ts")],
]);

// Resolved from @svgr/webpack (a root dependency) so the root needs no @svgr/plugin-* entries.
const svgrRequire = createRequire(require.resolve("@svgr/webpack"));
const svgrPlugin = (name: string) => svgrRequire.resolve(name);

// The root postcss.config.js lists a repo-relative file, resolved against cwd.
process.chdir(repoRoot);
// Load from the repo so plugin resolution uses the shared config's location.
const postcssConfig = require(
  resolve(repoRoot, "postcss.config.js"),
) as typeof SharedPostcssConfig;

const externalNames = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];
const externalPattern = new RegExp(
  `^(${externalNames.map((n) => n.replace(/[/@.-]/g, "\\$&")).join("|")})(/|$)`,
);

// Unique per source file and `mbui-` prefixed, so it cannot collide with the
// app's or the embedding SDK's hashed class names.
function generateScopedName(name: string, filename: string) {
  const file = relative(repoRoot, filename);
  const hash = createHash("sha256")
    .update(`${file}:${name}`)
    .digest("base64url")
    .slice(0, 6);
  return `mbui-${basename(filename).replace(/\.module\.css$/, "")}-${name}-${hash}`;
}

// dayjs has no `exports` map, so Node's ESM resolver needs the extension.
function dayjsPluginExtension(): Plugin {
  return {
    name: "mbui-dayjs-plugin-extension",
    enforce: "pre",
    resolveId(id) {
      if (/^dayjs\/plugin\/\w+$/.test(id)) {
        return { id: `${id}.js`, external: true };
      }
    },
  };
}

function esmInterop(): Plugin {
  return {
    name: "mbui-esm-interop",
    enforce: "pre",
    resolveId(id, importer) {
      const adapter = esmAdapters.get(id);
      if (adapter) {
        return importer === adapter ? { id, external: true } : adapter;
      }
    },
  };
}

const APP_SPECIFIER =
  /^(metabase\/|metabase-types\/|metabase-lib\/|metabase-enterprise\/|embedding|cljs\/|assets\/|__support__\/)/;

// The root tsconfig maps `*` to frontend/src, which would silently bundle app code.
function rejectUndeclaredBareImports(): Plugin {
  return {
    name: "mbui-reject-undeclared-bare-imports",
    enforce: "pre",
    async resolveId(id, importer, options) {
      if (!importer) {
        return;
      }
      const file = relative(repoRoot, importer);
      if (
        !/^([./\\\0]|[A-Za-z]:)/.test(id) &&
        !id.startsWith("dayjs/plugin/") &&
        !externalPattern.test(id)
      ) {
        throw new Error(
          APP_SPECIFIER.test(id)
            ? `${file}: "${id}" is app code that the package may not import; only the files in scripts/app-allowlist.ts are allowed`
            : `${file}: "${id}" is not declared; add it to dependencies or peerDependencies in frontend/ui-package/package.json`,
        );
      }
      // Relative imports and aliased allowlist entries are checked by the file they resolve to.
      const resolved = await this.resolve(id, importer, {
        ...options,
        skipSelf: true,
      });
      const path = resolved && !resolved.external && toSourcePath(resolved.id);
      if (path && isAppCodeFile(path) && !isAllowedSourceFile(path)) {
        throw new Error(
          `${file}: imports ${relative(repoRoot, path)}, which is app code outside the package allowlist (scripts/app-allowlist.ts)`,
        );
      }
    },
  };
}

function rejectUnlistedCssImports(): PostcssPlugin {
  return {
    postcssPlugin: "mbui-reject-unlisted-css-imports",
    OnceExit(_, { result }) {
      for (const message of result.messages) {
        const file: unknown = message.file;
        const parent: unknown = message.parent;
        if (
          message.type === "dependency" &&
          message.plugin === "postcss-import" &&
          typeof file === "string" &&
          isAppCodeFile(file) &&
          !isAllowedSourceFile(file)
        ) {
          const importer =
            typeof parent === "string" ? relative(repoRoot, parent) : "CSS";
          throw new Error(
            `${importer}: imports ${relative(repoRoot, file)}, which is app code outside the package allowlist (scripts/app-allowlist.ts)`,
          );
        }
      }
    },
  };
}

const stripSpace = (text: string) => text.replace(/\s+/g, "");

// The baseline must stay identical to what the Mantine patch removes from styles.css.
function assertBaselineMatchesPatch(baseline: string) {
  const patchesDir = resolve(repoRoot, "patches");
  const patchFile = readdirSync(patchesDir).find((f) =>
    /^@mantine\+core\+.*\.patch$/.test(f),
  );
  if (!patchFile) {
    throw new Error("patches/@mantine+core+*.patch not found");
  }
  const section = readFileSync(resolve(patchesDir, patchFile), "utf-8")
    .split(/^diff --git /m)
    .find((part) => part.startsWith("a/node_modules/@mantine/core/styles.css"));
  const removed = (section ?? "")
    .split("\n")
    .filter((line) => line.startsWith("-") && !line.startsWith("---"))
    .map((line) => line.slice(1))
    .join("\n");
  const withoutComment = baseline.replace(/^\s*\/\*.*?\*\/\s*/s, "");
  if (
    !removed.trim() ||
    !stripSpace(withoutComment).startsWith(stripSpace(removed))
  ) {
    throw new Error(
      `src/baseline.css no longer starts with the block that ${patchFile} removes ` +
        "from @mantine/core/styles.css. Update baseline.css to match the patch.",
    );
  }
}

function writeIconExports(dist: string) {
  const iconSource = "src/metabase/ui/components/icons/Icon/icons";
  const iconExports = resolve(dist, "icons");
  mkdirSync(iconExports, { recursive: true });

  for (const file of readdirSync(resolve(repoRoot, "frontend", iconSource))) {
    if (!file.endsWith(".svg")) {
      continue;
    }
    const name = basename(file, ".svg");
    const module = `${iconSource}/${name}.js`;
    if (!existsSync(resolve(dist, module))) {
      continue;
    }
    writeFileSync(
      resolve(iconExports, `${name}.js`),
      `export { default } from "../${module}";\n`,
    );
    writeFileSync(
      resolve(iconExports, `${name}.d.ts`),
      `import type { ForwardRefExoticComponent, SVGProps } from "react";
declare const Icon: ForwardRefExoticComponent<SVGProps<SVGSVGElement>>;
export default Icon;
`,
    );
  }
}

function stylesAndFonts(): Plugin {
  const dist = resolve(packageDir, "dist");
  let failed = false;
  let write = true;
  return {
    name: "mbui-styles-and-fonts",
    configResolved(config) {
      write = config.build.write;
    },
    buildEnd(error) {
      failed = Boolean(error);
    },
    closeBundle() {
      // Let the original build error surface instead of a follow-up one.
      if (failed || !write) {
        return;
      }
      writeIconExports(dist);
      const cssFiles = readdirSync(dist).filter((f) => f.endsWith(".css"));
      if (cssFiles.length !== 1) {
        throw new Error(`Expected one CSS file, got: ${cssFiles.join(", ")}`);
      }
      const read = (id: string) => readFileSync(require.resolve(id), "utf-8");
      const mantineCore = read("@mantine/core/styles.css");
      if (mantineCore.includes("color-scheme: var(--mantine-color-scheme)")) {
        throw new Error(
          "@mantine/core/styles.css already contains Mantine's baseline, so the " +
            "repo patch (patches/@mantine+core) is gone. Delete src/baseline.css " +
            "and its use in vite.config.ts to avoid duplicating it.",
        );
      }
      const baseline = readFileSync(
        resolve(packageDir, "src/baseline.css"),
        "utf-8",
      );
      assertBaselineMatchesPatch(baseline);
      // Element selectors only, so the order against Mantine's classes is irrelevant.
      const styles = [
        baseline,
        mantineCore,
        read("@mantine/dates/styles.css"),
        readFileSync(resolve(dist, cssFiles[0]), "utf-8"),
      ].join("\n");
      rmSync(resolve(dist, cssFiles[0]));
      writeFileSync(resolve(dist, "styles.css"), styles);

      copyFileSync(
        resolve(repoRoot, "LICENSE-AGPL.txt"),
        resolve(packageDir, "LICENSE.txt"),
      );

      for (const name of ["core", "dates"]) {
        const stylesPath = require.resolve(`@mantine/${name}/styles.css`);
        copyFileSync(
          resolve(dirname(stylesPath), "LICENSE"),
          resolve(dist, `mantine-${name}-LICENSE.txt`),
        );
      }

      const fonts = readFileSync(resolve(packageDir, "src/fonts.css"), "utf-8");
      writeFileSync(resolve(dist, "fonts.css"), fonts);
      const fontDir = resolve(dist, "fonts/Lato");
      mkdirSync(fontDir, { recursive: true });
      copyFileSync(
        resolve(repoRoot, "frontend/fonts/Lato/OFL.txt"),
        resolve(fontDir, "OFL.txt"),
      );
      for (const [, file] of fonts.matchAll(
        /url\("\.\/fonts\/Lato\/([^"]+)"\)/g,
      )) {
        copyFileSync(
          resolve(repoRoot, "frontend/fonts/Lato", file),
          resolve(fontDir, file),
        );
      }
    },
  };
}

export default defineConfig({
  root: packageDir,
  plugins: [
    svgr({
      include: "**/*.svg?component",
      svgrOptions: {
        // Same SVGR options as the `*.svg?component` rule in rspack.main.config.js
        ref: true,
        svgoConfig: SVGO_CONFIG,
        plugins: [
          svgrPlugin("@svgr/plugin-svgo"),
          svgrPlugin("@svgr/plugin-jsx"),
        ],
      },
    }),
    rejectUndeclaredBareImports(),
    dayjsPluginExtension(),
    esmInterop(),
    stylesAndFonts(),
  ],
  resolve: {
    // Only /ui self-imports and the allowlisted app files; any other `metabase/...` fails the build.
    alias: [
      ...Object.entries(APP_ALLOWLIST).map(([specifier, replacement]) => ({
        find: new RegExp(`^${specifier.replace(/[./]/g, "\\$&")}$`),
        replacement,
      })),
      { find: /^metabase\/ui$/, replacement: `${uiDir}/index.ts` },
      { find: /^metabase\/ui\//, replacement: `${uiDir}/` },
    ],
  },
  // No `process` in a consumer's browser; NODE_ENV is left to their bundler.
  define: {
    "process.env.STORYBOOK": "undefined",
    "process.env.WEBPACK_BUNDLE": "undefined",
    "process.env.MB_LOG_ANALYTICS": "undefined",
    "process.env.MB_LOG_CHARTS_DEBUG": "undefined",
  },
  css: {
    postcss: {
      // Use the shared PostCSS pipeline and check the dependencies it resolves.
      plugins: [...postcssConfig.plugins, rejectUnlistedCssImports()],
    },
    modules: { generateScopedName },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: false,
    lib: {
      entry: {
        index: resolve(packageDir, "src/index.ts"),
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- build entry filename
        slim: resolve(packageDir, "src/SlimMetabaseUIProvider.tsx"),
      },
      formats: ["es"],
    },
    rolldownOptions: {
      external: (id) =>
        !esmAdapters.has(id) &&
        !id.startsWith("dayjs/plugin/") &&
        externalPattern.test(id),
      output: {
        preserveModules: true,
        preserveModulesRoot: resolve(repoRoot, "frontend"),
        entryFileNames: "[name].js",
      },
    },
  },
});
