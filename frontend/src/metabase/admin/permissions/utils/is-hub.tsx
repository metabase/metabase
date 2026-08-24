import { createContext, useContext } from "react";

/**
 * Whether the permissions editor below is mounted in the embedding hub
 * rather than admin. Selected-row highlights, the entity link, and the
 * "You've made changes" bar switch between admin's own `navbar-admin`/
 * `accent7` families and the hub's `core-brand` based on this -- both sets
 * already exist in the design system, so nothing new is introduced here.
 *
 * A plain React context, unlike `base-path.ts`'s module singleton: every
 * consumer here is a component inside the tree (no redux thunk needs this
 * value), so context's automatic cleanup on unmount is simpler and safer
 * than a manual reset.
 */
const PermissionsIsHubContext = createContext(false);

export const PermissionsIsHubProvider = PermissionsIsHubContext.Provider;

export function usePermissionsIsHub() {
  return useContext(PermissionsIsHubContext);
}
