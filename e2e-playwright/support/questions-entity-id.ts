import type { Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

/**
 * The entity id of the "Orders" saved question, read from the same generated
 * data file the Cypress suite uses (cypress_sample_instance_data.js derives
 * ORDERS_QUESTION_ENTITY_ID the same way). support/sample-data.ts only exports
 * the numeric id, so the eid is looked up here.
 */
export const ORDERS_QUESTION_ENTITY_ID: string = (() => {
  const question = SAMPLE_INSTANCE_DATA.questions.find(
    (q: { name: string }) => q.name === "Orders",
  ) as { entity_id?: string } | undefined;
  if (!question?.entity_id) {
    throw new Error(
      'Entity "Orders" (with entity_id) not found in cypress_sample_instance_data',
    );
  }
  return question.entity_id;
})();

/** Port of H.main() (e2e-ui-elements-helpers.js): cy.get("main"). */
export function main(page: Page): Locator {
  return page.locator("main");
}
