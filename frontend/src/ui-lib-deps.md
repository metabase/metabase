# `ui` ↔ `lib` cross-module dependencies

## `ui` → `lib` imports (4)

| File | Import |
|---|---|
| `ui/components/theme/ThemeProvider/ThemeProvider.tsx:20` | `import { PUT } from "metabase/lib/api"` |
| `ui/components/theme/ThemeProvider/ThemeProvider.tsx:21` | `import { parseHashOptions } from "metabase/lib/browser"` |
| `ui/components/theme/ThemeProvider/ThemeProvider.tsx:22` | `import MetabaseSettings from "metabase/lib/settings"` |
| `ui/components/data-display/TreeTable/hooks/useColumnSizing.tsx:10` | `import { renderRoot } from "metabase/lib/react-compat"` |

## `lib` → `ui` imports (4)

| File | Import |
|---|---|
| `lib/icon.ts:4` | `import type { IconName } from "metabase/ui"` |
| `lib/schema_metadata.ts:2` | `import type { IconName } from "metabase/ui"` |
| `lib/core.ts:3` | `import type { IconName } from "metabase/ui"` |
| `lib/timelines.ts:5` | `import type { IconName } from "metabase/ui"` |

**Notable:** All 4 `lib → ui` imports are **type-only** (`import type`), so they have no runtime effect. The `ui → lib` imports are runtime imports.
