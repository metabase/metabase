import { createContext, useContext } from "react";

import type { ColorName } from "metabase/ui/colors/types";

export type PermissionsSelectionColors = {
  /** The selected group/database row's background. */
  selected: ColorName;
  /** The hover background for an unselected row. */
  hover: ColorName;
  /** The entity name link color in the permissions table. */
  link: ColorName;
};

/**
 * Admin's own purple -- protected from whitelabeling (`protected-colors.ts`),
 * so the permissions editor always reads as Metabase's own chrome there.
 */
const ADMIN_SELECTION_COLORS: PermissionsSelectionColors = {
  selected: "navbar-admin",
  hover: "navbar-admin-secondary",
  link: "navbar-admin-inverse",
};

const PermissionsSelectionColorContext =
  createContext<PermissionsSelectionColors>(ADMIN_SELECTION_COLORS);

/**
 * Lets a host other than admin -- the embedding hub mounts this same editor
 * on its own blue-branded surface -- swap the selected-row and link colors
 * without forking `AdminTreeNode` or `EntityNameLink`. Set via
 * `PermissionsBasePath`, alongside the other per-mount overrides.
 */
export const PermissionsSelectionColorProvider =
  PermissionsSelectionColorContext.Provider;

export function usePermissionsSelectionColors() {
  return useContext(PermissionsSelectionColorContext);
}
