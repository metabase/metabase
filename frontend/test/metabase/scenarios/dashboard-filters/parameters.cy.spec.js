import {
  sidebar,
  popover,
  restore,
  openNativeEditor,
  visitDashboard,
  filterWidget,
} from "__support__/e2e/cypress";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

// NOTE: some overlap with parameters-embedded.cy.spec.js

const { ORDERS_ID, ORDERS, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > dashboard > parameters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/**/query").as("cardQuery");
    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("GET", "/api/collection/**").as("collection");
  });

  it("should be visible if previously added", () => {
    visitDashboard(1);
    cy.findByTextEnsureVisible("Created At");
    cy.findByText("Baker").should("not.exist");

    // Add a filter
    addCityFilterWithDefault();

    cy.log(
      "**Filter should be set and applied after we leave and back to the dashboard**",
    );
    cy.visit("/");
    cy.wait("@collection");

    cy.findByText("Our analytics").click();
    cy.wait("@collection");

    cy.findByText("Orders in a dashboard").click();
    cy.wait("@collection");
    cy.findByTextEnsureVisible("Product ID");

    cy.findByTextEnsureVisible("Baker");
  });

  it("should search across multiple fields", () => {
    cy.createDashboard({ name: "my dash" });

    cy.visit("/collection/root");
    cy.wait("@collection");
    cy.findByText("my dash").click();
    cy.wait("@collection");

    // add the same question twice
    cy.icon("pencil").click();
    cy.get(".QueryBuilder-section .Icon-add").click();
    cy.wait("@collection");
    addQuestion("Orders, Count");
    addQuestion("Orders, Count");

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
    cy.contains("Text").click();

    // After typing "Ga", you should see this name
    popover()
      .find("input")
      .type("Ga");
    cy.wait("@dashboard");
    popover().contains("Gabrielle Considine");

    // Continue typing a "d" and you see "Gadget"
    popover()
      .find("input")
      .type("d");
    cy.wait("@dashboard");
    popover()
      .contains("Gadget")
      .click();

    popover()
      .contains("Add filter")
      .click();
  });

  it("should query with a 2 argument parameter", () => {
    cy.createDashboard({ name: "my dash" });

    cy.visit("/collection/root");
    cy.wait("@collection");
    cy.findByText("my dash").click();
    cy.wait("@collection");

    // add a question
    cy.icon("pencil").click();
    cy.get(".QueryBuilder-section .Icon-add").click();
    cy.wait("@collection");
    addQuestion("Orders, Count");

    // add a Number - Between filter
    cy.icon("filter").click();
    cy.contains("Number").click();
    cy.findByText("Between").click();

    // map the parameter to the Rating field
    selectFilter(cy.get(".DashCard"), "Rating");

    // finish editing filter and save dashboard
    cy.contains("Save").click();

    // wait for saving to finish
    cy.wait("@dashboard");
    cy.contains("You're editing this dashboard.").should("not.exist");

    // populate the filter inputs
    cy.contains("Between").click();
    popover()
      .find("input")
      .first()
      .type("3");

    popover()
      .find("input")
      .last()
      .type("4");

    popover()
      .contains("Add filter")
      .click();
    cy.wait("@dashboard");

    // There should be 8849 orders with a rating >= 3 && <= 4
    cy.get(".DashCard").contains("8,849");
    cy.url().should("include", "between=3&between=4");
  });

  it("should not search field for results non-exact parameter string operators", () => {
    visitDashboard(1);
    cy.findByTextEnsureVisible("Created At");

    // Add a filter tied to a field that triggers a search for field values
    cy.icon("pencil").click();
    cy.icon("filter").click();
    cy.findByText("Text or Category").click();
    cy.findByText("Starts with").click();

    // Link that filter to the card
    cy.findByText("Select…").click();
    popover().within(() => {
      cy.findByText("Name").click();
    });

    // Add a filter with few enough values that it does not search
    cy.icon("filter").click();
    cy.findByText("Text or Category").click();
    cy.findByText("Ends with").click();

    // Link that filter to the card
    cy.findByText("Select…").click();
    popover().within(() => {
      cy.findByText("Category").click();
    });

    cy.findByText("Save").click();
    cy.wait("@dashboard");
    cy.findByText("You're editing this dashboard.").should("not.exist");

    cy.contains("Text starts with").click();
    cy.findByPlaceholderText("Enter some text")
      .click()
      .type("Corbin");
    cy.findByText("Corbin Mertz").should("not.exist");
    cy.findByText("Add filter").click();

    cy.contains("Text ends with").click();
    cy.findByPlaceholderText("Enter some text")
      .click()
      .type("dget");
    cy.findByText("Widget").should("not.exist");
    cy.findByText("Add filter").click();
  });

  it("should remove parameter from URL after its name has been removed (metabase#10829)", () => {
    // Mirrored issue in metabase-enterprise#275
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    const questionDetails = {
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    const filter = {
      name: "Text ends with",
      slug: "text_ends_with",
      id: "88a1257c",
      type: "string/ends-with",
      sectionId: "string",
    };

    const dashboardDetails = {
      parameters: [filter],
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
                  parameter_id: filter.id,
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

    // populate the filter input
    filterWidget().click();
    cy.findByPlaceholderText("Enter some text").type("zmo{enter}");
    cy.button("Add filter").click();

    cy.log(
      "**URL is updated correctly with the given parameter at this point**",
    );
    cy.location("search").should("eq", "?text_ends_with=zmo");

    // Remove filter name
    cy.icon("pencil").click();
    cy.get(".Dashboard")
      .find(".Icon-gear")
      .click();

    cy.findByDisplayValue("Text ends with")
      .clear()
      .blur();

    cy.findByDisplayValue("unnamed");

    cy.location("search").should("eq", "?unnamed=zmo");

    cy.button("Save").click();
    cy.wait("@dashcardQuery");

    cy.log("Filter name should be 'unnamed' and the value cleared");
    filterWidget().contains(/unnamed/i);

    cy.log("URL should reset");
    cy.location("search").should("eq", "");
  });

  it("should allow linked question to be changed without breaking (metabase#9299)", () => {
    openNativeEditor().type("SELECT * FROM ORDERS WHERE {{filter}}", {
      parseSpecialCharSequences: false,
    });
    cy.wait("@collection");

    // make {{filter}} a "Field Filter" connected to `Orders > Created At`
    cy.findAllByTestId("select-button")
      .contains("Text")
      .click();
    cy.findByText("Field Filter").click();
    popover().within(() => {
      cy.findByText("Sample Database");
      cy.findByText("Orders").click();
      cy.findByText("Created At").click();
    });
    cy.findByText("Save").click();

    cy.findByPlaceholderText("What is the name of your card?")
      .click()
      .type("DashQ");
    cy.get(".Modal").within(() => {
      cy.findByText("Save").click();
    });
    // add question to existing dashboard, rather than creating a new one
    cy.findByText("Yes please!").click();
    cy.findByText("Orders in a dashboard").click();
    cy.wait("@dashboard");

    // it automatically switches to that dashboard and enters the editing mode
    cy.findByTextEnsureVisible("You're editing this dashboard.");
    cy.findByTextEnsureVisible("Created At");
    cy.findByTextEnsureVisible("DashQ");
    cy.wait("@cardQuery");

    cy.icon("filter").click();
    cy.findByText("Time").click();
    cy.findByText("All Options").click();
    // update the filter with the default option "Previous 30 days"
    // it will automatically be selected - just press "Update filter"
    cy.findByText("No default").click();
    cy.findByText("Relative dates...").click();
    cy.findByText("Past").click();
    cy.findByText("Update filter").click();

    // connect that filter to the second card/question (dashboard already had one question previously)
    cy.get(".DashCard")
      .last()
      .contains("Select")
      .click();
    popover()
      .contains("Filter")
      .click();
    // save the dashboard
    cy.findByText("Save").click();
    cy.wait("@dashboard");
    cy.findByTextEnsureVisible("Product ID");
    cy.findByText("You're editing this dashboard.").should("not.exist");

    cy.visit("/");
    cy.wait("@collection");
    // find and edit the question
    cy.findByText("Our analytics").click();
    cy.wait("@collection");
    cy.findByText("DashQ").click();
    cy.wait("@collection");

    cy.findByText("Open Editor").click();
    cy.wait("@cardQuery");
    cy.findByTextEnsureVisible("PRODUCT_ID");

    // remove the connected filter from the question...
    cy.get("@editor")
      .click()
      .type("{selectall}{backspace}") // cannot use `clear()` on a custom (unsupported) element
      .type("{selectall}{backspace}") // repeat because sometimes Cypress fails to clear everything
      .type("SELECT * from ORDERS");
    cy.findByText("Save").click();

    // ... and save it (override the current one is selected by default - just press "Save")
    cy.get(".Modal").within(() => {
      cy.findByText("Save").click();
    });
    cy.findByText("New question").should("not.exist");

    cy.log("Bug was breaking the dashboard at this point");
    visitDashboard(1);
    // error was always ending in "is undefined" when dashboard broke in the past
    cy.contains(/is undefined$/).should("not.exist");
    cy.findByText("Orders in a dashboard");
    cy.wait("@collection");
    cy.findByText("DashQ");
  });

  it("should not having any mapping options if the native question field filter and parameter type differ (metabase#16181)", () => {
    const filter = {
      name: "Text contains",
      slug: "text_contains",
      id: "98289b9b",
      type: "string/contains",
      sectionId: "string",
    };

    cy.createNativeQuestion({
      name: "16181",
      native: {
        query: "select count(*) from products where {{filter}}",
        "template-tags": {
          filter: {
            id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
            name: "filter",
            "display-name": "Filter",
            type: "dimension",
            dimension: ["field", PRODUCTS.TITLE, null],
            "widget-type": "string/=",
            default: null,
          },
        },
      },
      display: "scalar",
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
                    parameter_id: filter.id,
                    card_id,
                    target: ["dimension", ["template-tag", "filter"]],
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

    // confirm you can't map the parameter on the dashboard to the native question's field filter
    cy.icon("pencil").click();
    cy.findByText("Text contains").click();
    cy.findByText("No valid fields");
  });

  it("should render other categories filter that allows selecting multiple values (metabase#18113)", () => {
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

  it("should be removable from dashboard", () => {
    visitDashboard(1);
    cy.findByTextEnsureVisible("Created At");

    // Add a filter
    addCityFilterWithDefault();

    // Remove the filter from the dashboard
    cy.icon("pencil").click();
    cy.findByText("Location").click();
    cy.findByText("Remove").click();
    cy.findByText("Save").click();
    cy.wait("@dashboard");
    cy.findByText("You're editing this dashboard.").should("not.exist");

    cy.findByText("Baker").should("not.exist");
  });

  describe("when the user does not have self service data permissions", () => {
    beforeEach(() => {
      visitDashboard(1);
      cy.wait("@collection");
      cy.findByTextEnsureVisible("Created At");
      addCityFilterWithDefault();

      cy.signIn("nodata");
      cy.reload();
      cy.wait("@collection");
    });

    it("should not see mapping options", () => {
      cy.icon("pencil").click();
      cy.findByText("Location").click({ force: true });

      cy.icon("key");
    });
  });
});

function selectFilter(selection, filterName) {
  selection.contains("Select…").click();
  popover()
    .contains(filterName)
    .click({ force: true });
}

function addQuestion(name) {
  sidebar()
    .contains(name)
    .click();
  cy.wait("@cardQuery");
}

function addCityFilterWithDefault() {
  cy.icon("pencil").click();
  cy.icon("filter").click();
  cy.findByText("Location").click();
  cy.findByText("Dropdown").click();

  // Link that filter to the card
  cy.findByText("Select…").click();
  popover().within(() => {
    cy.findByText("City").click();
  });

  // Create a default value and save filter
  cy.findByText("No default").click();
  cy.findByPlaceholderText("Search by City")
    .click()
    .type("B");
  cy.findByText("Baker").click();
  cy.findByText("Add filter").click();
  cy.get(".Button--primary")
    .contains("Done")
    .click();

  cy.findByText("Save").click();
  cy.wait("@dashboard");
  cy.findByText("You're editing this dashboard.").should("not.exist");
  cy.findByTextEnsureVisible("Baker");
}
