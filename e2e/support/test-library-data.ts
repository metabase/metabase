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

export const TRUSTED_ORDERS_MODEL: StructuredQuestionDetailsWithName = {
  name: "Trusted Orders Model",
  query: {
    "source-table": ORDERS_ID,
  },
};

export const TRUSTED_ORDERS_METRIC: StructuredQuestionDetailsWithName = {
  name: "Trusted Orders Metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

export function createLibraryWithItems() {
  return H.createLibrary().then(
    (response: Cypress.Response<LibraryResponse>) => {
      const body = response.body;
      const modelsCollection = body.effective_children?.find(
        (child) => child.name === "Data",
      );
      const metricsCollection = body.effective_children?.find(
        (child) => child.name === "Metrics",
      );

      return H.createQuestion(TRUSTED_ORDERS_MODEL, {
        wrapId: true,
        idAlias: "trustedOrdersModelId",
      }).then(() =>
        cy.get("@trustedOrdersModelId").then((modelId) =>
          cy
            .request("PUT", `/api/card/${modelId}`, {
              type: "model",
              collection_id: modelsCollection?.id,
            })
            .then(() =>
              H.createQuestion(TRUSTED_ORDERS_METRIC, {
                wrapId: true,
                idAlias: "trustedOrdersMetricId",
              }),
            )
            .then(() =>
              cy.get("@trustedOrdersMetricId").then((metricId) =>
                cy.request("PUT", `/api/card/${metricId}`, {
                  type: "metric",
                  collection_id: metricsCollection?.id,
                }),
              ),
            ),
        ),
      );
    },
  );
}
