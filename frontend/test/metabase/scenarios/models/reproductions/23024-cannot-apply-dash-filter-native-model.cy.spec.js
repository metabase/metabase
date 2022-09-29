import {
  restore,
  popover,
  visitDashboard,
  editDashboard,
} from "__support__/e2e/helpers";

import { openDetailsSidebar } from "../helpers/e2e-models-helpers";

describe.skip("issue 23024", () => {
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
      { wrapId: true, idAlias: "modelId", visitQuestion: true },
    );

    openDetailsSidebar();

    cy.findByText("Customize metadata").click();
    cy.wait(["@cardQuery", "@cardQuery"]);

    cy.findByText("CATEGORY").click();

    mapColumnTo({ table: "Products", column: "Category" });

    cy.button("Save changes").click();
    cy.wait("@updateMetadata");

    addModelToDashboardAndVisit();
  });

  it("should be possible to apply the dashboard filter to the native model (metabase#23024)", () => {
    editDashboard();

    cy.icon("filter").click();

    cy.findByText("Text or Category").click();
    cy.findByText("Dropdown").click();

    cy.findByText("Column to filter on")
      .parent()
      .within(() => {
        cy.findByText("Select…").click();
      });

    popover().contains("Category");
  });
});

function mapColumnTo({ table, column } = {}) {
  cy.findByText("Database column this maps to")
    .closest(".Form-field")
    .contains("None")
    .click();

  popover().findByText(table).click();
  popover().findByText(column).click();

  cy.findByDisplayValue(column);
}

function addModelToDashboardAndVisit() {
  cy.createDashboard().then(({ body: { id } }) => {
    cy.get("@modelId").then(cardId => {
      cy.request("POST", `/api/dashboard/${id}/cards`, {
        cardId,
        size_x: 16,
        size_y: 10,
      });
    });

    visitDashboard(id);
  });
}
