import { visualize } from "e2e/support/helpers";

it("should create questions", () => {
  cy.signInAsAdmin();

  cy.visit("/question/new");
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Custom question").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Orders").click();
  cy.icon("join_left_outer").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Products").click();
  // Make sure `on` condition is populated automatically
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Product ID").click();

  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Add filters to narrow your answer").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Large Purchases").click();

  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Pick the metric you want to see").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText(/^Average of/).click();

  cy.findByRole("heading", { name: /Products?/ }).click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Rating").click();

  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Pick a column to group by").click();
  cy.get(".List-section-title").contains("Products").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Category").click();

  visualize();

  cy.get(".bar").should("have.length", 4);

  cy.findByTestId("viz-settings-button").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.contains("Show values on data points").next().click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.contains("3.71");

  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Save").click();
  cy.findByLabelText("Name").clear().type("Rating of Best-selling Products");
  cy.findByLabelText("Description").type(
    "The average rating of our top selling products broken down into categories.",
    { delay: 0 },
  );
  cy.button("Save").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Not now").click();

  cy.visit("/question/new");
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Custom question").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText(/Sample (Dataset|Database)/).click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Orders").click();

  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Pick the metric you want to see").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Common Metrics").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Revenue").click();

  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Pick a column to group by").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Created At")
    .closest(".List-item")
    .findByText("by month")
    .click({ force: true });
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Quarter").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Created At: Quarter");

  visualize();
  cy.get("circle");

  cy.findByTestId("viz-settings-button").click();
  cy.icon("area").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Goal line").next().click();
  cy.findByDisplayValue("0").type("100000").blur();
  cy.get(".line");
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Goal");

  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Save").click();
  cy.findByLabelText("Name").clear().type("Quarterly Revenue");
  cy.button("Save").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Not now").click();
});
