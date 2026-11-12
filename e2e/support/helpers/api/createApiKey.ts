import type { CreateApiKeyResponse } from "metabase-types/api";

export const createApiKey = (name: string, group_id: number) => {
  return cy.request<CreateApiKeyResponse>("POST", "/api/api-key", {
    name,
    group_id,
  });
};
