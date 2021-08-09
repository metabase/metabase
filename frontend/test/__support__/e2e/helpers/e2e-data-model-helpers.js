export function remapDisplayValueToFK({ display_value, name, fk } = {}) {
  // Both display_value and fk are expected to be field IDs
  // You can get them from frontend/test/__support__/e2e/cypress_sample_dataset.json
  cy.request("POST", `/api/field/${display_value}/dimension`, {
    field_id: display_value,
    name,
    human_readable_field_id: fk,
    type: "external",
  });
}
