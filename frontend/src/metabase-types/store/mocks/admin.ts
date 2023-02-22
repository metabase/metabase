import { AdminAppState, AdminState } from "metabase-types/store";

export const createMockAdminState = (
  opts?: Partial<AdminState>,
): AdminState => ({
  app: createMockAdminAppState(),
  permissions: createMockPermissionsState(),
  settings: { settings: [] },
  ...opts,
});

export const createMockAdminAppState = (
  opts?: Partial<AdminAppState>,
): AdminAppState => ({
  isNoticeEnabled: false,
  paths: [],
  ...opts,
});

export const createMockPermissionsState = (
  opts?: Partial<AdminState["permissions"]>,
): AdminState["permissions"] => {
  return {
    dataPermissions: {},
    originalDataPermissions: {},
    ...opts,
  };
};
