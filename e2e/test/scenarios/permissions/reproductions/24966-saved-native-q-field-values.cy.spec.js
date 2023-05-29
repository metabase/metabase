import {
  restore,
  visitQuestion,
  visitDashboard,
  filterWidget,
  describeEE,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const sandboxingQuestion = {
  name: "geadsfasd",
  native: {
    query:
      "select products.category,PRODUCTS.title from PRODUCTS where true [[AND products.CATEGORY = {{category}}]]",
    "template-tags": {
      category: {
        id: "411b40bb-1374-9787-6ffb-20604df56d73",
        name: "category",
        "display-name": "Category",
        type: "text",
      },
    },
  },
  parameters: [
    {
      id: "411b40bb-1374-9787-6ffb-20604df56d73",
      type: "category",
      target: ["variable", ["template-tag", "category"]],
      name: "Category",
      slug: "category",
    },
  ],
};

const dashboardFilter = {
  name: "Text",
  slug: "text",
  id: "ec00b255",
  type: "string/=",
  sectionId: "string",
};

const dashboardDetails = { parameters: [dashboardFilter] };

describeEE("issue 24966", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Add user attribute to existing ("nodata" / id:3 user
    cy.request("PUT", "/api/user/3", {
      login_attributes: { attr_cat: "Gizmo" },
    });

    cy.createNativeQuestion(sandboxingQuestion).then(({ body: { id } }) => {
      visitQuestion(id);

      cy.sandboxTable({
        table_id: PRODUCTS_ID,
        card_id: id,
        attribute_remappings: {
          attr_cat: ["variable", ["template-tag", "category"]],
        },
      });
    });

    // Add the saved products table to the dashboard
    cy.createQuestionAndDashboard({
      questionDetails: {
        query: {
          "source-table": PRODUCTS_ID,
          limit: 10,
        },
      },
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId");

      // Connect the filter to the card
      cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
        cards: [
          {
            id,
            card_id,
            col: 0,
            row: 0,
            size_x: 16,
            size_y: 11,
            parameter_mappings: [
              {
                parameter_id: dashboardFilter.id,
                card_id,
                target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
              },
            ],
          },
        ],
      });
    });
  });

  it("should correctly fetch field values for a filter when native question is used for sandboxing (metabase#24966)", () => {
    cy.get("@dashboardId").then(id => {
      cy.signIn("nodata");
      visitDashboard(id);
      filterWidget().click();
      cy.findByTestId("Gizmo-filter-value").click();
      cy.button("Add filter").click();
      cy.location("search").should("eq", "?text=Gizmo");

      cy.signInAsSandboxedUser();
      visitDashboard(id);
      filterWidget().click();
      cy.findByTestId("Widget-filter-value").click();
      cy.button("Add filter").click();
      cy.location("search").should("eq", "?text=Widget");
    });
  });
});
