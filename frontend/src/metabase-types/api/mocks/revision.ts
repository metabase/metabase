import type { Revision } from "metabase-types/api";

export const createMockRevision = (opts?: Partial<Revision>): Revision => {
  return {
    id: 1,
    description: "created this",
    message: null,
    timestamp: "2023-05-16T13:33:30.198622-07:00",
    is_creation: true,
    is_reversion: false,
    has_multiple_changes: false,
    user: {
      id: 1,
      first_name: "Admin",
      last_name: "Test",
      common_name: "Admin Test",
    },
    diff: null,
    ...opts,
  };
};
