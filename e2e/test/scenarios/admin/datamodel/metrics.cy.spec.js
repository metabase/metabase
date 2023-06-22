import {
  restore,
  popover,
  modal,
  openOrdersTable,
  visualize,
  summarize,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > metrics", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(1400, 860);
  });

  it("should be possible to sort by metric (metabase#8283)", () => {
    cy.request("POST", "/api/metric", {
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
      cy.request("POST", "/api/metric", {
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
      cy.request("POST", "/api/metric", {
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

// Ugly hack to prevent failures that started after https://github.com/metabase/metabase/pull/24682 has been merged.
// For unknon reasons, popover doesn't open with expanded list of all Sample Database tables. Rather. it shows
// Sample Database (collapsed) only. We need to click on it to expand it.
// This conditional mechanism prevents failures even if that popover opens expanded in the future.
function selectTable(tableName) {
  cy.findByText("Select a table").click();

  cy.get(".List-section").then($list => {
    if ($list.length !== 5) {
      cy.findByText("Sample Database").click();
    }
    cy.findByText(tableName).click();
  });
}
