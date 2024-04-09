export const createApiKey = (name: string, group_id: number) => {
  return cy.request("POST", "/api/api-key", {
    name,
    group_id,
  });
};
