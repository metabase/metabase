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

export type { SDKConfig } from "./types";

export type {
  FetchRequestTokenFn,
  EmbeddingSessionToken,
} from "./types/refresh-token";

export type {
  MetabaseTheme,
  MetabaseColors,
  MetabaseComponentTheme,
} from "./types/theme";

export type { Dashboard } from "metabase-types/api";
