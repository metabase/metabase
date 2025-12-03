const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

type StructuredQuestionDetailsWithName = StructuredQuestionDetails & {
  name: string;
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
  return H.createLibrary().then(({ data, metrics }) => {
    return H.createQuestion(TRUSTED_ORDERS_MODEL, {
      wrapId: true,
      idAlias: "trustedOrdersModelId",
    }).then(() =>
      cy.get("@trustedOrdersModelId").then((modelId) =>
        cy
          .request("PUT", `/api/card/${modelId}`, {
            type: "model",
            collection_id: data.id,
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
                collection_id: metrics.id,
              }),
            ),
          ),
      ),
    );
  });
}

export function createLibraryWithModel() {
  return H.createLibrary().then(({ data }) => {
    return H.createQuestion(TRUSTED_ORDERS_MODEL, {
      wrapId: true,
      idAlias: "trustedOrdersModelId",
    }).then(() =>
      cy.get("@trustedOrdersModelId").then((modelId) =>
        cy.request("PUT", `/api/card/${modelId}`, {
          type: "model",
          collection_id: data.id,
        }),
      ),
    );
  });
}
