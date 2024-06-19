import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addOrUpdateDashboardCard,
  editDashboard,
  restore,
  visitDashboard,
  setModelMetadata,
  getDashboardCard,
  setFilter,
} from "e2e/support/helpers";

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
        type: "model",
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

  it("should not be possible to apply the dashboard filter to the native model (metabase#23024)", () => {
    editDashboard();

    setFilter("Text or Category", "Is");

    getDashboardCard().within(() => {
      cy.findByText(/Models are data sources/).should("be.visible");
      cy.findByText("Select…").should("not.exist");
    });
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
