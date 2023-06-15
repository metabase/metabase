import {
  addOrUpdateDashboardCard,
  editDashboard,
  popover,
  restore,
  visitDashboard,
  setModelMetadata,
  getDashboardCard,
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
          query: `select *
                  from products limit 5`,
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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Text or Category").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Is").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    getDashboardCard().within(() => {
      cy.findByText("Column to filter on");
      cy.findByText("Select…").click();
    });

    popover().contains("Category");
  });
});

function addModelToDashboardAndVisit() {
  cy.createDashboard().then(({ body: { id } }) => {
    cy.get("@modelId").then(cardId => {
      addOrUpdateDashboardCard({
        dashboard_id: id,
        card_id: cardId,
      });
    });

    visitDashboard(id);
  });
}
