const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers/api";
import type { Collection } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

type StructuredQuestionDetailsWithName = StructuredQuestionDetails & {
  name: string;
};

type LibraryResponse = Collection & {
  effective_children?: Collection[];
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
  H.createLibrary().then((response: Cypress.Response<LibraryResponse>) => {
    const body = response.body;
    const metricsCollection = body.effective_children?.find(
      (child) => child.name === "Metrics",
    );

    H.publishTables({ table_ids: [ORDERS_ID] });
    H.createQuestion({
      ...TRUSTED_ORDERS_METRIC,
    }).then(({ body: card }) => {
      cy.request("PUT", `/api/card/${card.id}`, {
        collection_id: metricsCollection?.id,
      });
    });
  });
}

export function createLibraryWithTable() {
  H.createLibrary();
  H.publishTables({ table_ids: [ORDERS_ID] });
}
