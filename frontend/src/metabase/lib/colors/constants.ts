import type { MetabaseColorKey } from "./types";

/** @deprecated Use MetabaseColorKey from "./types" instead */
export type MetabaseColorV2 = MetabaseColorKey;

// Colors not exposed to Modular Embedding.
export const INTERNAL_COLORS = [
  // Metabase's own brand
  "metabase-brand",

  // Admin-only UI colors
  "admin-navbar",
  "admin-navbar-secondary",
  "admin-navbar-inverse",
] as const satisfies readonly MetabaseColorV2[];

export type InternalColorKey = (typeof INTERNAL_COLORS)[number];
