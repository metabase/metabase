import {
  signInAsAdmin,
  restore,
  visitQuestionAdhoc,
  getIframeBody,
  popover,
} from "__support__/cypress";
import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE } = SAMPLE_DATASET;

const QUESTION_NAME = "Cypress Pivot Table";
const DASHBOARD_NAME = "Pivot Table Dashboard";

const TEST_CASES = [
  { case: "question", subject: QUESTION_NAME },
  { case: "dashboard", subject: DASHBOARD_NAME },
];

describe("scenarios > visualizations > pivot tables", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should be created from an ad-hoc question", () => {
    visitQuestionAdhoc({ dataset_query: testQuery, display: "pivot" });

    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

    cy.findByText("Settings").click();
    assertOnPivotSettings();
    cy.get(".Visualization").within(() => {
      assertOnPivotFields();
    });
  });

  it("should correctly display saved question", () => {
    createAndVisitTestQuestion();
    cy.get(".Visualization").within(() => {
      assertOnPivotFields();
    });

    // Open Pivot table side-bar
    cy.findByText("Settings").click();

    assertOnPivotSettings();
  });

  it("should not show sub-total data after a switch to other viz type", () => {
    createAndVisitTestQuestion();

    // Switch to "ordinary" table
    cy.findByText("Visualization").click();
    cy.get(".Icon-table")
      .should("be.visible")
      .click();

    cy.contains(`Started from ${QUESTION_NAME}`);

    cy.log("**-- Assertions on a table itself --**");
    cy.get(".Visualization").within(() => {
      cy.findByText(/Users? → Source/);
      cy.findByText("783"); // Affiliate - Doohickey
      cy.findByText("986"); // Twitter - Gizmo
      cy.findByText(/Row totals/i).should("not.exist");
      cy.findByText(/Grand totals/i).should("not.exist");
      cy.findByText("3,520").should("not.exist");
      cy.findByText("4,784").should("not.exist");
      cy.findByText("18,760").should("not.exist");
    });
  });

  it("should allow drill through on cells", () => {
    createAndVisitTestQuestion();
    // open actions menu
    cy.findByText("783").click();
    // drill through to orders list
    cy.findByText("View these Orders").click();
    // filters are applied
    cy.findByText("Source is Affiliate");
    cy.findByText("Category is Doohickey");
    // data loads
    cy.findByText("45.04");
  });

  it("should allow drill through on left/top header values", () => {
    createAndVisitTestQuestion();
    // open actions menu and filter to that value
    cy.findByText("Doohickey").click();
    popover().within(() => cy.findByText("=").click());
    // filter is applied
    cy.findByText("Category is Doohickey");
    // filter out affiliate as a source
    cy.findByText("Affiliate").click();
    popover().within(() => cy.findByText("≠").click());
    // filter is applied and value is gone from the left header
    cy.findByText("Source is not Affiliate");
    cy.findByText("Affiliate").should("not.exist");
    cy.findByText("3,193"); // new grand total
  });

  it("should rearrange pivoted columns", () => {
    createAndVisitTestQuestion();

    // Open Pivot table side-bar
    cy.findByText("Settings").click();

    // Give it some time to open the side-bar fully before we start dragging
    cy.findByText(/Pivot Table options/i);

    // Drag the second aggregate (Product category) from table columns to table rows
    dragField(1, 0);

    // One field should now be empty
    cy.findByText("Drag fields here");

    cy.log("**-- Implicit assertions on a table itself --**");
    cy.get(".Visualization").within(() => {
      cy.findByText(/Products? → Category/);
      cy.findByText(/Users? → Source/);
      cy.findByText("Count");
      cy.findByText(/Totals for Doohickey/i);
      cy.findByText("3,976");
    });
  });

  it("should be able to use binned numeric dimension as a grouping (metabase#14136)", () => {
    // Sample dataset Orders > Count by Subtotal: Auto binned
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["binning-strategy", ["field-id", ORDERS.SUBTOTAL], "default"],
          ],
        },
        database: 1,
      },
      display: "pivot",
      visualization_settings: {},
    });

    cy.get(".Visualization").within(() => {
      cy.findByText("Subtotal");
      cy.findByText("Count");
      cy.findByText("2,720");
      cy.findByText(/Grand totals/i);
      cy.findByText("18,760");
    });
  });

  it("should allow collapsing rows", () => {
    // open a pivot table of order count grouped by source, category x year
    const b1 = ["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"];
    const b2 = [
      "fk->",
      ["field-id", ORDERS.PRODUCT_ID],
      ["field-id", PRODUCTS.CATEGORY],
    ];
    const b3 = [
      "fk->",
      ["field-id", ORDERS.USER_ID],
      ["field-id", PEOPLE.SOURCE],
    ];

    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [b1, b2, b3],
        },
        database: 1,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: [b2, b3],
          columns: [b1],
          values: [["aggregation", 0]],
        },
      },
    });

    cy.findByText("215"); // see a non-subtotal value

    // click to collapse rows
    cy.findByText("Doohickey")
      .parent()
      .find(".Icon-dash")
      .click();
    cy.findByText("1,352"); // subtotal is still there
    cy.findByText("215").should("not.exist"); // value is hidden

    // click to uncollapse
    cy.findByText("Totals for Doohickey")
      .parent()
      .find(".Icon-add")
      .click();
    cy.findByText("215"); // ...and it's back!

    // collapse the column
    cy.findByText("Product → Category")
      .parent()
      .find(".Icon-dash")
      .click();
    cy.findByText("215").should("not.exist"); // value is hidden
    cy.findByText("294").should("not.exist"); // value in another section is also hidden

    // uncollapse Doohickey
    cy.findByText("Totals for Doohickey")
      .parent()
      .find(".Icon-add")
      .click();
    cy.findByText("215"); // value in doohickey is visible
    cy.findByText("294").should("not.exist"); // the other one is still hidden
  });

  it("should allow hiding subtotals", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: testQuery.query.breakout,
          columns: [],
          values: [],
        },
      },
    });

    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

    cy.findByText("3,520"); // check for one of the subtotals

    // open settings
    cy.findByText("Settings").click();
    assertOnPivotSettings();

    // Confirm that Product -> Category doesn't have the option to hide subtotals
    cy.findAllByText("Fields to use for the table")
      .parent()
      .findByText(/Product → Category/)
      .click();
    cy.findByText("Show totals").should("not.exist");

    // turn off subtotals for User -> Source
    cy.findAllByText("Fields to use for the table")
      .parent()
      .findByText(/Users? → Source/)
      .click();
    cy.findByText("Show totals")
      .parent()
      .find("a")
      .click();

    cy.findByText("3,520").should("not.exist"); // the subtotal has disappeared!
  });

  it("should uncollapse a value when hiding the subtotals", () => {
    const rows = testQuery.query.breakout;
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": { rows, columns: [], values: [] },
        "pivot_table.collapsed_rows": { value: ['["Affiliate"]'], rows },
      },
    });

    cy.findByText("899").should("not.exist"); // confirm that "Affiliate" is collapsed
    cy.findByText("3,520"); // affiliate subtotal is visible

    // open settings
    cy.findByText("Settings").click();

    // turn off subtotals for User -> Source
    cy.findAllByText("Fields to use for the table")
      .parent()
      .findByText(/Users? → Source/)
      .click();
    cy.findByText("Show totals")
      .parent()
      .find("a")
      .click();

    cy.findByText("3,520").should("not.exist"); // the subtotal isn't there
    cy.findByText("899"); // Affiliate is no longer collapsed
  });

  it("should expand and collapse field options", () => {
    visitQuestionAdhoc({ dataset_query: testQuery, display: "pivot" });

    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

    cy.findByText("Settings").click();
    assertOnPivotSettings();
    cy.findAllByText("Fields to use for the table")
      .parent()
      .findByText(/Users? → Source/)
      .click();

    cy.log("**-- Collapse the options panel --**");
    cy.get(".Icon-chevronup").click();
    cy.findByText(/Formatting/).should("not.exist");
    cy.findByText(/See options/).should("not.exist");

    cy.log("**-- Expand it again --**");
    cy.get(".Icon-chevrondown")
      .first()
      .click();
    cy.findByText(/Formatting/);
    cy.findByText(/See options/);
  });

  it("should allow column formatting", () => {
    visitQuestionAdhoc({ dataset_query: testQuery, display: "pivot" });

    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

    cy.findByText("Settings").click();
    assertOnPivotSettings();
    cy.findAllByText("Fields to use for the table")
      .parent()
      .findByText(/Users? → Source/)
      .click();
    cy.findByText("Formatting");
    cy.findByText(/See options/).click();

    cy.log("**-- New panel for the column options --**");
    cy.findByText(/Column title/);

    cy.log("**-- Change the title for this column --**");
    cy.get("input[id=column_title]")
      .clear()
      .type("ModifiedTITLE");
    cy.findByText("Done").click();
    cy.get(".Visualization").within(() => {
      cy.findByText("ModifiedTITLE");
    });
  });

  it("should allow value formatting", () => {
    visitQuestionAdhoc({ dataset_query: testQuery, display: "pivot" });

    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

    cy.findByText("Settings").click();
    assertOnPivotSettings();
    cy.findAllByText("Fields to use for the table")
      .parent()
      .parent()
      .findAllByText(/Count/)
      .click();
    cy.findByText(/Formatting/);
    cy.findByText(/See options/).click();

    cy.log("**-- New panel for the column options --**");
    cy.findByText("Column title");
    cy.findByText("Style");
    cy.findByText("Separator style");

    cy.log("**-- Change the value formatting --**");
    cy.findByText("Normal").click();
    cy.findByText("Percent").click();
    cy.findByText("Done").click();
    cy.get(".Visualization").within(() => {
      cy.findByText("78,300%");
    });
  });

  it("should not allow sorting of value fields", () => {
    visitQuestionAdhoc({ dataset_query: testQuery, display: "pivot" });

    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

    cy.findByText("Settings").click();
    assertOnPivotSettings();
    cy.findAllByText("Fields to use for the table")
      .parent()
      .parent()
      .findAllByText(/Count/)
      .click();

    cy.findByText(/Formatting/);
    cy.findByText(/Sort order/).should("not.exist");
  });

  it("should allow sorting fields", () => {
    // Pivot by a single column with many values (100 bins).
    // Having many values hides values that are sorted to the end.
    // This lets us assert on presence of a certain value.
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["binning-strategy", ["field-id", ORDERS.TOTAL], "num-bins", 100],
          ],
        },
        database: 1,
      },
      display: "pivot",
    });

    // open settings and expand Total column settings
    cy.findByText("Settings").click();
    cy.findAllByText("Fields to use for the table")
      .parent()
      .findByText(/Total/)
      .click();

    // sort descending
    cy.get(".Icon-arrow_down").click();
    cy.findByText("158 – 160");
    cy.findByText("8 – 10").should("not.exist");

    // sort ascending
    cy.get(".Icon-arrow_up").click();
    cy.findByText("8 – 10");
    cy.findByText("158 – 160").should("not.exist");
  });

  it("should display an error message for native queries", () => {
    cy.server();
    // native queries should use the normal dataset endpoint even when set to pivot
    cy.route("POST", `/api/dataset`).as("dataset");

    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: { query: "select 1", "template-tags": {} },
        database: 1,
      },
      display: "pivot",
      visualization_settings: {},
    });

    cy.wait("@dataset");
    cy.findByText("Pivot tables can only be used with aggregated queries.");
  });

  describe("custom columns (metabase#14604)", () => {
    it("should work with custom columns as values", () => {
      visitQuestionAdhoc({
        dataset_query: {
          database: 1,
          query: {
            "source-table": ORDERS_ID,
            expressions: {
              "Twice Total": ["*", ["field-id", ORDERS.TOTAL], 2],
            },
            aggregation: [
              ["sum", ["field-id", ORDERS.TOTAL]],
              ["sum", ["expression", "Twice Total"]],
            ],
            breakout: [
              ["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"],
            ],
          },
          type: "query",
        },
        display: "pivot",
      });

      // value headings
      cy.findByText("Sum of Total");
      cy.findByText("Sum of Twice Total");

      // check values in the table
      cy.findByText("42,156.87"); // sum of total for 2016
      cy.findByText("84,313.74"); // sum of "twice total" for 2016

      // check grand totals
      cy.findByText("1,510,621.68"); // sum of total grand total
      cy.findByText("3,021,243.37"); // sum of "twice total" grand total
    });

    it("should work with custom columns as pivoted columns", () => {
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": PRODUCTS_ID,
            expressions: {
              category_foo: ["concat", ["field-id", PRODUCTS.CATEGORY], "foo"],
            },
            aggregation: [["count"]],
            breakout: [["expression", "category_foo"]],
          },
          database: 1,
        },
        display: "pivot",
      });

      cy.findByText("category_foo");
      cy.findByText("Doohickeyfoo");
      cy.findByText("42"); // count of Doohickeyfoo
      cy.findByText("200"); // grand total
    });
  });

  describe("dashboards", () => {
    beforeEach(() => {
      cy.log("**--1. Create a question--**");
      cy.request("POST", "/api/card", {
        name: QUESTION_NAME,
        dataset_query: testQuery,
        display: "pivot",
        visualization_settings: {},
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.log("**--2. Create new dashboard--**");
        cy.request("POST", "/api/dashboard", {
          name: DASHBOARD_NAME,
        }).then(({ body: { id: DASHBOARD_ID } }) => {
          cy.log("**--Add previously created question to that dashboard--**");
          cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cardId: QUESTION_ID,
          }).then(({ body: { id: DASH_CARD_ID } }) => {
            cy.log("**--Resize the dashboard card--**");
            cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
              cards: [
                {
                  id: DASH_CARD_ID,
                  card_id: QUESTION_ID,
                  row: 0,
                  col: 0,
                  sizeX: 12,
                  sizeY: 8,
                },
              ],
            });
            cy.log("**--Open the dashboard--**");
            cy.visit(`/dashboard/${DASHBOARD_ID}`);
          });
        });
      });
    });

    it("should display a pivot table on a dashboard (metabase#14465)", () => {
      assertOnPivotFields();
    });

    it("should allow filtering drill through (metabase#14632)", () => {
      assertOnPivotFields();
      cy.findByText("Google").click(); // open actions menu
      popover().within(() => cy.findByText("=").click()); // drill with additional filter
      cy.findByText("Source is Google"); // filter was added
      cy.findByText("Row totals"); // it's still a pivot table
      cy.findByText("1,027"); // primary data value
      cy.findByText("3,798"); // subtotal value
    });
  });

  describe("sharing (metabase#14447)", () => {
    beforeEach(() => {
      cy.viewport(1400, 800); // Row totals on embed preview was getting cut off at the normal width
      cy.log("**--1. Create a question--**");
      cy.request("POST", "/api/card", {
        name: QUESTION_NAME,
        dataset_query: testQuery,
        display: "pivot",
        visualization_settings: {},
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.log("**--1a. Enable sharing--**");
        cy.request("POST", `/api/card/${QUESTION_ID}/public_link`);

        cy.log("**--1b. Enable embedding--**");
        cy.request("PUT", `/api/card/${QUESTION_ID}`, {
          enable_embedding: true,
        });

        cy.log("**--2. Create new dashboard--**");
        cy.request("POST", "/api/dashboard", {
          name: DASHBOARD_NAME,
        }).then(({ body: { id: DASHBOARD_ID } }) => {
          cy.log("**--Add previously created question to that dashboard--**");
          cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cardId: QUESTION_ID,
          }).then(({ body: { id: DASH_CARD_ID } }) => {
            cy.log("**--Resize the dashboard card--**");
            cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
              cards: [
                {
                  id: DASH_CARD_ID,
                  card_id: QUESTION_ID,
                  row: 0,
                  col: 0,
                  sizeX: 12,
                  sizeY: 8,
                },
              ],
            });
          });

          cy.log("**--2a. Enable sharing--**");
          cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/public_link`);

          cy.log("**--2b. Enable embedding--**");
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
            enable_embedding: true,
          });
        });
        cy.visit(`/question/${QUESTION_ID}`);
      });
    });

    TEST_CASES.forEach(test => {
      describe(test.case, () => {
        beforeEach(() => {
          cy.visit("collection/root");
          cy.findByText(test.subject).click();
          cy.get(".Icon-share").click();
          if (test.case === "dashboard") {
            cy.findByText("Sharing and embedding").click();
          }
        });

        it("should display pivot table in a public link", () => {
          cy.findByText("Public link")
            .parent()
            .find("input")
            .invoke("val")
            .then($value => {
              cy.visit($value);
            });
          cy.get(".EmbedFrame-header").contains(test.subject);
          assertOnPivotFields();
        });

        // Skipped to avoid flake
        it.skip("should display pivot table in an embed preview", () => {
          cy.findByText(
            /Embed this (question|dashboard) in an application/,
          ).click();
          // we use preview endpoints when MB is iframed in itself
          cy.findByText(test.subject);
          getIframeBody().within(assertOnPivotFields);
        });

        it("should display pivot table in an embed URL", () => {
          cy.findByText(
            /Embed this (question|dashboard) in an application/,
          ).click();
          cy.findByText("Publish").click();
          // visit the iframe src directly to ensure it's not sing preview endpoints
          cy.get("iframe").then($iframe => {
            cy.visit($iframe[0].src);
            cy.get(".EmbedFrame-header").contains(test.subject);
            assertOnPivotFields();
          });
        });
      });
    });
  });

  it("should open the download popover (metabase#14750)", () => {
    createAndVisitTestQuestion();
    cy.get(".Icon-download").click();
    popover().within(() => cy.findByText("Download full results"));
  });
});

const testQuery = {
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["fk->", ["field-id", ORDERS.USER_ID], ["field-id", PEOPLE.SOURCE]],
      [
        "fk->",
        ["field-id", ORDERS.PRODUCT_ID],
        ["field-id", PRODUCTS.CATEGORY],
      ],
    ],
  },
  database: 1,
};

function createAndVisitTestQuestion({ display = "pivot" } = {}) {
  cy.request("POST", "/api/card", {
    name: QUESTION_NAME,
    dataset_query: testQuery,
    display,
    description: null,
    visualization_settings: {},
  }).then(({ body: { id: QUESTION_ID } }) => {
    cy.visit(`/question/${QUESTION_ID}`);
  });
}

function assertOnPivotSettings() {
  cy.get("[draggable=true]").as("fieldOption");

  cy.log("**-- Implicit side-bar assertions --**");
  cy.findByText(/Pivot Table options/i);

  cy.findAllByText("Fields to use for the table").eq(0);
  cy.get("@fieldOption")
    .eq(0)
    .contains(/Users? → Source/);
  cy.findAllByText("Fields to use for the table").eq(1);
  cy.get("@fieldOption")
    .eq(1)
    .contains(/Products? → Category/);
  cy.findAllByText("Fields to use for the table").eq(2);
  cy.get("@fieldOption")
    .eq(2)
    .contains("Count");
}

function assertOnPivotFields() {
  cy.log("**-- Implicit assertions on a table itself --**");

  cy.findByText(/Users? → Source/);
  cy.findByText(/Row totals/i);
  cy.findByText(/Grand totals/i);
  cy.findByText("3,520");
  cy.findByText("4,784");
  cy.findByText("18,760");
}

// Rely on native drag events, rather than on the coordinates
// We have 3 "drag-handles" in this test. Their indexes are 0-based.
function dragField(startIndex, dropIndex) {
  cy.get(".Grabber")
    .should("be.visible")
    .as("dragHandle");

  cy.get("@dragHandle")
    .eq(startIndex)
    .trigger("dragstart");

  cy.get("@dragHandle")
    .eq(dropIndex)
    .trigger("drop");
}
