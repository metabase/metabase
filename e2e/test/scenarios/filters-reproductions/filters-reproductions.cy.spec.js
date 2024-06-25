import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, createQuestion } from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("issue 35043", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should prevent illogical ranges - from newer to older (metabase#35043)", () => {
    const questionDetails = {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        filter: [
          "between",
          [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
            },
          ],
          "2024-04-15",
          "2024-05-22",
        ],
        limit: 5,
      },
      type: "query",
    };

    createQuestion(questionDetails, { visitQuestion: true });

    cy.findByTestId("filters-visibility-control").click();
    cy.findByTestId("filter-pill")
      .should("have.text", "Created At is Apr 15 – May 22, 2024")
      .click();

    cy.findByTestId("datetime-filter-picker").within(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.findByDisplayValue("May 22, 2024").type("{backspace}2").blur();
      cy.findByDisplayValue("May 22, 2022").should("exist");

      cy.button("Update filter").click();
      cy.wait("@dataset");
    });

    cy.findByTestId("filter-pill").should(
      "have.text",
      "Created At is May 22, 2022 – Apr 15, 2024",
    );
  });
});
