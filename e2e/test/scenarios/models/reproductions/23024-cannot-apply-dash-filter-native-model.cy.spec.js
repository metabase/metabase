import {
  editDashboard,
  popover,
  restore,
  visitDashboard,
  setModelMetadata,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

describe("issue 23024", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("PUT", "/api/card/*").as("updateMetadata");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(
      {
        native: {
          query: `select * from products limit 5`,
        },
        dataset: true,
      },
      { wrapId: true, idAlias: "modelId" },
    );

    cy.get("@modelId").then(modelId => {
      setModelMetadata(modelId, field => {
        if (field.display_name === "CATEGORY") {
          return {
            ...field,
            id: PRODUCTS.CATEGORY,
            display_name: "Category",
            semantic_type: "type/Category",
          };
        }

        return field;
      });
    });

    addModelToDashboardAndVisit();
  });

  it("should be possible to apply the dashboard filter to the native model (metabase#23024)", () => {
    editDashboard();

    cy.icon("filter").click();

    cy.findByText("Text or Category").click();
    cy.findByText("Is").click();

    cy.findByText("Column to filter on")
      .parent()
      .within(() => {
        cy.findByText("Select…").click();
      });

    popover().contains("Category");
  });
});

function addModelToDashboardAndVisit() {
  cy.createDashboard().then(({ body: { id } }) => {
    cy.get("@modelId").then(cardId => {
      cy.request("POST", `/api/dashboard/${id}/cards`, {
        cardId,
        row: 0,
        col: 0,
        size_x: 16,
        size_y: 10,
      });
    });

    visitDashboard(id);
  });
}
