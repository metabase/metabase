// import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Collection } from "metabase-types/api";

import { createQuestion } from "./createQuestion";

// const { ORDERS_ID } = SAMPLE_DATABASE;

export const createLibrary = (): Cypress.Chainable<
  Cypress.Response<Collection>
> => {
  cy.log("Initialize library");

  return cy
    .request("POST", "/api/ee/library")
    .then(() => cy.request("GET", "/api/ee/library"))
    .then((response) => {
      const body = response.body;
      const modelsCollection = body.effective_children?.find(
        (child: Collection) => child.name === "Data",
      );
      const metricsCollection = body.effective_children?.find(
        (child: Collection) => child.name === "Metrics",
      );

      createQuestion({
        name: "Trusted Orders Model",
        type: "model",
        query: {
          "source-table": 1,
        },
        collection_id: modelsCollection.id,
      });

      createQuestion({
        name: "Trusted Orders Metric",
        type: "metric",
        query: {
          "source-table": 1,
          aggregation: [["count"]],
        },
        collection_id: metricsCollection.id,
      });

      return cy.wrap(response);
    });
};
