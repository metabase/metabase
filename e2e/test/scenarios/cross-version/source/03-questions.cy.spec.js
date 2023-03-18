import { visualize } from "e2e/support/helpers";

it("should create questions", () => {
  cy.signInAsAdmin();

  cy.visit("/question/new");
  cy.findByText("Custom question").click();
  cy.findByText("Orders").click();
  cy.icon("join_left_outer").click();
  cy.findByText("Products").click();
  // Make sure `on` condition is populated automatically
  cy.findByText("Product ID").click();

  cy.findByText("Add filters to narrow your answer").click();
  cy.findByText("Large Purchases").click();

  cy.findByText("Pick the metric you want to see").click();
  cy.findByText(/^Average of/).click();

  cy.findByRole("heading", { name: /Products?/ }).click();
  cy.findByText("Rating").click();

  cy.findByText("Pick a column to group by").click();
  cy.get(".List-section-title").contains("Products").click();
  cy.findByText("Category").click();

  visualize();

  cy.get(".bar").should("have.length", 4);

  cy.findByTestId("viz-settings-button").click();
  cy.contains("Show values on data points").next().click();
  cy.contains("3.71");

  cy.findByText("Save").click();
  cy.findByLabelText("Name").clear().type("Rating of Best-selling Products");
  cy.findByLabelText("Description").type(
    "The average rating of our top selling products broken down into categories.",
    { delay: 0 },
  );
  cy.button("Save").click();
  cy.findByText("Not now").click();

  cy.visit("/question/new");
  cy.findByText("Custom question").click();
  cy.findByText(/Sample (Dataset|Database)/).click();
  cy.findByText("Orders").click();

  cy.findByText("Pick the metric you want to see").click();
  cy.findByText("Common Metrics").click();
  cy.findByText("Revenue").click();

  cy.findByText("Pick a column to group by").click();
  cy.findByText("Created At")
    .closest(".List-item")
    .findByText("by month")
    .click({ force: true });
  cy.findByText("Quarter").click();
  cy.findByText("Created At: Quarter");

  visualize();
  cy.get("circle");

  cy.findByTestId("viz-settings-button").click();
  cy.icon("area").click();
  cy.findByText("Goal line").next().click();
  cy.findByDisplayValue("0").type("100000").blur();
  cy.get(".line");
  cy.findByText("Goal");

  cy.findByText("Save").click();
  cy.findByLabelText("Name").clear().type("Quarterly Revenue");
  cy.button("Save").click();
  cy.findByText("Not now").click();
});
