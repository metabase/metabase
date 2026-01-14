import type { MetabaseColorKey } from "../types";

/**
 * Colors that cannot be modified by Modular Embedding users.
 * For example, the Metabase brand color must always be the same.
 */
export const PROTECTED_COLORS = [
  // Metabase's own brand
  "metabase-brand",

  // Admin-only UI colors
  "admin-navbar",
  "admin-navbar-secondary",
  "admin-navbar-inverse",
] as const satisfies readonly MetabaseColorKey[];
