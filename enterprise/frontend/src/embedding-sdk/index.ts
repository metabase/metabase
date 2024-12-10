// polyfills useSyncExternalStore for React 17
import "./lib/polyfill/use-sync-external-store";

import "metabase/lib/dayjs";

// we need to manually import them here to make sure they are included in the bundle
// as they're dynamically loaded in the main codebase
import "html2canvas-pro";
import "jspdf";

export * from "./hooks/public";
export * from "./components/public";
export * from "./lib/plugins";

export type { MetabaseAuthConfig } from "./types";

export type { MetabaseQuestion } from "./types/public/question";

export type {
  MetabaseFetchRequestTokenFn,
  MetabaseEmbeddingSessionToken,
} from "./types/refresh-token";

export type {
  MetabaseTheme,
  MetabaseColors,
  MetabaseComponentTheme,
} from "./types/theme";

export type { Dashboard as MetabaseDashboard } from "metabase-types/api";
