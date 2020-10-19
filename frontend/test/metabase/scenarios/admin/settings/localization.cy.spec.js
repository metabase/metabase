import {
  restore,
  withSampleDataset,
  openOrdersTable,
  signInAsAdmin,
} from "__support__/cypress";

describe("scenarios > admin > permissions", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it.skip("should correctly apply start of the week to a bar chart (metabase#13516)", () => {
    // set the beginning of the week to "Monday"
    cy.visit("/admin/settings/localization");
    cy.findByText("Sunday").click();
    cy.findByText("Monday").click({ force: true });
    // make sure popover closed
    cy.findByText("Thursday").should("not.be.visible");

    // programatically create and save a question based on Orders table
    // filter: created before June 1st, 2016
    // summarize: Count by CreatedAt: Week
    withSampleDataset(({ ORDERS }) => {
      cy.request("POST", "/api/card", {
        name: "Orders created before June 1st 2016",
        dataset_query: {
          database: 1,
          query: {
            "source-table": 2,
            aggregation: [["count"]],
            breakout: [["datetime-field", ORDERS.CREATED_AT, "week"]],
            filter: ["<", ORDERS.CREATED_AT, "2016-06-01"],
          },
          type: "query",
        },
        display: "line",
        visualization_settings: {},
      });
    });

    // find and open that question
    cy.visit("/collection/root");
    cy.findByText("Orders created before June 1st 2016").click();

    cy.log("**Assert the dates on the X axis**");
    // it's hard and tricky to invoke hover in Cypress, especially in our graphs
    // that's why we have to assert on the x-axis, instead of a popover that shows on a dot hover
    cy.get(".axis.x").contains("April 25, 2016");
  });
});
