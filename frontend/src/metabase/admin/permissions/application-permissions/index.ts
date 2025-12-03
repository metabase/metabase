import { t } from "ttag";

import {
  PLUGIN_APPLICATION_PERMISSIONS,
  PLUGIN_REDUCERS,
} from "metabase/plugins";

export { ApplicationPermissionsApi } from "./api";
export { APPLICATION_PERMISSIONS_OPTIONS } from "./constants";
export {
  initializeApplicationPermissions,
  loadApplicationPermissions,
  updateApplicationPermission,
  saveApplicationPermissions,
  default as applicationPermissionsReducer,
} from "./reducer";
export {
  getApplicationPermissionEditor,
  getIsDirty,
  getPermissionWarning,
} from "./selectors";
export type {
  ApplicationPermissionKey,
  ApplicationPermissionValue,
  ApplicationPermissions,
  GroupApplicationPermissions,
  ApplicationPermissionsState,
} from "./types";
export { default as getApplicationPermissionsRoutes } from "./routes";

import applicationPermissionsReducer from "./reducer";
import getApplicationPermissionsRoutes from "./routes";

export function setupApplicationPermissionsPlugin() {
  if (PLUGIN_APPLICATION_PERMISSIONS.tabs.length === 0) {
    PLUGIN_APPLICATION_PERMISSIONS.getRoutes = getApplicationPermissionsRoutes;
    PLUGIN_APPLICATION_PERMISSIONS.tabs = [
      { name: t`Application`, value: "application" },
    ];
    PLUGIN_REDUCERS.applicationPermissionsPlugin =
      applicationPermissionsReducer;
  }
}
