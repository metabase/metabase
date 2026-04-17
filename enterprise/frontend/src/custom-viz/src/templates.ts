import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { version } from "../package.json";

import gitignoreTemplate from "./templates/.gitignore?raw";
import iconSvgTemplate from "./templates/icon.svg?raw";
import indexTsxTemplate from "./templates/index.tsx?raw";
import manifestTemplate from "./templates/metabase-plugin.json?raw";
import packageLockJsonTemplate from "./templates/package-lock.json?raw";
import packageJsonTemplate from "./templates/package.json?raw";
import tsconfigTemplate from "./templates/tsconfig.json?raw";
import viteConfigTemplate from "./templates/vite.config.ts?raw";

const NAME_PLACEHOLDER = "__CUSTOM_VIZ_NAME__";
const VERSION_PLACEHOLDER = "__CUSTOM_VIZ_VERSION__";

function replaceName(template: string, name: string): string {
  return template.split(NAME_PLACEHOLDER).join(name);
}

function replaceImportPath(template: string): string {
  // Template uses ../ to import SDK locally for TS-checking purposes.
  return template.replace("../", "@metabase/custom-viz");
}

export function generatePackageJson(name: string): string {
  return replaceName(packageJsonTemplate, name)
    .split(VERSION_PLACEHOLDER)
    .join(version);
}

export function generatePackageLockJson(name: string): string {
  return replaceName(packageLockJsonTemplate, name)
    .split(VERSION_PLACEHOLDER)
    .join(version);
}

export function generateViteConfig(): string {
  return viteConfigTemplate;
}

export function generateTsConfig(): string {
  return tsconfigTemplate;
}

export function generateIndexTsx(name: string): string {
  return replaceName(replaceImportPath(indexTsxTemplate), name);
}

export function generateManifest(name: string): string {
  return replaceName(manifestTemplate, name);
}

export function generateIconSvg(): string {
  return iconSvgTemplate;
}

// Binary templates can't use ?raw imports, so we read them from disk.
// The build step copies src/templates/ to dist/templates/.
const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "templates",
);

export function readBinaryTemplate(filename: string): Buffer {
  return readFileSync(join(TEMPLATES_DIR, filename));
}

export function generateGitignore(): string {
  return gitignoreTemplate;
}
