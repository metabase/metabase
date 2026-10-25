import type { AdminAppState, AdminState } from "metabase/redux/store";

export const createMockAdminState = (
  opts?: Partial<AdminState>,
): AdminState => ({
  app: createMockAdminAppState(),
  databases: {
    deletionError: null,
    deletes: [],
  },
  datamodel: {
    revisions: null,
  },
  people: {
    temporaryPasswords: {},
  },
  ...opts,
});

export const createMockAdminAppState = (
  opts?: Partial<AdminAppState>,
): AdminAppState => ({
  paths: [],
  ...opts,
});
