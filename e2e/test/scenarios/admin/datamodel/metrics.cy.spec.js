import {
  restore,
  popover,
  modal,
  openOrdersTable,
  visualize,
  summarize,
  filter,
  filterField,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createMetric } from "e2e/support/helpers/e2e-table-metadata-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > metrics", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(1400, 860);
  });

  it("should be possible to sort by metric (metabase#8283)", () => {
    createMetric({
      name: "Revenue",
      description: "Sum of orders subtotal",
      table_id: ORDERS_ID,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
      },
    });

    openOrdersTable({ mode: "notebook" });

    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Common Metrics").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Revenue").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sort").click();

    // Sorts ascending by default
    popover().contains("Revenue").click();

    // Let's make sure it's possible to sort descending as well
    cy.icon("arrow_up").click();

    cy.icon("arrow_down").parent().contains("Revenue");

    visualize();
    // Visualization will render line chart by default. Switch to the table.
    cy.icon("table2").click();

    cy.findAllByRole("grid").as("table");
    cy.get("@table")
      .first()
      .as("tableHeader")
      .within(() => {
        cy.get(".cellData").eq(1).invoke("text").should("eq", "Revenue");
      });

    cy.get("@table")
      .last()
      .as("tableBody")
      .within(() => {
        cy.get(".cellData").eq(1).invoke("text").should("eq", "50,072.98");
      });
  });

  describe("with no metrics", () => {
    it("should show no metrics in the list", () => {
      cy.visit("/admin/datamodel/metrics");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "Create metrics to add them to the Summarize dropdown in the query builder",
      );
    });

    it("should show how to create metrics", () => {
      cy.visit("/reference/metrics");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "Metrics are the official numbers that your team cares about",
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Learn how to create metrics");
    });

    it("custom expression aggregation should work in metrics (metabase#22700)", () => {
      cy.intercept("POST", "/api/dataset").as("dataset");

      const customExpression = "Count / Distinct([Product ID])";

      cy.visit("/admin/datamodel/metrics");

      cy.button("New metric").click();
      selectTable("Orders");
      // It sees that there is one dataset query for each of the fields:
      // `data`, `filtered by` and `view`
      cy.wait(["@dataset", "@dataset", "@dataset"]);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count").click();
      popover().contains("Custom Expression").click();

      cy.get(".ace_text-input")
        .click()
        .type(`{selectall}{del}`)
        .type(`{selectall}{del}${customExpression}`)
        .blur();

      cy.findByPlaceholderText("Something nice and descriptive").type("Foo");

      cy.button("Done").click();

      cy.wait("@dataset");

      // The test should fail on this step first
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Result: 93.8");

      // Let's make sure the custom expression is still preserved
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Foo").click();
      cy.get(".ace_content").should("contain", customExpression);
    });
  });

  describe("with metrics", () => {
    beforeEach(() => {
      // CREATE METRIC
      createMetric({
        definition: {
          aggregation: ["count"],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
          "source-table": ORDERS_ID,
        },
        name: "orders < 100",
        description: "Count of orders with a total under $100.",
        table_id: ORDERS_ID,
      });
    });

    it("should show no questions based on a new metric", () => {
      cy.visit("/reference/metrics/1/questions");
      cy.findAllByText("Questions about orders < 100");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Loading...");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Loading...").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "Questions about this metric will appear here as they're added",
      );
    });

    it("should see a newly asked question in its questions list", () => {
      // Ask a new qustion
      cy.visit("/reference/metrics/1/questions");
      cy.get(".full").find(".Button").click();

      filter();
      filterField("Total", {
        placeholder: "min",
        value: "50",
      });

      cy.findByTestId("apply-filters").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();
      cy.findAllByText("Save").last().click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Not now").click();

      // Check the list
      cy.visit("/reference/metrics/1/questions");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Our analysis").should("not.exist");
      cy.findAllByText("Questions about orders < 100");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "Orders, orders < 100, Filtered by Total is greater than or equal to 50",
      );
    });

    it("should show the metric detail view for a specific id", () => {
      cy.visit("/admin/datamodel/metric/1");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit Your Metric");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Preview");
    });

    it("should update that metric", () => {
      cy.visit("/admin");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Table Metadata").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Metrics").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("orders < 100")
        .parent()
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Edit Metric").click();

      // update the filter from "< 100" to "> 10"
      cy.url().should("match", /metric\/1$/);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Edit Your Metric");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(/Total\s+is less than/).click();
      popover().contains("Less than").click();
      popover().contains("Greater than").click();
      popover().find("input").type("{SelectAll}10");
      popover().contains("Update filter").click();

      // confirm that the preview updated
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Result: 18758");

      // update name and description, set a revision note, and save the update
      cy.get('[name="name"]').type("{selectall}orders > 10");
      cy.get('[name="description"]').type(
        "{selectall}Count of orders with a total over $10.",
      );
      cy.get('[name="revision_message"]').type("time for a change");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Save changes").click();

      // get redirected to previous page and see the new metric name
      cy.url().should("match", /datamodel\/metrics$/);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("orders > 10");

      // clean up
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("orders > 10")
        .parent()
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Retire Metric").click();
      modal().find("textarea").type("delete it");
      modal().contains("button", "Retire").click();
    });
  });

  describe("custom metrics", () => {
    it("should save the metric using custom expressions (metabase#13022)", () => {
      createMetric({
        name: "13022_Metric",
        desription: "desc",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              [
                "sum",
                [
                  "*",
                  ["field", ORDERS.DISCOUNT, null],
                  ["field", ORDERS.QUANTITY, null],
                ],
              ],
              { "display-name": "CE" },
            ],
          ],
        },
      });

      cy.log(
        "**Navigate to the metrics page and assert the metric was indeed saved**",
      );
      cy.visit("/admin/datamodel/metrics");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        'Unexpected input given to normalize. Expected type to be "object", found "string".',
      ).should("not.exist");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("13022_Metric"); // Name
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders, CE"); // Definition
    });

    it("should show CE that uses 'AND/OR' (metabase#13069, metabase#13070)", () => {
      cy.visit("/admin/datamodel/metrics");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New metric").click();

      selectTable("Orders");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filters to narrow your answer").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Custom Expression").click();
      cy.get(".ace_text-input")
        .clear()
        .type("[ID] > 0 OR [ID] < 9876543210")
        .blur();
      cy.button("Done").click();

      cy.log("**Assert that there is a filter text visible**");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("ID > 0 OR ID < 9876543210");
    });
  });
});

function selectTable(tableName) {
  cy.findByText("Select a table").click();
  popover().findByText(tableName).click();
}
