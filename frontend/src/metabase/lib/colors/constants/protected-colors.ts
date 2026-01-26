import type { MetabaseColorKey } from "../types/color-keys";

/**
 * Colors that should not be exposed to modular embedding.
 * For example, the Metabase brand color must not be modifiable.
 */
export const PROTECTED_COLORS = [
  // Metabase's own brand
  "metabase-brand",

  // Admin-only UI colors
  "admin-navbar",
  "admin-navbar-secondary",
  "admin-navbar-inverse",

  // Colors based on specific base colors
  "bg-ocean-alpha-light",

  // Accent colors must be set thru the `chartColors` API, not set directly
  "accent0",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "accent7",

  // Grey accent colors
  "accent-gray",
  "accent-gray-dark",
  "accent-gray-light",
] as const satisfies readonly MetabaseColorKey[];
