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

const { PRODUCTS_ID, PRODUCTS, ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("issue 44231", () => {
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

  function getPkCardDetails(type) {
    return {
      name: "Products",
      type,
      query: { "source-table": PRODUCTS_ID },
    };
  }

  function getFkCardDetails(type) {
    return {
      name: "Orders",
      type: "model",
      query: { "source-table": ORDERS_ID },
    };
  }

  function getDashcardDetails(type, dashboard, pkCard, fkCard) {
    return {
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: pkCard.id,
          parameter_mappings: [
            {
              card_id: pkCard.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                [
                  "field",
                  type === "model" ? "ID" : PRODUCTS.ID,
                  { "base-type": "type/BigInteger" },
                ],
              ],
            },
          ],
        },
        {
          card_id: fkCard.id,
          parameter_mappings: [
            {
              card_id: fkCard.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                [
                  "field",
                  type === "model" ? "PRODUCT_ID" : ORDERS.PRODUCT_ID,
                  { "base-type": "type/BigInteger" },
                ],
              ],
            },
          ],
        },
      ],
    };
  }

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

  function verifyFieldMapping(type) {
    cy.createDashboardWithQuestions({
      dashboardDetails,
      questions: [getPkCardDetails(type), getFkCardDetails(type)],
    }).then(({ dashboard, questions: [pkCard, fkCard] }) => {
      updateDashboardCards(getDashcardDetails(type, dashboard, pkCard, fkCard));

      visitDashboard(dashboard.id);
      verifyFilterByRemappedValue();

      visitPublicDashboard(dashboard.id);
      verifyFilterByRemappedValue();

      visitEmbeddedPage({
        resource: { dashboard: dashboard.id },
        params: {},
      });
      verifyFilterByRemappedValue();
    });
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
  });

  it("should allow filtering by remapped values with questions (metabase#44231)", () => {
    verifyFieldMapping("question");
  });

  it("should allow filtering by remapped values with models (metabase#44231)", () => {
    verifyFieldMapping("model");
  });
});
