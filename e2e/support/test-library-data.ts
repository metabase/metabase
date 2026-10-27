const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  LibraryCollectionIds,
  StructuredQuestionDetails,
} from "e2e/support/helpers/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

type StructuredQuestionDetailsWithName = StructuredQuestionDetails & {
  name: string;
};

export const TRUSTED_ORDERS_METRIC: StructuredQuestionDetailsWithName = {
  name: "Trusted Orders Metric",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

export function createLibraryWithItems() {
  H.createLibrary().then(({ metricsCollectionId }) => {
    H.publishTables({ table_ids: [ORDERS_ID] });
    H.createQuestion({
      ...TRUSTED_ORDERS_METRIC,
    }).then(({ body: card }) => {
      cy.request("PUT", `/api/card/${card.id}`, {
        collection_id: metricsCollectionId,
      });
      // Expose ids so specs can navigate/verify directly instead of clicking
      // through the lazily-rendered library tree, which is a flake source.
      cy.wrap(card.id).as("trustedMetricId");
      cy.wrap(metricsCollectionId).as("metricsCollectionId");
    });
  });
}

export function createLibraryWithTable(): Cypress.Chainable<LibraryCollectionIds> {
  return H.createLibrary().then((ids) => {
    H.publishTables({ table_ids: [ORDERS_ID] });
    return ids;
  });
}
