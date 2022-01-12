import { AdminAppState, AdminState } from "metabase-types/store";

export const createMockAdminState = (
  opts?: Partial<AdminState>,
): AdminState => ({
  app: createMockAdminAppState(),
  ...opts,
});

export const createMockAdminAppState = (
  opts?: Partial<AdminAppState>,
): AdminAppState => ({
  isNoticeEnabled: false,
  ...opts,
});
