import {
  restore,
  visitQuestionAdhoc,
  main,
  addOrUpdateDashboardCard,
  visitDashboardAndCreateTab,
  popover,
  getDashboardCards,
  saveDashboard,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

describe("scenarios > x-rays", { tags: "@slow" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  const XRAY_DATASETS = 5; // enough to load most questions

  it("should not display x-rays if the feature is disabled in admin settings (metabase#26571)", () => {
    cy.request("PUT", "api/setting/enable-xrays", { value: false });

    cy.visit("/");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "Try out these sample x-rays to see what Metabase can do.",
    ).should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^A summary of/).should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^A glance at/).should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^A look at/).should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^Some insights about/).should("not.exist");
  });

  it("should work on questions with explicit joins (metabase#13112)", () => {
    const PRODUCTS_ALIAS = "Products";

    cy.createQuestion(
      {
        name: "13112",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              "source-table": PRODUCTS_ID,
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": PRODUCTS_ALIAS }],
              ],
              alias: PRODUCTS_ALIAS,
            },
          ],
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ["field", PRODUCTS.CATEGORY, { "join-alias": PRODUCTS_ALIAS }],
          ],
        },
        display: "line",
      },
      { visitQuestion: true },
    );

    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.get(".dot")
      .eq(23) // Random dot
      .click({ force: true });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Automatic insights…").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("X-ray").click();

    // x-rays take long time even locally - that can timeout in CI so we have to extend it
    cy.wait("@dataset", { timeout: 30000 });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "A closer look at number of Orders where Created At is in March 2024 and Category is Gadget",
    );
    cy.icon("warning").should("not.exist");
  });

  ["X-ray", "Compare to the rest"].forEach(action => {
    it(`"${action.toUpperCase()}" should work on a nested question made from base native question (metabase#15655)`, () => {
      cy.intercept("GET", "/api/automagic-dashboards/**").as("xray");

      cy.createNativeQuestion({
        name: "15655",
        native: { query: "select * from people" },
      }).then(({ body: { id } }) => {
        cy.createQuestion(
          {
            name: "Count of 15655 by SOURCE",
            display: "bar",
            query: {
              "source-table": `card__${id}`,
              aggregation: [["count"]],
              breakout: [["field", "SOURCE", { "base-type": "type/Text" }]],
            },
          },
          { visitQuestion: true },
        );

        cy.get(".bar").first().click({ force: true });

        popover().within(() => {
          cy.findByText("Automatic insights…").click();
          cy.findByText(action).click();
        });

        // At this point, we ensure that the dashboard is created and displayed
        // There are corresponding unit tests so if the timing/flake burden becomes too great, the rest of this test can be removed
        cy.intercept("POST", "/api/dataset").as("postDataset");

        cy.wait(Array(XRAY_DATASETS).fill("@postDataset"), {
          timeout: 15 * 1000,
        });

        cy.wait("@xray").then(xhr => {
          expect(xhr.response.body.cause).not.to.exist;
          expect(xhr.response.statusCode).not.to.eq(500);
        });

        main().within(() => {
          cy.findByText("A look at the number of 15655").should("exist");
        });

        cy.get(".DashCard");
      });
    });

    it(`"${action.toUpperCase()}" should not show NULL in titles of generated dashboard cards (metabase#15737)`, () => {
      cy.intercept("GET", "/api/automagic-dashboards/**").as("xray");
      visitQuestionAdhoc({
        name: "15737",
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PEOPLE_ID,
            aggregation: [["count"]],
            breakout: [["field", PEOPLE.SOURCE, null]],
          },
          type: "query",
        },
        display: "bar",
      });

      cy.get(".bar").first().click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Automatic insights…").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(action).click();
      cy.wait("@xray");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("null").should("not.exist");
    });
  });

  it("should be able to save an x-ray as a dashboard and visit it immediately (metabase#18028)", () => {
    cy.intercept("GET", "/app/assets/geojson/**").as("geojson");

    cy.visit(`/auto/dashboard/table/${ORDERS_ID}`);

    cy.wait("@geojson", { timeout: 10000 });

    cy.button("Save this").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Your dashboard was saved");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("See it").click();

    cy.url().should("contain", "a-look-at-orders");

    cy.get(".Card").contains("18,760");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("How these transactions are distributed");
  });

  it("should start loading cards from top to bottom", () => {
    // to check the order of loaded cards this test lets the first intercepted
    // request to be resolved successfully and then it fails all others

    const totalRequests = 8;
    const successfullyLoadedCards = 1;
    const failedCards = totalRequests - successfullyLoadedCards;

    cy.intercept({
      method: "POST",
      url: "/api/dataset",
      times: successfullyLoadedCards,
    }).as("dataset");

    cy.intercept(
      { method: "POST", url: "/api/dataset", times: failedCards },
      { statusCode: 500 },
    ).as("datasetFailed");

    cy.visit(`/auto/dashboard/table/${ORDERS_ID}`);

    cy.wait("@dataset");
    cy.wait("@datasetFailed");

    getDashboardCards().eq(1).contains("Total transactions");
  });

  it("should be able to click the title of an x-ray dashcard to see it in the query builder (metabase#19405)", () => {
    const timeout = { timeout: 10000 };

    cy.intercept("GET", "/app/assets/geojson/**").as("geojson");
    cy.visit(`/auto/dashboard/table/${ORDERS_ID}`);
    cy.wait("@geojson", { timeout });

    // confirm results of "Total transactions" card are present
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("18,760", timeout);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Total transactions").click();

    // confirm we're in the query builder with the same results
    cy.url().should("contain", "/question");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("18,760");

    cy.go("back");

    // add a parameter filter to the auto dashboard
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("State", timeout).click();

    cy.findByPlaceholderText("Search the list").type("GA{enter}");
    cy.findByTestId("GA-filter-value").should("be.visible").click();
    cy.button("Add filter").click();

    // confirm results of "Total transactions" card were updated
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("463", timeout);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Total transactions").click();

    // confirm parameter filter is applied as filter in query builder
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User → State is GA");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("463");
  });

  it("should correctly apply breakout in query builder (metabase#14648)", () => {
    cy.visit(`/auto/dashboard/table/${ORDERS_ID}`);

    // canceled requests will still increment intercept counter
    const NUMBER_OF_DATASET_REQUESTS = 8 * 2;
    cy.intercept("POST", "/api/dataset").as("ordersDataset");

    cy.log("wait for dashcard with 18,760 dataset");

    waitForSatisfyingResponse(
      "@ordersDataset",
      { body: { data: { rows: [[18760]] } } },
      NUMBER_OF_DATASET_REQUESTS,
    );

    getDashboardCards().contains("18,760").click();

    popover().within(() => {
      cy.findByText("Break out by…").click();
      cy.findByText("Category").click();
      cy.findByText("Source").click();
    });

    cy.url().should("contain", "/question");

    cy.findByTestId("viz-settings-button").click();
    cy.findAllByTestId("chartsettings-field-picker")
      .contains("User → Source")
      .should("be.visible");

    cy.get(".bar").should("have.length", 5);

    cy.get(".bar").eq(0).realHover();
    popover().within(() => {
      cy.findByText("Affiliate").should("be.visible");
      cy.findByText("3,520").should("be.visible");
    });
  });

  it("should be able to open x-ray on a dashcard from a dashboard with multiple tabs", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    return cy
      .createDashboard({ name: "my dashboard" })
      .then(({ body: { id: dashboard_id } }) => {
        addOrUpdateDashboardCard({
          card_id: ORDERS_BY_YEAR_QUESTION_ID,
          dashboard_id,
          card: {
            row: 0,
            col: 0,
            size_x: 24,
            size_y: 10,
            visualization_settings: {},
          },
        });
        visitDashboardAndCreateTab({ dashboardId: dashboard_id, save: false });
        cy.findByRole("tab", { name: "Tab 1" }).click();
        saveDashboard();

        cy.get("circle").eq(0).click({ force: true });
        popover().findByText("Automatic insights…").click();
        popover().findByText("X-ray").click();
        cy.wait("@dataset", { timeout: 60000 });

        // Ensure charts actually got rendered
        cy.get("text.x-axis-label").contains("Created At");
      });
  });
});

function waitForSatisfyingResponse(
  alias,
  partialResponse,
  maxRequests,
  level = 0,
) {
  if (level === maxRequests) {
    throw `${maxRequests} requests exceeded`; // fail the test
  }

  cy.wait(alias).then(interception => {
    const isMatch = Cypress._.isMatch(interception.response, partialResponse);
    if (!isMatch) {
      waitForSatisfyingResponse(alias, partialResponse, maxRequests, level + 1);
    }
  });
}
