// Imported from drillthroughs.e2e.spec.js
import { restore, signInAsAdmin, withSampleDataset } from "__support__/cypress";

let dash_name_var;
let dash_num;

function addCardToNewDash(dash_name, card_id) {
  dash_name_var = dash_name;
  cy.request("POST", "/api/dashboard", {
    name: dash_name,
    parameters: [],
  });
  cy.request("POST", `/api/dashboard/${dash_num}/cards`, {
    id: dash_num,
    cardId: card_id,
    parameter_mappings: [],
  });
}

describe("scenarios > visualizations > drillthroughs > dash_drill", () => {
  describe("title click action", () => {
    before(restore);

    describe("from a scalar card", () => {
      before(() => {
        cy.server();
        cy.route("POST", "/api/card/*/query").as("card");

        signInAsAdmin();

        // Make the second question scalar
        cy.visit("/question/1");
        cy.contains("Orders");
        cy.findByText("Visualization").click();
        cy.get(".Icon-number")
          .should("be.visible")
          .click();
        cy.findByText("Save").click();

        cy.get(".Modal").within(() => {
          cy.findByText("Save question");
          cy.findByText("Save").click();
        });

        // Add it to a new dashboard
        dash_num = 2;
        addCardToNewDash("Scalar Dash", 2);

        // Click to question from Dashboard

        cy.visit(`/dashboard/${dash_num}`);
        cy.wait("@card").wait("@card"); // without this, XHR was being aborted in every test run
        cy.findByText(dash_name_var);
        cy.findByText("Orders, Count").click();
      });

      // [quarantine] flaky
      it.skip("should result in a correct query result", () => {
        cy.log("**Assert that the url is correct**");
        cy.url().should("include", "/question/2");

        cy.contains("18,760");
      });
    });

    describe("from a scalar with active filter applied", () => {
      before(() => {
        cy.server();
        cy.route("POST", "/api/card/*/query").as("card");

        signInAsAdmin();

        // Apply filter to scalar question
        cy.visit("/question/3");
        cy.findByText("Filter").click();
        cy.findByText("Quantity").click();
        cy.findByText("2").click();
        cy.findByText("Add filter").click();
        cy.findByText("1,000");
        cy.findByText("6,000").should("not.exist");

        cy.findByText("Save").click();

        cy.get(".Modal").within(() => {
          cy.findByText("Save question");
          cy.findByText("Save").click();
        });

        // Add it to a new dashboard
        dash_num = 3;
        addCardToNewDash("Scalar w Filter Dash", 3);

        // Go to dashboard
        cy.visit(`/dashboard/${dash_num}`);
        cy.wait("@card").wait("@card");
        cy.findByText(dash_name_var);
        cy.contains("Orders,").click();
      });

      // [quarantine] flaky
      it.skip("should result in a correct query result", () => {
        cy.url().should("include", "/question/3");
        cy.findByText("1,000");
        cy.findByText("6,000").should("not.exist");
      });
    });

    describe("from a dashcard multiscalar legend", () => {
      before(() => {
        cy.server();
        cy.route("POST", "/api/card/*/query").as("card");

        signInAsAdmin();

        // Create muliscalar card
        withSampleDataset(({ PEOPLE, PEOPLE_ID }) => {
          cy.request("POST", "/api/card", {
            visualization_settings: {},
            name: "Multiscalar question",
            dataset_query: {
              database: 1,
              query: {
                "source-table": PEOPLE_ID,
                aggregation: [["count"]],
                breakout: [
                  ["field-id", PEOPLE.SOURCE],
                  ["datetime-field", ["field-id", PEOPLE.CREATED_AT], "month"],
                ],
              },
              type: "query",
            },
            display: "line",
          });

          addCardToNewDash("Multiscalar Dash", 4);
        });

        cy.visit("collection/root?type=dashboard");
        cy.findByText(dash_name_var).click();
        cy.wait("@card").wait("@card");
        cy.findByText("All personal collection").should("not.exist");
        cy.contains("Multiscalar question").click({ force: true });
      });

      // [quarantine] flaky
      it.skip("should result in a correct query result", () => {
        cy.url().should("include", "/question/4");
        cy.get(".dot");
        cy.findByText("Affiliate");
      });
    });
  });
});
