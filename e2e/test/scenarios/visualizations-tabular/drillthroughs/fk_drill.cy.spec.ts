const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS } = SAMPLE_DATABASE;

describe("scenarios > visualizations > drillthroughs > fk drill", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should display a functional fk drill for null values", () => {
    H.createNativeQuestion(
      {
        name: "Model",
        native: {
          query: `SELECT 1 AS ID, CAST(NULL AS INT) AS USER_ID
UNION ALL
SELECT 2 AS ID, 3 AS USER_ID
`,
        },
        type: "model",
      },
      {},
    ).then(async ({ body: model }) => {
      await cy.request("POST", `/api/card/${model.id}/query`);
      await H.setModelMetadata(model.id, (field) => {
        if (field.name === "USER_ID") {
          return {
            ...field,
            display_name: "User ID",
            semantic_type: "type/FK",
            fk_target_field_id: ORDERS.ID,
          };
        }
        return field;
      });
      H.createQuestion(
        {
          name: "Question",
          query: {
            "source-table": `card__${model.id}`,
          },
          display: "table",
        },
        { visitQuestion: true },
      );
    });

    cy.findByTestId("table-root")
      .findAllByRole("row")
      .first()
      .within(() => {
        cy.get("[data-column-id='USER_ID']").click();
      });
    H.popover().within(() => {
      cy.findByText("View Models with no User").should("be.visible").click();
    });
    cy.findByTestId("table-body").within(() => {
      cy.findAllByRole("row").should("have.length", 1);
      cy.findAllByRole("row")
        .first()
        .within(() => {
          cy.get("[data-column-id='USER_ID']").should("have.value", "");
        });
    });
  });

  it("should display fk drill for non-null values", () => {
    H.createNativeQuestion(
      {
        name: "Model",
        native: {
          query: `SELECT 1 AS ID, CAST(NULL AS INT) AS USER_ID
UNION ALL
SELECT 2 AS ID, 3 AS USER_ID
`,
        },
        type: "model",
      },
      {},
    ).then(async ({ body: model }) => {
      await cy.request("POST", `/api/card/${model.id}/query`);
      await H.setModelMetadata(model.id, (field) => {
        if (field.name === "USER_ID") {
          return {
            ...field,
            display_name: "User ID",
            semantic_type: "type/FK",
            fk_target_field_id: ORDERS.ID,
          };
        }
        return field;
      });
      H.createQuestion(
        {
          name: "Question",
          query: {
            "source-table": `card__${model.id}`,
          },
          display: "table",
        },
        { visitQuestion: true },
      );
    });

    cy.findByTestId("table-root")
      .findAllByRole("row")
      .eq(1)
      .within(() => {
        cy.get("[data-column-id='USER_ID']").click();
      });
    H.popover().within(() => {
      cy.findByText("View this User's Models").should("be.visible");
    });
  });
});
