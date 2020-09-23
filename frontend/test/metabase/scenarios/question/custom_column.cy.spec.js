import {
  restore,
  signInAsNormalUser,
  popover,
  _typeUsingGet,
  _typeUsingPlaceholder,
} from "../../../__support__/cypress";

const customFormulas = [
  {
    customFormula: "[Quantity] * 2",
    columnName: "Double Qt",
  },
  { customFormula: "[Quantity] * [Product.Price]", columnName: "Sum Total" },
];

function firstCell(contain_assertion, value) {
  cy.get(".TableInteractive-cellWrapper")
    .not(".TableInteractive-headerCellData")
    .first()
    .should(contain_assertion, value);
}

describe("scenarios > question > custom columns", () => {
  before(restore);
  beforeEach(signInAsNormalUser);

  it.skip("cc should only apply to correct column (Issue #12649)", () => {
    // Create custom question
    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Orders").click();
    cy.get(".Icon-join_left_outer").click();
    cy.findByText("Products").click();
    cy.findByText("Visualize").click();

    cy.wait(1000)
      .findByText("where")
      .should("not.exist");
    cy.findByText("Orders + Products");
    cy.findByText("Product → ID");
    firstCell("contain", 1);
    firstCell("not.contain", 14);

    // Add custom column formula
    cy.get(".Icon-notebook").click();
    cy.findByText("Custom column").click();
    popover().within($popover => {
      cy.get("p")
        .first()
        .click();
      cy.get("[contenteditable='true']")
        .type("1 + 1")
        .click();
      cy.get("input")
        .last()
        .type("X");
      cy.findByText("Done").click();
    });
    cy.findByText("Visualize").click();

    cy.findByText("Visualize").should("not.exist");
    cy.findByText("Product → ID");
    firstCell("contain", 1);
    firstCell("not.contain", 14);
  });

  it("can create a custom column (metabase#13241)", () => {
    const columnName = "Simple Math";
    // go straight to "orders" in custom questions
    cy.visit("/question/new?database=1&table=2&mode=notebook");
    cy.get(".Icon-add_data").click();

    popover().within(() => {
      _typeUsingGet("[contenteditable='true']", "1 + 1");
      _typeUsingPlaceholder("Something nice and descriptive", columnName);

      cy.findByText("Done").click();
    });

    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    cy.findByText("Visualize").click();
    cy.wait("@dataset");
    cy.findByText("There was a problem with your question").should("not.exist");
    cy.get(".Visualization").contains(columnName);
  });

  it("can create a custom column with an existing column name", () => {
    customFormulas.forEach(({ customFormula, columnName }) => {
      cy.visit("/question/new?database=1&table=2&mode=notebook");
      cy.get(".Icon-add_data").click();

      popover().within(() => {
        _typeUsingGet("[contenteditable='true']", customFormula);
        _typeUsingPlaceholder("Something nice and descriptive", columnName);

        cy.findByText("Done").click();
      });

      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");

      cy.findByText("Visualize").click();
      cy.wait("@dataset");
      cy.get(".Visualization").contains(columnName);
    });
  });

  it.skip("should create custom column with fields from aggregated data (metabase#12762)", () => {
    // go straight to "orders" in custom questions
    cy.visit("/question/new?database=1&table=2&mode=notebook");

    cy.findByText("Summarize").click();

    popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Subtotal").click();
    });

    // TODO: There isn't a single unique parent that can be used to scope this icon within
    // (a good candidate would be `.NotebookCell`)
    cy.get(".Icon-add")
      .last() // This is brittle.
      .click();

    popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });

    cy.findByText("Pick a column to group by").click();
    cy.findByText("Created At").click();

    // Add custom column based on previous aggregates
    const columnName = "MegaTotal";
    cy.findByText("Custom column").click();
    popover().within(() => {
      cy.get("[contenteditable='true']")
        .click()
        .type("[Sum of Subtotal] + [Sum of Total]");
      cy.findByPlaceholderText("Something nice and descriptive")
        .click()
        .type(columnName);
      cy.findByText("Done").click();
    });

    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    cy.findByText("Visualize").click();
    cy.wait("@dataset");
    cy.findByText("There was a problem with your question").should("not.exist");
    // This is a pre-save state of the question but the column name should appear
    // both in tabular and graph views (regardless of which one is currently selected)
    cy.get(".Visualization").contains(columnName);
  });

  it.skip("should allow 'zoom in' drill-through when grouped by custom column (metabase#13289)", () => {
    const columnName = "TestColumn";
    // go straight to "orders" in custom questions
    cy.visit("/question/new?database=1&table=2&mode=notebook");

    // Add custom column that will be used later in summarize (group by)
    cy.findByText("Custom column").click();
    popover().within(() => {
      _typeUsingGet("[contenteditable='true']", "1 + 1");
      _typeUsingPlaceholder("Something nice and descriptive", columnName);

      cy.findByText("Done").click();
    });

    cy.findByText("Summarize").click();
    popover().within(() => {
      cy.findByText("Count of rows").click();
    });

    cy.findByText("Pick a column to group by").click();
    popover().within(() => {
      cy.findByText(columnName).click();
    });

    cy.get(".Icon-add")
      .last()
      .click();

    popover().within(() => {
      cy.findByText("Created At").click();
    });

    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    cy.findByText("Visualize").click();
    cy.wait("@dataset");

    cy.get(".Visualization").within(() => {
      cy.get("circle")
        .eq(5) // random circle in the graph (there is no specific reason for this index)
        .click({ force: true });
    });

    // Test should work even without this request, but it reduces a chance for a flake
    cy.route("POST", "/api/dataset").as("zoom-in-dataset");

    cy.findByText("Zoom in").click();
    cy.wait("@zoom-in-dataset");

    cy.findByText("There was a problem with your question").should("not.exist");
  });
});
