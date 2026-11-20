import { relative, resolve, sep } from "path";

const packageDir = resolve(import.meta.dirname, "..");
export const repoRoot = resolve(packageDir, "../..");
const src = resolve(repoRoot, "frontend/src");

// The only app files /ui may import (exact specifier -> file). Anything else fails the build.
export const APP_ALLOWLIST: Record<string, string> = {
  "metabase-types/api/color-settings": `${src}/metabase-types/api/color-settings.ts`,
  "metabase-types/api/icon": `${src}/metabase-types/api/icon.ts`,
  "metabase/utils/color-scheme": `${src}/metabase/utils/color-scheme.ts`,
  "metabase/utils/resize-observer": `${src}/metabase/utils/resize-observer.ts`,
  "metabase/utils/measure-container": `${src}/metabase/utils/measure-container.ts`,
  "metabase/utils/csp": `${src}/metabase/utils/csp.ts`,
  "metabase/utils/focus-visible": `${src}/metabase/utils/focus-visible.ts`,
  "metabase/utils/key-labels": `${src}/metabase/utils/key-labels.ts`,
  "metabase/utils/deep-merge": `${src}/metabase/utils/deep-merge.ts`,
  // Type-only import of deep-merge.
  "metabase-types/utils/types": `${src}/metabase-types/utils/types.ts`,
  "metabase/env": `${src}/metabase/env.ts`,
  // Its locale loader is unused by /ui, so the bundler drops it; check-dist verifies that.
  "metabase/dayjs": `${src}/metabase/dayjs/index.ts`,
  "metabase/css/core/animation.module.css": `${src}/metabase/css/core/animation.module.css`,
  "metabase/css/core/layout.module.css": `${src}/metabase/css/core/layout.module.css`,
  "metabase/css/core/z-index.module.css": `${src}/metabase/css/core/z-index.module.css`,
};

// Imported relatively by an allowlisted file, so it has no specifier of its own.
export const APP_RELATIVE_ONLY_FILES: readonly string[] = [
  `${src}/metabase/dayjs/parse-zone-plugin.ts`,
];

const ALLOWED_DIRS = [`${src}/metabase/ui/`, `${packageDir}/src/`];
const ALLOWED_FILES = new Set([
  ...Object.values(APP_ALLOWLIST),
  ...APP_RELATIVE_ONLY_FILES,
]);

export const isAllowedSourceFile = (file: string) =>
  ALLOWED_FILES.has(file) || ALLOWED_DIRS.some((dir) => file.startsWith(dir));

// App code lives under frontend/ or enterprise/; node_modules, virtual ids and the like do not.
export function isAppCodeFile(file: string) {
  const parts = relative(repoRoot, file).split(sep);
  return (
    (parts[0] === "frontend" || parts[0] === "enterprise") &&
    !parts.includes("node_modules")
  );
}

// Strips a query string (`?component`); undefined for virtual ids and non-absolute ids.
export function toSourcePath(id: string) {
  const path = id.split("?")[0];
  return path.startsWith("/") ? path : undefined;
}
