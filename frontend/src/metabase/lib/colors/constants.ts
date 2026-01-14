import type { colorConfig } from "./colors";

// All color keys from colorConfig (~85 keys)
export type MetabaseColorV2 = keyof typeof colorConfig;

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
