import type { SupportAccessGrant } from "metabase-types/api";

export const createMockAccessGrant = (
  opts: Partial<SupportAccessGrant> = {},
): SupportAccessGrant => {
  return {
    id: 1,
    created_at: "2025-03-01T00:00:00.000Z",
    grant_end_timestamp: "2025-11-04T00:00:00.000Z",
    grant_start_timestamp: "2025-11-01T00:00:00.000Z",
    notes: "notes",
    revoked_at: null,
    revoked_by_user_id: null,
    ticket_number: null,
    updated_at: "2025-03-01T00:00:00.000Z",
    user_id: 123,
    user_name: "Bobby",
    user_email: "bobby+test@metabase.com",
    ...opts,
  };
};
