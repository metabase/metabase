import type { MetabaseUser } from "embedding-sdk-bundle/types/user";

const MOCK_TIMESTAMP = "2024-01-01T00:00:00Z";

export function createMockUser(opts?: Partial<MetabaseUser>): MetabaseUser {
  const firstName = opts?.first_name ?? "Testy";
  const lastName = opts?.last_name ?? "Tableton";

  return {
    id: 1,
    first_name: firstName,
    last_name: lastName,
    common_name: [firstName, lastName].filter(Boolean).join(" "),
    email: "user@example.com",
    locale: null,
    date_joined: MOCK_TIMESTAMP,
    first_login: MOCK_TIMESTAMP,
    last_login: MOCK_TIMESTAMP,
    ...opts,
  };
}
