import { createContext, useContext } from "react";

import type { ColorName } from "metabase/ui/colors/types";

/**
 * The permissions editor's single accent color. The selected-row highlight,
 * the entity link, and the "You've made changes" bar all derive their shades
 * from this one value (via `color()`/`alpha()` at each call site), so a host
 * overriding it only has one lever to pull rather than several tokens to keep
 * in sync.
 *
 * Admin's own purple by default -- protected from whitelabeling
 * (`protected-colors.ts`), so it always reads as Metabase's own chrome
 * there. The embedding hub mounts the same editor on its own blue-branded
 * surface and overrides it via `PermissionsBasePath`.
 */
const ADMIN_ACCENT_COLOR: ColorName = "accent7";

const PermissionsAccentColorContext =
  createContext<ColorName>(ADMIN_ACCENT_COLOR);

export const PermissionsAccentColorProvider =
  PermissionsAccentColorContext.Provider;

export function usePermissionsAccentColor() {
  return useContext(PermissionsAccentColorContext);
}
