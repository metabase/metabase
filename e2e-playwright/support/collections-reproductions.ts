/**
 * Helpers for the collections-reproductions port
 * (e2e/test/scenarios/collections/collections-reproductions.cy.spec.ts).
 *
 * Everything the spec needs already lives in shared modules (permissions,
 * collection-menu, entity-picker and UI locators). The only thing without a
 * shared home is the ORDERS_COUNT_QUESTION_ID entity id — sample-data.ts
 * exports ORDERS_QUESTION_ID but not this one — so it is derived here the same
 * way (by question name) as the Cypress cypress_sample_instance_data export.
 */
import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

/** Port of ORDERS_COUNT_QUESTION_ID (cypress_sample_instance_data.js). */
export const ORDERS_COUNT_QUESTION_ID: number = (() => {
  const question = (
    SAMPLE_INSTANCE_DATA.questions as { name: string; id: number | string }[]
  ).find((entity) => entity.name === "Orders, Count");
  if (!question) {
    throw new Error(
      'Entity "Orders, Count" not found in cypress_sample_instance_data',
    );
  }
  return Number(question.id);
})();
