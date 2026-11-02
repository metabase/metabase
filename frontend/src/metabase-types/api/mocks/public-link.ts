import type { PublicLinkRefusalResponse } from "../public-link";

export function createMockPublicLinkRefusal({
  id = 10,
  name = "Tenant warehouse",
}: { id?: number; name?: string } = {}): PublicLinkRefusalResponse {
  return {
    refusal: {
      message: `${name} has database routing enabled and does not allow anonymous access, so a public link on it would return no data.`,
      database: { id, name },
    },
  };
}
