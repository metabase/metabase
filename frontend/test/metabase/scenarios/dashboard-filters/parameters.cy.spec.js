import {
  popover,
  restore,
  visitDashboard,
  filterWidget,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

const { ORDERS_ID, ORDERS, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > dashboard > parameters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/**/query").as("cardQuery");
    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("GET", "/api/collection/**").as("collection");
  });

  it("one filter should search across multiple fields", () => {
    cy.createDashboard({ name: "my dash" }).then(({ body: { id } }) => {
      // add the same question twice
      cy.request("POST", `/api/dashboard/${id}/cards`, {
        cardId: 2, // Orders, count
      });

      cy.request("POST", `/api/dashboard/${id}/cards`, {
        cardId: 2,
      });

      visitDashboard(id);
    });

    cy.icon("pencil").click();

    // add a category filter
    cy.icon("filter").click();
    cy.contains("Text or Category").click();
    cy.findByText("Dropdown").click();

    // connect it to people.name and product.category
    // (this doesn't make sense to do, but it illustrates the feature)
    selectFilter(cy.get(".DashCard").first(), "Name");
    selectFilter(cy.get(".DashCard").last(), "Category");

    // finish editing filter and save dashboard
    cy.contains("Save").click();

    // wait for saving to finish
    cy.wait("@dashboard");
    cy.contains("You're editing this dashboard.").should("not.exist");

    // confirm that typing searches both fields
    filterWidget().contains("Text").click();

    // After typing "Ga", you should see this name
    popover().find("input").type("Ga");
    cy.wait("@dashboard");
    popover().contains("Gabrielle Considine");

    // Continue typing a "d" and you see "Gadget"
    popover().find("input").type("d");
    cy.wait("@dashboard");

    popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });

    cy.location("search").should("eq", "?text=Gadget");
    cy.get(".DashCard").first().should("contain", "0");
    cy.get(".DashCard").last().should("contain", "4,939");
  });

  it("should remove parameter name or the whole parameter (metabase#10829, metabase#17933)", () => {
    // Mirrored issue in metabase-enterprise#275

    const questionDetails = {
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    const startsWith = {
      name: "Text starts with",
      slug: "text_starts_with",
      id: "1b9cd9f1",
      type: "string/starts-with",
      sectionId: "string",
    };

    const endsWith = {
      name: "Text ends with",
      slug: "text_ends_with",
      id: "88a1257c",
      type: "string/ends-with",
      sectionId: "string",
    };

    const dashboardDetails = {
      parameters: [startsWith, endsWith],
    };

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              sizeX: 12,
              sizeY: 8,
              series: [],
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: startsWith.id,
                  card_id,
                  target: [
                    "dimension",
                    [
                      "field",
                      PRODUCTS.CATEGORY,
                      {
                        "source-field": ORDERS.PRODUCT_ID,
                      },
                    ],
                  ],
                },
                {
                  parameter_id: endsWith.id,
                  card_id,
                  target: [
                    "dimension",
                    [
                      "field",
                      PRODUCTS.CATEGORY,
                      {
                        "source-field": ORDERS.PRODUCT_ID,
                      },
                    ],
                  ],
                },
              ],
            },
          ],
        });

        visitDashboard(dashboard_id);
        cy.findByTextEnsureVisible("Created At");
      },
    );

    cy.findByText(startsWith.name).click();
    cy.findByPlaceholderText("Enter some text").type("G");
    // Make sure the dropdown list with values is not populated,
    // because it makes no sense for non-exact parameter string operators.
    // See: https://github.com/metabase/metabase/pull/15477
    cy.findByText("Gizmo").should("not.exist");
    cy.findByText("Gadget").should("not.exist");

    cy.button("Add filter").click();

    const startsWithSlug = `${startsWith.slug}=G`;
    cy.location("search").should("eq", `?${startsWithSlug}`);
    cy.findByText("37.65").should("not.exist");

    cy.findByText(endsWith.name).click();
    cy.findByPlaceholderText("Enter some text").type("zmo");
    // Make sure the dropdown list with values is not populated,
    // because it makes no sense for non-exact parameter string operators.
    // See: https://github.com/metabase/metabase/pull/15477
    cy.findByText("Gizmo").should("not.exist");

    cy.button("Add filter").click();

    const endsWithSlug = `${endsWith.slug}=zmo`;
    cy.location("search").should("eq", `?${startsWithSlug}&${endsWithSlug}`);
    cy.findByText("52.72").should("not.exist");

    // Remove filter (metabase#17933)
    cy.icon("pencil").click();
    cy.findByText(startsWith.name).find(".Icon-gear").click();

    cy.findByText("Remove").click();
    cy.location("search").should("eq", `?${endsWithSlug}`);

    // Remove filter name (metabase#10829)
    cy.findByText(endsWith.name).find(".Icon-gear").click();
    cy.findByDisplayValue(endsWith.name).clear().blur();

    cy.location("search").should("eq", "?unnamed=zmo");
    cy.findByDisplayValue("unnamed");

    cy.button("Save").click();

    cy.log("Filter name should be 'unnamed' and the value cleared");
    filterWidget().contains(/unnamed/i);

    cy.log("URL should reset");
    cy.location("search").should("eq", "");

    cy.findByText("37.65");
  });

  it("should handle mismatch between filter types (metabase#9299, metabase#16181)", () => {
    const questionDetails = {
      name: "16181",
      native: {
        query: "select count(*) from products where {{filter}}",
        "template-tags": {
          filter: {
            id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
            name: "filter",
            "display-name": "Native Filter",
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            "widget-type": "string/=",
            default: null,
          },
        },
      },
      display: "scalar",
    };

    const matchingFilterType = {
      name: "Text",
      slug: "text",
      id: "d245671f",
      type: "string/=",
      sectionId: "string",
      default: "Gadget",
    };

    const dashboardDetails = {
      parameters: [matchingFilterType],
    };

    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
        cards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            sizeX: 8,
            sizeY: 6,
            parameter_mappings: [
              {
                parameter_id: matchingFilterType.id,
                card_id,
                target: ["dimension", ["template-tag", "filter"]],
              },
            ],
          },
        ],
      });

      visitDashboard(dashboard_id);
      cy.get(".ScalarValue").invoke("text").should("eq", "53");

      // Confirm you can't map wrong parameter type the native question's field filter (metabase#16181)
      cy.icon("pencil").click();
      cy.icon("filter").click();
      cy.findByText("ID").click();
      cy.findByText("No valid fields");

      // Confirm that the correct parameter type is connected to the native question's field filter
      cy.findByText(matchingFilterType.name).find(".Icon-gear").click();
      cy.findByText("Column to filter on").parent().contains("Native Filter");

      // Update the underlying question's query
      cy.request("PUT", `/api/card/${card_id}`, {
        dataset_query: {
          type: "native",
          native: {
            query: "select 1",
            "template-tags": {},
          },
          database: SAMPLE_DB_ID,
        },
      });

      // Upon visiting the dashboard again the filter preserves its value
      visitDashboard(dashboard_id);

      cy.location("search").should("eq", "?text=Gadget");
      filterWidget().contains("Gadget");

      // But the question should display the new value and is not affected by the filter
      cy.get(".ScalarValue").invoke("text").should("eq", "1");

      // Confirm that it is not possible to connect filter to the updated question anymore (metabase#9299)
      cy.icon("pencil").click();
      cy.findByText(matchingFilterType.name).find(".Icon-gear").click();
      cy.findByText("No valid fields");
    });
  });

  // TODO: Completely rewrite, and put together with other nested question reproductions
  //  - This repro is using the old params API
  //  - It's tightly connected to metabase#12985 so put them together if possible
  it("should allow applying multiple values to filter connected to nested question (metabase#18113)", () => {
    const filter = {
      id: "c2967a17",
      name: "Category",
      slug: "category",
      type: "category",
    };

    cy.createNativeQuestion({
      name: "Products SQL",
      native: {
        query: "select * from products",
        "template-tags": {},
      },
      display: "table",
    }).then(({ body: { id: card_id } }) => {
      cy.createQuestion({
        name: "Products use saved SQL question",
        query: {
          "source-table": `card__${card_id}`,
          aggregation: [],
          breakout: [],
        },
      }).then(({ body: { id: card_id } }) => {
        cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
          // Add previously created question to the dashboard
          cy.request("POST", `/api/dashboard/${dashboard_id}/cards`, {
            cardId: card_id,
          }).then(({ body: { id } }) => {
            cy.addFilterToDashboard({ filter, dashboard_id });
            cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
              cards: [
                {
                  id,
                  card_id,
                  row: 0,
                  col: 0,
                  sizeX: 8,
                  sizeY: 6,
                  parameter_mappings: [
                    {
                      card_id: 5,
                      parameter_id: "c2967a17",
                      target: [
                        "dimension",
                        ["field", "TITLE", { "base-type": "type/Text" }],
                      ],
                    },
                  ],
                },
              ],
            });
          });

          visitDashboard(dashboard_id);
          cy.wait("@collection");
        });
      });
    });

    cy.findByText("Category").click();
    cy.wait("@dashboard");
    cy.findByPlaceholderText("Enter some text").type(
      "Small Marble Hat{enter}Enormous Marble Wallet{enter}",
    );
    cy.button("Add filter").click();
    cy.get("tbody > tr").should("have.length", 2);
  });

  describe("when the user does not have self-service data permissions", () => {
    beforeEach(() => {
      visitDashboard(1);
      cy.findByTextEnsureVisible("Created At");

      cy.icon("pencil").click();
      cy.icon("filter").click();
      popover().findByText("ID").click();

      selectFilter(cy.get(".DashCard"), "User ID");

      cy.findByText("Save").click();
      cy.findByText("You're editing this dashboard.").should("not.exist");

      cy.signIn("nodata");
      visitDashboard(1);
    });

    it("should not see mapping options", () => {
      cy.icon("pencil").click();
      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .find(".Icon-gear")
        .click();

      cy.icon("key");
    });
  });
});

function selectFilter(selection, filterName) {
  selection.contains("Select…").click();
  popover().contains(filterName).click({ force: true });
}
