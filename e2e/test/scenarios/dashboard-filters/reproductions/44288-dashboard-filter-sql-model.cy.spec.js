import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createNativeQuestion,
  createQuestion,
  editDashboard,
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  saveDashboard,
  updateDashboardCards,
  visitDashboard,
  visitEmbeddedPage,
  visitPublicDashboard,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("issue 44288", () => {
  const questionDetails = {
    name: "SQL question",
    type: "question",
    query: { "source-table": PRODUCTS_ID, limit: 10 },
  };

  const modelDetails = {
    name: "SQL model",
    type: "model",
    native: { query: "SELECT * FROM PRODUCTS LIMIT 10" },
  };

  const parameterDetails = {
    name: "Text",
    slug: "text",
    id: "27454068",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  function getDashcardDetails(dashboard, question, model) {
    return {
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: question.id,
          parameter_mappings: [
            {
              card_id: question.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
          ],
        },
        {
          card_id: model.id,
          parameter_mappings: [
            {
              card_id: model.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                ["field", "CATEGORY", { "base-type": "type/Text" }],
              ],
            },
          ],
        },
      ],
    };
  }

  function verifyMapping() {
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText(parameterDetails.name)
      .click();
    getDashboardCard(0).within(() => {
      cy.findByText(/Category/i).should("be.visible");
    });
    getDashboardCard(1).within(() => {
      cy.findByText(/Category/i).should("not.exist");
      cy.findByText(/Models are data sources/).should("be.visible");
    });
  }

  function verifyFilter() {
    filterWidget().click();
    popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    getDashboardCard(0).within(() => {
      cy.findAllByText("Gadget").should("have.length.gte", 1);
      cy.findByText("Doohickey").should("not.exist");
    });
    getDashboardCard(1).within(() => {
      cy.findAllByText("Gadget").should("have.length.gte", 1);
      cy.findAllByText("Doohickey").should("have.length.gte", 1);
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    createQuestion(questionDetails).then(({ body: question }) => {
      createNativeQuestion(modelDetails).then(({ body: model }) => {
        cy.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
          updateDashboardCards(getDashcardDetails(dashboard, question, model));
          cy.wrap(dashboard.id).as("dashboardId");
        });
      });
    });
    cy.signOut();
  });

  it("should ignore parameter mappings to a native model in a dashboard (metabase#44288)", () => {
    cy.log("regular dashboards");
    cy.signInAsNormalUser();
    visitDashboard("@dashboardId");
    editDashboard();
    verifyMapping();
    saveDashboard();
    verifyFilter();
    cy.signOut();

    cy.log("public dashboards");
    cy.signInAsAdmin();
    cy.get("@dashboardId").then(dashboardId =>
      visitPublicDashboard(dashboardId),
    );
    verifyFilter();

    cy.log("embedded dashboards");
    cy.get("@dashboardId").then(dashboardId =>
      visitEmbeddedPage({
        resource: { dashboard: dashboardId },
        params: {},
      }),
    );
    verifyFilter();
  });
});
