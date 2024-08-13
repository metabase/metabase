import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, visitQuestionAdhoc } from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("time-series chrome filter widget", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("smoke tests", () => {
    beforeEach(() => {
      visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          type: "query",
        },
      });
    });

    it("should properly display the component and all its operators", () => {
      const operators = [
        "Previous",
        "Next",
        "Current",
        "Before",
        "After",
        "On",
        "Between",
      ];

      cy.log(
        "should display 'All time' as the initialy selected operator (metabase#22247)",
      );
      cy.findByTestId("timeseries-filter-button")
        .should("have.text", "All time")
        .click();

      cy.findByTestId("datetime-filter-picker")
        .findByDisplayValue("All time")
        .click();

      cy.findByRole("listbox").within(() => {
        cy.findByRole("option", { name: "All time" }).should(
          "have.attr",
          "aria-selected",
          "true",
        );

        cy.log("Make sure we display all the operators");
        operators.forEach(operator => {
          cy.findByRole("option", { name: operator }).should("be.visible");
        });
      });

      cy.findByTestId("datetime-filter-picker").within(() => {
        cy.log("Include 'current' interval switch should not be displayed");
        cy.findByLabelText(/^Include/).should("not.exist");
        cy.button("Apply").should("not.be.disabled");
      });
    });

    it("should stay in sync with the relative date filter", () => {
      cy.findByTestId("timeseries-filter-button").click();
      updateOperator("All time", "Previous");

      cy.log("Check the state of the time-series chrome");
      cy.findByTestId("datetime-filter-picker").within(() => {
        // Top row
        cy.findByDisplayValue("Previous").should("be.visible");
        cy.findByDisplayValue("30").should("be.visible");
        cy.findByDisplayValue("days").should("be.visible");

        cy.log("Toggle should be always off initially");
        // This is targeting the input checkbox that is hidden
        cy.findByLabelText("Include today").should(
          "have.attr",
          "aria-checked",
          "false",
        );

        // This is clicking on an actual label in the UI
        cy.findByText("Include today").click();

        cy.findByLabelText("Include today").should(
          "have.attr",
          "aria-checked",
          "true",
        );
        cy.button("Apply").click();
        cy.wait("@dataset");
      });

      cy.findByTestId("filter-pill")
        .should("have.text", "Created At is in the previous 30 days")
        .click();

      cy.log(
        "Make sure the relative date picker reflects the state of the time-series chrome",
      );
      cy.findByTestId("datetime-filter-picker").within(() => {
        cy.findByRole("tab", { name: "Previous" }).should(
          "have.attr",
          "aria-selected",
          "true",
        );

        cy.findByLabelText("Include today").should(
          "have.attr",
          "aria-checked",
          "true",
        );

        cy.log(
          "Switch should preserve its state after we change the direction",
        );
        cy.findByRole("tab", { name: "Next" }).click();
        cy.findByLabelText("Include today").should(
          "have.attr",
          "aria-checked",
          "true",
        );
      });
    });
  });

  describe("'Include this' switch", () => {
    beforeEach(() => {
      visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
            ],
            filter: [
              "time-interval",
              [
                "field",
                PRODUCTS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                },
              ],
              30,
              "year",
              {
                "include-current": true,
              },
            ],
          },
          type: "query",
        },
      });

      cy.findByTestId("filter-pill").should(
        "have.text",
        "Created At is in the next 30 years",
      );
      cy.findByTestId("timeseries-filter-button")
        .should("have.text", "Next 30 Years")
        .click();
    });

    it("should preserve the state of 'Include current' switch when changing direction or the interval", () => {
      cy.findByTestId("datetime-filter-picker").within(() => {
        cy.findByLabelText("Include this year").should(
          "have.attr",
          "aria-checked",
          "true",
        );
      });

      cy.log("Change the interval");
      cy.findByTestId("datetime-filter-picker")
        .findByDisplayValue("years")
        .click();
      cy.findByRole("listbox")
        .findByRole("option", { name: "quarters" })
        .click();

      cy.findByTestId("datetime-filter-picker").within(() => {
        cy.findByDisplayValue("quarters").should("be.visible");
        cy.findByLabelText("Include this quarter").should(
          "have.attr",
          "aria-checked",
          "true",
        );

        // Toggle off
        cy.findByText("Include this quarter").click();
      });

      cy.log("Change the direction");
      updateOperator("Next", "Previous");
      cy.findByTestId("datetime-filter-picker").within(() => {
        cy.findByDisplayValue("Previous").should("be.visible");
        cy.findByLabelText("Include this quarter").should(
          "have.attr",
          "aria-checked",
          "false",
        );
      });
    });

    it("should reset the 'Include current' switch state when navigating away from the relative interval date filter", () => {
      cy.findByTestId("datetime-filter-picker").within(() => {
        cy.findByLabelText("Include this year").should(
          "have.attr",
          "aria-checked",
          "true",
        );
      });

      updateOperator("Next", "Current");
      cy.findByTestId("datetime-filter-picker")
        .findByLabelText("Include today")
        .should("not.exist");

      updateOperator("Current", "Previous");
      cy.findByTestId("datetime-filter-picker").within(() => {
        cy.findByDisplayValue("Previous").should("be.visible");
        cy.findByLabelText("Include this year").should(
          "have.attr",
          "aria-checked",
          "false",
        );
      });
    });
  });
});

function updateOperator(from: string, to: string) {
  cy.findByTestId("datetime-filter-picker").findByDisplayValue(from).click();
  cy.findByRole("listbox").findByRole("option", { name: to }).click();
}
