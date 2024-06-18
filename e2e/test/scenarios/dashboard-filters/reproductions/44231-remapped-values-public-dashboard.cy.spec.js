import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  updateDashboardCards,
  visitDashboard,
  visitEmbeddedPage,
  visitPublicDashboard,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("issue 44231", () => {
  const productQuestionDetails = {
    name: "Products",
    query: { "source-table": PRODUCTS_ID },
  };

  const orderQuestionDetails = {
    name: "Orders",
    query: { "source-table": ORDERS_ID },
  };

  const parameterDetails = {
    id: "92eb69ea",
    name: "ID",
    sectionId: "id",
    slug: "id",
    type: "id",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  function verifyFilterByRemappedValue() {
    const productId = 144;
    const productName = "Aerodynamic Bronze Hat";

    filterWidget().click();
    popover().within(() => {
      cy.findByText(productName).click();
      cy.button("Add filter").click();
    });
    getDashboardCard(0).findByText(productName).should("be.visible");
    getDashboardCard(1)
      .findAllByText(String(productId))
      .should("have.length.above", 0);
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${PRODUCTS.ID}`, {
      has_field_values: "list",
    });
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });
    cy.request("PUT", `/api/field/${PRODUCTS.TITLE}`, {
      semantic_type: "type/Name",
    });

    cy.createDashboardWithQuestions({
      dashboardDetails,
      questions: [productQuestionDetails, orderQuestionDetails],
    }).then(({ dashboard, questions: [card1, card2] }) => {
      updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: card1.id,
            parameter_mappings: [
              {
                card_id: card1.id,
                parameter_id: parameterDetails.id,
                target: ["dimension", ["field", PRODUCTS.ID, null]],
              },
            ],
          },
          {
            card_id: card2.id,
            parameter_mappings: [
              {
                card_id: card2.id,
                parameter_id: parameterDetails.id,
                target: ["dimension", ["field", ORDERS.PRODUCT_ID, null]],
              },
            ],
          },
        ],
      });
      cy.wrap(dashboard.id).as("dashboardId");
    });
  });

  it("should allow filtering by remapped values in a regular dashboard (metabase#44231)", () => {
    visitDashboard("@dashboardId");
    verifyFilterByRemappedValue();
  });

  it("should allow filtering by remapped values in a public dashboard (metabase#44231)", () => {
    cy.get("@dashboardId").then(dashboardId =>
      visitPublicDashboard(dashboardId),
    );
    verifyFilterByRemappedValue();
  });

  it("should allow filtering by remapped values in an embedded dashboard (metabase#44231)", () => {
    cy.get("@dashboardId").then(dashboardId =>
      visitEmbeddedPage({
        resource: { dashboard: dashboardId },
        params: {},
      }),
    );
    verifyFilterByRemappedValue();
  });
});
