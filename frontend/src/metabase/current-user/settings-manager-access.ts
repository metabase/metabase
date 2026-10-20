import { SETTINGS_INDEX_SLUG } from "metabase/urls";

/**
 * Pages under /admin/settings that settings managers may open, by slug. Matching is
 * exact, so a page nested under an allowed one is admin-only until listed here.
 */
export const SETTINGS_MANAGER_PATHS: ReadonlySet<string> = new Set([
  "general",
  "email",
  "slack",
  "webhooks",
  "localization",
  "maps",
  "uploads",
  "public-sharing",
  "domains",
  "appearance",
  "whitelabel",
  "whitelabel/branding",
  "whitelabel/conceal-metabase",
]);

export function isSettingsManagerPath(slug: string | undefined): boolean {
  if (slug == null) {
    return false;
  }
  const normalized = slug.replace(/^\/+|\/+$/g, "");
  const redirected = normalized === "" ? SETTINGS_INDEX_SLUG : normalized;
  return SETTINGS_MANAGER_PATHS.has(redirected);
}

/** `/admin/settings/whitelabel/branding/` -> `whitelabel/branding` */
export function getSettingsSlug(pathname: string): string | undefined {
  const match = pathname.match(/^\/admin\/settings(?:\/(.*))?$/);
  return match ? (match[1] ?? "") : undefined;
}
