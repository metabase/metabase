import {
  restore,
  openOrdersTable,
  popover,
  visualize,
  summarize,
  startNewQuestion,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > question > joined questions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("joining on a question with remapped values should work (metabase#15578)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    // Remap display value
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    cy.createQuestion({
      name: "15578",
      query: { "source-table": ORDERS_ID },
    });

    startNewQuestion();
    cy.findByTextEnsureVisible("Sample Database").click();
    cy.findByTextEnsureVisible("Products").click();

    cy.icon("join_left_outer").click();

    popover()
      .findByText("Sample Database")
      .click();
    cy.findByText("Saved Questions").click();
    cy.findByText("15578").click();

    popover()
      .findByText("ID")
      .click();
    popover()
      // Implicit assertion - test will fail for multiple strings
      .findByText("Product ID")
      .click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });
  });

  it("should allow joins on multiple dimensions", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    openOrdersTable({ mode: "notebook" });

    joinTable("Products");
    selectJoinType("Inner join");

    cy.findByTestId("step-join-0-0").within(() => {
      cy.icon("add").click();
    });

    selectFromDropdown("Created At");
    selectFromDropdown("Created At");

    visualize();

    // 415 rows mean the join is done correctly,
    // (join on product's FK + join on the same "created_at" field)
    cy.findByText("Showing 415 rows");
  });

  it("should allow joins on date-time fields", () => {
    openOrdersTable({ mode: "notebook" });

    joinTable("Products");
    selectJoinType("Inner join");

    // Test join dimension infers parent dimension's temporal unit

    cy.findByTestId("parent-dimension").click();
    selectFromDropdown("by month", { force: true });
    selectFromDropdown("Week");

    cy.findByTestId("join-dimension").click();
    selectFromDropdown("Created At");

    assertDimensionName("parent", "Created At: Week");
    assertDimensionName("join", "Created At: Week");

    // Test changing a temporal unit on one dimension would update a second one

    cy.findByTestId("join-dimension").click();
    selectFromDropdown("by week", { force: true });
    selectFromDropdown("Day");

    assertDimensionName("parent", "Created At: Day");
    assertDimensionName("join", "Created At: Day");

    summarize({ mode: "notebook" });
    selectFromDropdown("Count of rows");

    visualize();

    // 2087 rows mean the join is done correctly,
    // (orders joined with products on the same day-month-year)
    cy.get(".ScalarValue").contains("2,087");
  });

  it("should show 'Previous results' instead of a table name for non-field dimensions", () => {
    openOrdersTable({ mode: "notebook" });

    summarize({ mode: "notebook" });
    selectFromDropdown("Count of rows");

    cy.findByText("Pick a column to group by").click();
    selectFromDropdown("Created At");

    cy.findByText("Join data").click();
    selectFromDropdown("Products");
    selectFromDropdown("Count");

    cy.findByTestId("step-join-1-0")
      .findByTestId("parent-dimension")
      .findByText("Previous results");
  });
});

function joinTable(table) {
  cy.findByText("Join data").click();
  popover()
    .findByText(table)
    .click();
}

function selectJoinType(strategy) {
  cy.icon("join_left_outer")
    .first()
    .click();
  popover()
    .findByText(strategy)
    .click();
}

function selectFromDropdown(option, clickOpts) {
  popover()
    .last()
    .findByText(option)
    .click(clickOpts);
}

function assertDimensionName(type, name) {
  cy.findByTestId(`${type}-dimension`).within(() => {
    cy.findByText(name);
  });
}
