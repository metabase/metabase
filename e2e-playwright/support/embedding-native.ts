/**
 * Helpers for the embedding-native spec port (static "guest" embedding of a
 * NATIVE question with SQL parameters). NEW helpers live here (parallel-agent
 * rule: no edits to shared modules — everything else is imported read-only).
 *
 * Ports of:
 * - the fixture in e2e/test/scenarios/embedding/shared/embedding-native.js
 *   (questionDetails — a native question with id/created_at/total/source/state/
 *   product_id template tags).
 * - the spec-local assertRequiredEnabledForName, which reads the native
 *   editor's variable panel via SQLFilter.getRequiredInput
 *   (e2e/test/scenarios/native-filters/helpers/e2e-sql-filter-helpers.js:
 *   getRequiredInput = cy.findByLabelText("Always require a value")).
 */
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { SAMPLE_DATABASE } from "./sample-data";

const { ORDERS, PEOPLE } = SAMPLE_DATABASE as {
  ORDERS: Record<string, number>;
  PEOPLE: Record<string, number>;
};

const query = `
SELECT orders.id, orders.product_id, orders.created_at AS production_date, orders.total, people.state, people.name, people.source
FROM orders LEFT JOIN people ON orders.user_id = people.id
WHERE true
  [[AND {{id}}]]
  [[AND orders.product_id = {{product_id}}]]
  [[AND {{created_at}}]]
  [[AND {{total}}]]
  [[AND {{state}}]]
  AND [[people.source = {{source}} --]] people.source IN ('Affiliate', 'Organic')
  LIMIT 15;
`;

/** Port of questionDetails (shared/embedding-native.js). */
export const questionDetails = {
  name: "Native Question With Multiple Filters - Embedding Test",
  description: "FooBar",
  native: {
    "template-tags": {
      id: {
        id: "d404e93f-8155-e990-ff57-37122547406c",
        name: "id",
        "display-name": "Order ID",
        type: "dimension",
        dimension: ["field", ORDERS.ID, null],
        "widget-type": "id",
        default: null as unknown,
      },
      created_at: {
        id: "a21ca6d2-f742-a94a-da71-75adf379069c",
        name: "created_at",
        "display-name": "Created At",
        type: "dimension",
        dimension: ["field", ORDERS.CREATED_AT, null],
        "widget-type": "date/quarter-year",
        default: null as unknown,
      },
      total: {
        id: "68350949-02cc-f540-86cf-ddcda07529d8",
        name: "total",
        "display-name": "Total",
        type: "dimension",
        dimension: ["field", ORDERS.TOTAL, null],
        "widget-type": "number/>=",
        default: [0] as unknown,
      },
      source: {
        id: "44038e73-f909-1bed-0974-2a42ce8979e8",
        name: "source",
        "display-name": "Source",
        type: "text",
      },
      state: {
        id: "88057a9e-91bd-4b2e-9327-afd92c259dc8",
        name: "state",
        "display-name": "State",
        type: "dimension",
        dimension: ["field", PEOPLE.STATE, null],
        "widget-type": "string/!=",
        default: null as unknown,
      },
      product_id: {
        id: "c967d72e-3687-aa01-8c47-458f7905305f",
        name: "product_id",
        "display-name": "Product ID",
        type: "number",
        default: null as unknown,
      },
    },
    query,
    type: "native",
  },
};

/**
 * Port of the spec-local assertRequiredEnabledForName: inside the native
 * editor's `tag-editor-variable-<name>` panel, the "Always require a value"
 * toggle input must be enabled/disabled as expected. `should("be.enabled")`
 * → toBeEnabled; `should("not.be.enabled")` → toBeDisabled (the input always
 * exists here, so "not enabled" means the disabled attribute is set).
 */
export async function assertRequiredEnabledForName(
  page: Page,
  { name, enabled }: { name: string; enabled: boolean },
) {
  const input = page
    .getByTestId(`tag-editor-variable-${name}`)
    .getByLabel("Always require a value");
  if (enabled) {
    await expect(input).toBeEnabled();
  } else {
    await expect(input).toBeDisabled();
  }
}
