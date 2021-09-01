import { restore, popover, modal } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

describe("scenarios > admin > datamodel > metrics", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(1400, 860);
  });

  describe("with no metrics", () => {
    it("should show no metrics in the list", () => {
      cy.visit("/admin/datamodel/metrics");
      cy.findByText(
        "Create metrics to add them to the Summarize dropdown in the query builder",
      );
    });

    it.skip("should have 'Custom expression' in a filter list (metabase#13069)", () => {
      cy.visit("/admin/datamodel/metrics");
      cy.findByText("New metric").click();
      cy.findByText("Select a table").click();
      popover().within(() => {
        cy.findByText("Orders").click();
      });
      cy.findByText("Add filters to narrow your answer").click();

      cy.log("Fails in v0.36.0 and v0.36.3. It exists in v0.35.4");
      popover().within(() => {
        cy.findByText("Custom Expression");
      });
    });

    it("should show how to create metrics", () => {
      cy.visit("/reference/metrics");
      cy.findByText(
        "Metrics are the official numbers that your team cares about",
      );
      cy.findByText("Learn how to create metrics");
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

    it("should show no questions based on a new metric", () => {
      cy.visit("/reference/metrics/1/questions");
      cy.findAllByText("Questions about orders < 100");
      cy.findByText("Loading...");
      cy.findByText("Loading...").should("not.exist");
      cy.findByText(
        "Questions about this metric will appear here as they're added",
      );
    });

    it("should see a newly asked question in its questions list", () => {
      // Ask a new qustion
      cy.visit("/reference/metrics/1/questions");
      cy.get(".full")
        .find(".Button")
        .click();
      cy.findByText("Filter").click();
      cy.findByText("Total").click();
      cy.findByText("Equal to").click();
      cy.findByText("Greater than").click();
      cy.findByPlaceholderText("Enter a number").type("50");
      cy.findByText("Add filter").click();
      cy.findByText("Save").click();
      cy.findAllByText("Save")
        .last()
        .click();
      cy.findByText("Not now").click();

      // Check the list
      cy.visit("/reference/metrics/1/questions");
      cy.findByText("Our analysis").should("not.exist");
      cy.findAllByText("Questions about orders < 100");
      cy.findByText("Orders, orders < 100, Filtered by Total");
    });

    it("should show the metric detail view for a specific id", () => {
      cy.visit("/admin/datamodel/metric/1");
      cy.findByText("Edit Your Metric");
      cy.findByText("Preview");
    });

    it("should update that metric", () => {
      cy.visit("/admin");
      cy.contains("Data Model").click();
      cy.contains("Metrics").click();

      cy.contains("orders < 100")
        .parent()
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      cy.contains("Edit Metric").click();

      // update the filter from "< 100" to "> 10"
      cy.url().should("match", /metric\/1$/);
      cy.contains("Edit Your Metric");
      cy.contains(/Total\s+is less than/).click();
      popover()
        .contains("Less than")
        .click();
      popover()
        .contains("Greater than")
        .click();
      popover()
        .find("input")
        .type("{SelectAll}10");
      popover()
        .contains("Update filter")
        .click();

      // confirm that the preview updated
      cy.contains("Result: 18758");

      // update name and description, set a revision note, and save the update
      cy.get('[name="name"]').type("{selectall}orders > 10");
      cy.get('[name="description"]').type(
        "{selectall}Count of orders with a total over $10.",
      );
      cy.get('[name="revision_message"]').type("time for a change");
      cy.contains("Save changes").click();

      // get redirected to previous page and see the new metric name
      cy.url().should("match", /datamodel\/metrics$/);
      cy.contains("orders > 10");

      // clean up
      cy.contains("orders > 10")
        .parent()
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      cy.contains("Retire Metric").click();
      modal()
        .find("textarea")
        .type("delete it");
      modal()
        .contains("button", "Retire")
        .click();
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
      cy.findByText(
        'Unexpected input given to normalize. Expected type to be "object", found "string".',
      ).should("not.exist");

      cy.findByText("13022_Metric"); // Name
      cy.findByText("Orders, CE"); // Definition
    });
  });
});
