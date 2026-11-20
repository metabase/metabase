import { resolve } from "path";

const src = resolve(import.meta.dirname, "../../src");

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
