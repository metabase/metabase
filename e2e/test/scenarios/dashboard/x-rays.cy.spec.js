import {
  restore,
  getDimensionByName,
  visitQuestionAdhoc,
  summarize,
  visualize,
  startNewQuestion,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

describe("scenarios > x-rays", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  const XRAY_DATASETS = 11; // enough to load most questions

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

  it.skip("should work on questions with explicit joins (metabase#13112)", () => {
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
    cy.findByText("X-ray").click();

    // x-rays take long time even locally - that can timeout in CI so we have to extend it
    cy.wait("@dataset", { timeout: 30000 });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "A closer look at number of Orders where Created At is in March 2018 and Category is Gadget",
    );
    cy.icon("warning").should("not.exist");
  });

  ["X-ray", "Compare to the rest"].forEach(action => {
    it(`"${action.toUpperCase()}" should work on a nested question made from base native question (metabase#15655)`, () => {
      cy.intercept("GET", "/api/automagic-dashboards/**").as("xray");

      cy.createNativeQuestion({
        name: "15655",
        native: { query: "select * from people" },
      });

      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Saved Questions").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("15655").click();
      visualize();
      summarize();
      getDimensionByName({ name: "SOURCE" }).click();

      cy.intercept("POST", "/api/dataset").as("postDataset");

      cy.button("Done").click();
      cy.get(".bar").first().click({ force: true });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(action).click();

      cy.wait("@xray").then(xhr => {
        for (let c = 0; c < XRAY_DATASETS; ++c) {
          cy.wait("@postDataset");
        }
        expect(xhr.response.body.cause).not.to.exist;
        expect(xhr.response.statusCode).not.to.eq(500);
      });

      cy.findByTextEnsureVisible("A look at the number of 15655");

      cy.findByRole("heading", { name: /^A look at the number of/ });
      cy.get(".DashCard");
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

    cy.url().should("contain", "a-look-at-your-orders-table");

    cy.get(".Card").contains("18,760");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("How these transactions are distributed");
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
    cy.findByText("State is GA");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("463");
  });
});
