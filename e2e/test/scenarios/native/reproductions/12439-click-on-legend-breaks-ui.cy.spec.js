import { restore, visitQuestionAdhoc, sidebar } from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const nativeQuery = `
SELECT "PRODUCTS__via__PRODUCT_ID"."CATEGORY" AS "CATEGORY",
       date_trunc('month', "ORDERS"."CREATED_AT") AS "CREATED_AT",
       count(*) AS "count"
FROM "ORDERS"
LEFT JOIN "PRODUCTS" "PRODUCTS__via__PRODUCT_ID"
       ON "ORDERS"."PRODUCT_ID" = "PRODUCTS__via__PRODUCT_ID"."ID"
GROUP BY "PRODUCTS__via__PRODUCT_ID"."CATEGORY",
         date_trunc('month', "ORDERS"."CREATED_AT")
ORDER BY "PRODUCTS__via__PRODUCT_ID"."CATEGORY" ASC,
         date_trunc('month', "ORDERS"."CREATED_AT") ASC
`;

const questionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    native: {
      query: nativeQuery,
    },
    type: "native",
  },
  display: "line",
};

describe("issue 12439", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails);
  });

  it("should allow clicking on a legend in a native question without breaking the UI (metabase#12439)", () => {
    cy.get(".Visualization").within(() => {
      cy.findByText("Gizmo").click();

      // Make sure the legends and the graph are still there
      cy.findByText("Gizmo").should("be.visible");
      cy.findByText("Doohickey").should("be.visible");

      cy.get("circle");
    });

    // Make sure buttons are clickable
    cy.findByTestId("viz-settings-button").click();

    sidebar().contains("X-axis");
    sidebar().contains("Y-axis");
  });
});
