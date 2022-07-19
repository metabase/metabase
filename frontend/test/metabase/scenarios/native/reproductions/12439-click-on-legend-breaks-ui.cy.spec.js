import { restore, visitQuestionAdhoc, sidebar } from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

const nativeQuery = `SELECT "PRODUCTS__via__PRODUCT_ID"."CATEGORY" AS "CATEGORY", parsedatetime(formatdatetime("PUBLIC"."ORDERS"."CREATED_AT", 'yyyyMM'), 'yyyyMM') AS "CREATED_AT", count(*) AS "count"
FROM "PUBLIC"."ORDERS"
LEFT JOIN "PUBLIC"."PRODUCTS" "PRODUCTS__via__PRODUCT_ID" ON "PUBLIC"."ORDERS"."PRODUCT_ID" = "PRODUCTS__via__PRODUCT_ID"."ID"
GROUP BY "PRODUCTS__via__PRODUCT_ID"."CATEGORY", parsedatetime(formatdatetime("PUBLIC"."ORDERS"."CREATED_AT", 'yyyyMM'), 'yyyyMM')
ORDER BY "PRODUCTS__via__PRODUCT_ID"."CATEGORY" ASC, parsedatetime(formatdatetime("PUBLIC"."ORDERS"."CREATED_AT", 'yyyyMM'), 'yyyyMM') ASC
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

    sidebar().contains("Line options");
  });
});
