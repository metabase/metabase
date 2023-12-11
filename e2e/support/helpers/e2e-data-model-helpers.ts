/**
 * API helper.
 * @see {@link https://www.metabase.com/docs/latest/api/field#post-apifieldiddimension API Documentation}
 *
 * @summary Remap a field display value to a foreign key using Metabase API.
 *
 * Both `display_value` and `fk` are expected to be field IDs.
 * You can get them from `e2e/support/cypress_sample_database.json`
 *
 * @example
 * remapDisplayValueToFK({
 *   display_value: ORDERS.PRODUCT_ID,
 *   name: "Product ID",
 *   fk: PRODUCTS.TITLE,
 * });
 *
 */
export function remapDisplayValueToFK({
  display_value,
  name,
  fk,
}: {
  display_value: number;
  name: string;
  fk: number;
}): Cypress.Chainable<Cypress.Response<unknown>> {
  return cy.request("POST", `/api/field/${display_value}/dimension`, {
    field_id: display_value,
    name,
    human_readable_field_id: fk,
    type: "external",
  });
}
