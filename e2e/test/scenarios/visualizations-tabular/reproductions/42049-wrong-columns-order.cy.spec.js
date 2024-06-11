import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, createQuestion } from "e2e/support/helpers";
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// unskip once metabase#42049 is addressed
describe.skip("issue 42049", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not mess up columns order (metabase#42049)", () => {
    cy.intercept("POST", "/api/card/*/query", req => {
      req.on("response", res => {
        const createdAt = res.body.data.cols[1];

        createdAt.field_ref[1] = "created_at"; // simulate named field ref

        res.send();
      });
    }).as("cardQuery");

    createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          fields: [
            ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
            ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
            ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
          ],
        },
        visualization_settings: {
          "table.columns": [
            {
              name: "ID",
              fieldRef: ["field", ORDERS.ID, null],
              enabled: true,
            },
            {
              name: "CREATED_AT",
              fieldRef: [
                "field",
                ORDERS.CREATED_AT,
                {
                  "temporal-unit": "default",
                },
              ],
              enabled: true,
            },
            {
              name: "QUANTITY",
              fieldRef: ["field", ORDERS.QUANTITY, null],
              enabled: true,
            },
          ],
        },
      },
      { visitQuestion: true },
    );

    cy.log("verify initial columns order");

    cy.findAllByTestId("header-cell").as("headerCells");
    cy.get("@headerCells").eq(0).should("have.text", "ID");
    cy.get("@headerCells").eq(1).should("have.text", "Created At");
    cy.get("@headerCells").eq(2).should("have.text", "Quantity");

    cy.findByRole("button", { name: "Filter" }).click();

    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: "Last month" }).click();
      cy.findByRole("button", { name: "Apply filters" }).click();
    });

    cy.wait("@cardQuery");
    cy.get("@cardQuery.all").should("have.length", 2);

    cy.log("verify columns order after applying the filter");

    cy.findAllByTestId("header-cell").as("headerCells");
    cy.get("@headerCells").eq(0).should("have.text", "ID");
    cy.get("@headerCells").eq(1).should("have.text", "Created At");
    cy.get("@headerCells").eq(2).should("have.text", "Quantity");
  });
});
