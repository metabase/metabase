import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  visitQuestionAdhoc,
  popover,
  sidebar,
  visitQuestion,
  visitDashboard,
  visitIframe,
  dragField,
  leftSidebar,
  main,
  getIframeBody,
  openPublicLinkPopoverFromMenu,
  openStaticEmbeddingModal,
  modal,
  createQuestion,
  dashboardCards,
  queryBuilderMain,
  openNotebook,
  getNotebookStep,
} from "e2e/support/helpers";
import { PIVOT_TABLE_BODY_LABEL } from "metabase/visualizations/visualizations/PivotTable/constants";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

const QUESTION_NAME = "Cypress Pivot Table";
const DASHBOARD_NAME = "Pivot Table Dashboard";

const TEST_CASES = [
  { case: "question", subject: QUESTION_NAME, confirmSave: false },
  { case: "dashboard", subject: DASHBOARD_NAME, confirmSave: false },
];

describe("scenarios > visualizations > pivot tables", { tags: "@slow" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("createCard");
  });

  it("should be created from an ad-hoc question", () => {
    visitQuestionAdhoc({ dataset_query: testQuery, display: "pivot" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

    cy.findByTestId("viz-settings-button").click();
    assertOnPivotSettings();
    cy.findByTestId("query-visualization-root").within(() => {
      assertOnPivotFields();
    });
  });

  it("should correctly display saved question", () => {
    createTestQuestion();
    cy.findByTestId("query-visualization-root").within(() => {
      assertOnPivotFields();
    });

    // Open Pivot table side-bar
    cy.findByTestId("viz-settings-button").click();

    assertOnPivotSettings();
  });

  it("should not show sub-total data after a switch to other viz type", () => {
    createTestQuestion();

    // Switch to "ordinary" table
    cy.findByTestId("view-footer").findByText("Visualization").click();
    sidebar().icon("table2").should("be.visible").click();

    cy.findByTestId("app-bar").within(() => {
      cy.findByText("Started from");
      cy.findByText(QUESTION_NAME);
    });

    cy.log("Assertions on a table itself");
    cy.findByTestId("query-visualization-root").within(() => {
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
    createTestQuestion();
    // open drill-through menu
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("783").click();
    // drill through to orders list
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("See these Orders").click();
    // filters are applied
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User → Source is Affiliate");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product → Category is Doohickey");
    // data loads
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("45.04");
  });

  it("should allow drill through on left/top header values", () => {
    createTestQuestion();
    // open drill-through menu and filter to that value
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Doohickey").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("=").click());
    // filter is applied
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product → Category is Doohickey");
    // filter out affiliate as a source
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Affiliate").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("≠").click());
    // filter is applied and value is gone from the left header
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User → Source is not Affiliate");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Affiliate").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("3,193"); // new grand total
  });

  it("should rearrange pivoted columns", () => {
    createTestQuestion();

    // Open Pivot table side-bar
    cy.findByTestId("viz-settings-button").click();

    // Give it some time to open the side-bar fully before we start dragging
    assertOnPivotSettings();

    // Drag the second aggregate (Product category) from table columns to table rows
    dragField(1, 0);

    // One field should now be empty
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Drag fields here");

    cy.log("Implicit assertions on a table itself");
    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText(/Products? → Category/);
      cy.findByText(/Users? → Source/);
      cy.findByText("Count");
      cy.findByText(/Totals for Doohickey/i);
      cy.findByText("3,976");
    });
  });

  it("should be able to use binned numeric dimension as a grouping (metabase#14136)", () => {
    // Sample database Orders > Count by Subtotal: Auto binned
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.SUBTOTAL, { binning: { strategy: "default" } }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {},
    });

    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("Subtotal");
      cy.findByText("Count");
      cy.findByText("2,720");
      cy.findByText(/Grand totals/i);
      cy.findByText("18,760");
    });
  });

  it("should allow collapsing rows", () => {
    // open a pivot table of order count grouped by source, category x year
    const b1 = ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }];
    const b2 = [
      "field",
      PRODUCTS.CATEGORY,
      { "source-field": ORDERS.PRODUCT_ID },
    ];
    const b3 = ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }];

    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [b1, b2, b3],
        },
        database: SAMPLE_DB_ID,
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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("215"); // see a non-subtotal value

    // click to collapse rows
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Doohickey").parent().find(".Icon-dash").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1,352"); // subtotal is still there
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("215").should("not.exist"); // value is hidden

    // click to uncollapse
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Totals for Doohickey").parent().find(".Icon-add").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("215"); // ...and it's back!

    // collapse the column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product → Category").parent().find(".Icon-dash").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("215").should("not.exist"); // value is hidden
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("294").should("not.exist"); // value in another section is also hidden

    // uncollapse Doohickey
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Totals for Doohickey").parent().find(".Icon-add").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("215"); // value in doohickey is visible
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("294").should("not.exist"); // the other one is still hidden
  });

  it("should show standalone values when collapsed to the sub-level grouping (metabase#25250)", () => {
    const questionDetails = {
      name: "25250",
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: ["<", ["field", ORDERS.CREATED_AT, null], "2022-06-01"],
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ["field", ORDERS.USER_ID, null],
            ["field", ORDERS.PRODUCT_ID, null],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ["field", ORDERS.USER_ID, null],
            ["field", ORDERS.PRODUCT_ID, null],
          ],
          columns: [],
          values: [["aggregation", 0]],
        },
        "pivot_table.collapsed_rows": {
          value: [],
          rows: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ["field", ORDERS.USER_ID, null],
            ["field", ORDERS.PRODUCT_ID, null],
          ],
        },
      },
    };

    visitQuestionAdhoc(questionDetails);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1162").should("be.visible");
    // Collapse "User ID" column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User ID").parent().find(".Icon-dash").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Totals for 1162").should("be.visible");

    //Expanding the grouped column should still work
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Totals for 1162").parent().find(".Icon-add").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1162").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("34").should("be.visible");
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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("3,520"); // check for one of the subtotals

    // open settings
    cy.findByTestId("viz-settings-button").click();
    assertOnPivotSettings();

    // Confirm that Product -> Category doesn't have the option to hide subtotals
    openColumnSettings(/Product → Category/);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Show totals").should("not.be.visible");

    // turn off subtotals for User -> Source
    openColumnSettings(/Users? → Source/);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Show totals").parent().find("input").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("899").should("not.exist"); // confirm that "Affiliate" is collapsed
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("3,520"); // affiliate subtotal is visible

    // open settings
    cy.findByTestId("viz-settings-button").click();

    // turn off subtotals for User -> Source
    openColumnSettings(/Users? → Source/);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Show totals").parent().find("input").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("3,520").should("not.exist"); // the subtotal isn't there
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("899"); // Affiliate is no longer collapsed
  });

  it("should allow column formatting", () => {
    visitQuestionAdhoc({ dataset_query: testQuery, display: "pivot" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

    cy.findByTestId("viz-settings-button").click();
    assertOnPivotSettings();
    openColumnSettings(/Users? → Source/);

    cy.log("New panel for the column options");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Column title/);

    cy.log("Change the title for this column");
    cy.get("input[id=column_title]").clear().type("ModifiedTITLE").blur();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();
    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("ModifiedTITLE");
    });
  });

  it("should allow value formatting", () => {
    visitQuestionAdhoc({ dataset_query: testQuery, display: "pivot" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

    cy.findByTestId("viz-settings-button").click();
    assertOnPivotSettings();
    openColumnSettings(/Count/);

    cy.log("New panel for the column options");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Column title");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Style");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Separator style");

    cy.log("Change the value formatting");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Normal").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Percent").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();
    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("78,300%");
    });
  });

  it("should not allow sorting of value fields", () => {
    visitQuestionAdhoc({ dataset_query: testQuery, display: "pivot" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

    cy.findByTestId("viz-settings-button").click();
    assertOnPivotSettings();
    openColumnSettings(/Count/);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Sort order/).should("not.be.visible");
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
            [
              "field",
              ORDERS.TOTAL,
              { binning: { strategy: "num-bins", "num-bins": 100 } },
            ],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
    });

    // open settings and expand Total column settings
    cy.findByTestId("viz-settings-button").click();

    sortColumnResults("Total", "descending");
    cy.findAllByTestId("pivot-table").within(() => {
      cy.findByText("158 – 160").should("be.visible");
      cy.findByText("8 – 10").should("not.exist");
    });

    sortColumnResults("Total", "ascending");
    cy.findAllByTestId("pivot-table").within(() => {
      cy.findByText("8 – 10").should("be.visible");
      cy.findByText("158 – 160").should("not.exist");
    });
  });

  it("should display an error message for native queries", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: { query: "select 1", "template-tags": {} },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {},
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pivot tables can only be used with aggregated queries.");
  });

  describe("custom columns (metabase#14604)", () => {
    it("should work with custom columns as values", () => {
      visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            expressions: {
              "Twice Total": ["*", ["field", ORDERS.TOTAL, null], 2],
            },
            aggregation: [
              ["sum", ["field", ORDERS.TOTAL, null]],
              ["sum", ["expression", "Twice Total"]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          type: "query",
        },
        display: "pivot",
      });

      // value headings
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sum of Total");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sum of Twice Total");

      // check values in the table
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("42,156.87"); // sum of total for 2022
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("84,313.74"); // sum of "twice total" for 2022

      // check grand totals
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("1,510,621.68"); // sum of total grand total
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("3,021,243.37"); // sum of "twice total" grand total
    });

    it("should work with custom columns as pivoted columns", () => {
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": PRODUCTS_ID,
            expressions: {
              category_foo: [
                "concat",
                ["field", PRODUCTS.CATEGORY, null],
                "foo",
              ],
            },
            aggregation: [["count"]],
            breakout: [["expression", "category_foo"]],
          },
          database: SAMPLE_DB_ID,
        },
        display: "pivot",
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("category_foo");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Doohickeyfoo");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("42"); // count of Doohickeyfoo
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("200"); // grand total
    });
  });

  describe("dashboards", () => {
    it("should be scrollable even when tiny (metabase#24678)", () => {
      cy.createQuestionAndDashboard({
        questionDetails: {
          name: QUESTION_NAME,
          query: testQuery.query,
          display: "pivot",
        },
        dashboardDetails: {
          name: DASHBOARD_NAME,
        },
        cardDetails: {
          size_x: 3,
          size_y: 3,
        },
      }).then(({ body: { dashboard_id } }) => visitDashboard(dashboard_id));

      dashboardCards()
        .eq(0)
        .within(() => {
          cy.findByText("Doohickey").scrollIntoView().should("be.visible");
        });
    });

    it("should allow filtering drill through (metabase#14632) (metabase#14465)", () => {
      cy.createQuestionAndDashboard({
        questionDetails: {
          name: QUESTION_NAME,
          query: testQuery.query,
          display: "pivot",
        },
        dashboardDetails: {
          name: DASHBOARD_NAME,
        },
        cardDetails: {
          size_x: 16,
          size_y: 8,
        },
      }).then(({ body: { dashboard_id } }) => visitDashboard(dashboard_id));

      assertOnPivotFields();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Google").click(); // open drill-through menu
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      popover().within(() => cy.findByText("=").click()); // drill with additional filter
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("User → Source is Google"); // filter was added
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Row totals"); // it's still a pivot table
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("1,027"); // primary data value
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("3,798"); // subtotal value
    });
  });

  describe("sharing (metabase#14447)", () => {
    beforeEach(() => {
      cy.viewport(1400, 800); // Row totals on embed preview was getting cut off at the normal width
      cy.log("Create a question");

      cy.createQuestionAndDashboard({
        questionDetails: {
          name: QUESTION_NAME,
          query: testQuery.query,
          display: "pivot",
        },
        dashboardDetails: {
          name: DASHBOARD_NAME,
        },
        cardDetails: {
          size_x: 16,
          size_y: 8,
        },
      }).then(({ body: { card_id, dashboard_id } }) => {
        cy.log("Enable sharing on card");
        cy.request("POST", `/api/card/${card_id}/public_link`);

        cy.log("Enable embedding on card");
        cy.request("PUT", `/api/card/${card_id}`, {
          enable_embedding: true,
        });

        cy.log("Enable sharing on dashboard");
        cy.request("POST", `/api/dashboard/${dashboard_id}/public_link`);

        cy.log("Enable embedding on dashboard");
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          enable_embedding: true,
        });

        visitQuestion(card_id);
      });
    });

    TEST_CASES.forEach(test => {
      describe(test.case, () => {
        beforeEach(() => {
          cy.visit("collection/root");
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText(test.subject).click();
        });

        it("should display pivot table in a public link", () => {
          if (test.case === "question") {
            cy.icon("share").click();
            modal().within(() => {
              cy.findByText("Save").click();
            });
          }
          openPublicLinkPopoverFromMenu();
          cy.findByTestId("public-link-popover-content")
            .findByTestId("public-link-input")
            .invoke("val")
            .then($value => {
              cy.visit($value);
            });
          cy.findByTestId("embed-frame-header").contains(test.subject);
          assertOnPivotFields();
        });

        // Skipped to avoid flake
        it.skip("should display pivot table in an embed preview", () => {
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText(/Embed in your application/).click();
          // we use preview endpoints when MB is iframed in itself
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText(test.subject);
          getIframeBody().within(assertOnPivotFields);
        });

        it("should display pivot table in an embed URL", () => {
          if (test.case === "question") {
            cy.icon("share").click();
            modal().within(() => {
              cy.findByText("Save").click();
            });
          }

          openStaticEmbeddingModal({
            activeTab: "parameters",
            confirmSave: test.confirmSave,
          });

          // visit the iframe src directly to ensure it's not sing preview endpoints
          visitIframe();

          cy.findByTestId("embed-frame-header").contains(test.subject);
          assertOnPivotFields();
        });
      });
    });
  });

  it("should open the download popover (metabase#14750)", () => {
    createTestQuestion();
    cy.icon("download").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("Download full results"));
  });

  it.skip("should work for user without data permissions (metabase#14989)", () => {
    cy.request("POST", "/api/card", {
      name: "14989",
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            ["datetime-field", ["field-id", PRODUCTS.CREATED_AT], "year"],
            ["field-id", PRODUCTS.CATEGORY],
          ],
        },
        type: "query",
      },
      display: "pivot",
      visualization_settings: {},
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.signIn("nodata");
      visitQuestion(QUESTION_ID);
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Grand totals");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Row totals");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("200");
  });

  it("should work with custom mapping of display values (metabase#14985)", () => {
    cy.intercept("POST", "/api/dataset/pivot").as("datasetPivot");

    cy.log("Remap 'Reviews Rating' display values to custom values");
    cy.request("POST", `/api/field/${REVIEWS.RATING}/dimension`, {
      name: "Rating",
      type: "internal",
      human_readable_field_id: null,
    });

    cy.request("POST", `/api/field/${REVIEWS.RATING}/values`, {
      values: [
        [1, "A"],
        [2, "B"],
        [3, "C"],
        [4, "D"],
        [5, "E"],
      ],
    });

    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": REVIEWS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field-id", REVIEWS.RATING],
            ["datetime-field", ["field-id", REVIEWS.CREATED_AT], "year"],
          ],
        },
        type: "query",
      },
      display: "line",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();
    leftSidebar().within(() => {
      // This part is still failing. Uncomment when fixed.
      // cy.findByText("Pivot Table")
      //   .parent()
      //   .should("have.css", "opacity", "1");
      cy.icon("pivot_table").click({ force: true });
    });

    cy.wait("@datasetPivot");
    cy.findByTestId("query-visualization-root").within(() => {
      cy.contains("Row totals");
      cy.findByText("333"); // Row totals for 2024
      cy.findByText("Grand totals");
    });
  });

  it("should show stand-alone row values in grouping when rows are collapsed (metabase#15211)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.DISCOUNT, null]], ["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
            ["field", ORDERS.PRODUCT_ID, null],
          ],
          filter: [
            "and",
            [
              "between",
              ["field", ORDERS.CREATED_AT, null],
              "2022-11-09",
              "2022-11-11",
            ],
            ["!=", ["field", ORDERS.PRODUCT_ID, null], 146],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
            ["field", ORDERS.PRODUCT_ID, null],
          ],
          columns: [],
          values: [
            ["aggregation", 0],
            ["aggregation", 1],
          ],
        },
        "pivot_table.collapsed_rows": {
          value: [],
          rows: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
            ["field", ORDERS.PRODUCT_ID, null],
          ],
        },
      },
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("November 9, 2022");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("November 10, 2022");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("November 11, 2022");
    collapseRowsFor("Created At: Day");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Totals for November 9, 2022");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Totals for November 10, 2022");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Totals for November 11, 2022");

    function collapseRowsFor(column_name) {
      cy.findByText(column_name).parent().find(".Icon-dash").click();
    }
  });

  it("should not show subtotals for flat tables", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
            ["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }],
          ],
          filter: [">", ["field", ORDERS.CREATED_AT, null], "2026-01-01"],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: [
            ["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }],
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          ],
          columns: [
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
          values: [["aggregation", 0]],
        },
        "pivot_table.collapsed_rows": {
          value: [],
          rows: [
            ["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }],
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          ],
        },
      },
    });

    cy.findAllByText(/Totals for .*/i).should("have.length", 0);
  });

  it("should apply conditional formatting", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
            ["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }],
          ],
          filter: [">", ["field", ORDERS.CREATED_AT, null], "2026-01-01"],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: [
            ["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }],
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          ],
          columns: [
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
          values: [["aggregation", 0]],
        },
        "pivot_table.collapsed_rows": {
          value: [],
          rows: [
            ["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }],
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          ],
        },
      },
    });

    cy.findByTestId("viz-settings-button").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Conditional Formatting").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add a rule").click();
    cy.findByTestId("conditional-formatting-value-input").type("70");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("is equal to").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("is less than or equal to").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("[data-testid=pivot-table-cell]", "65.09").should(
      "have.css",
      "background-color",
      "rgba(80, 158, 227, 0.65)",
    );
  });

  it("should sort by metric (metabase#22872)", () => {
    const questionDetails = {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": REVIEWS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", REVIEWS.RATING, { "base-type": "type/Integer" }],
            [
              "field",
              REVIEWS.CREATED_AT,
              {
                "temporal-unit": "year",
                "base-type": "type/DateTimeWithLocalTZ",
              },
            ],
          ],
        },
        type: "query",
      },
      display: "pivot",
    };

    visitQuestionAdhoc(questionDetails);

    cy.findByTextEnsureVisible("Created At: Year");
    cy.findByTextEnsureVisible("Row totals");

    assertTopMostRowTotalValue("149");

    openNotebook();

    cy.findByTextEnsureVisible("Sort").click();

    popover().contains("Count").click();
    cy.wait("@pivotDataset");

    cy.button("Visualize").click();

    assertTopMostRowTotalValue("23");

    /**
     * @param { string } value
     */
    function assertTopMostRowTotalValue(value) {
      // Warning: Fragile selector!
      // TODO: refactor once we have a better HTML structure for tables.
      cy.get("[role=rowgroup] > div").eq(5).invoke("text").should("eq", value);
    }
  });

  it("should be horizontally scrollable when columns overflow", () => {
    const createdAtField = [
      "field",
      REVIEWS.CREATED_AT,
      {
        "temporal-unit": "month",
        "base-type": "type/DateTimeWithLocalTZ",
      },
    ];
    const ratingField = [
      "field",
      REVIEWS.RATING,
      { "base-type": "type/Integer" },
    ];

    const query = {
      "source-table": REVIEWS_ID,
      aggregation: [["count"]],
      breakout: [createdAtField, ratingField],
    };

    const vizSettings = {
      rows: ratingField,
      columns: createdAtField,
      "pivot_table.column_split": {
        rows: [ratingField],
        columns: [createdAtField],
        values: [["aggregation", 0]],
      },
    };

    cy.createQuestionAndDashboard({
      questionDetails: {
        name: QUESTION_NAME,
        query,
        display: "pivot",
        visualization_settings: vizSettings,
      },
      dashboardDetails: {
        name: DASHBOARD_NAME,
      },
      cardDetails: {
        size_x: 16,
        size_y: 8,
      },
    }).then(({ body: { dashboard_id }, questionId }) => {
      cy.wrap(questionId).as("questionId");
      visitDashboard(dashboard_id);
    });

    dashboardCards().within(() => {
      cy.findByLabelText(PIVOT_TABLE_BODY_LABEL).scrollTo(10000, 0);
      cy.findByText("Row totals").should("be.visible");
    });

    cy.get("@questionId").then(id => visitQuestion(id));

    queryBuilderMain().within(() => {
      cy.findByLabelText(PIVOT_TABLE_BODY_LABEL).scrollTo(10000, 0);
      cy.findByText("Row totals").should("be.visible");
    });
  });

  describe("column resizing", () => {
    const getCellWidth = textEl =>
      textEl.closest("[data-testid=pivot-table-cell]").width();

    it("should persist column sizes in visualization settings", () => {
      visitQuestionAdhoc({ dataset_query: testQuery, display: "pivot" });
      const leftHeaderColHandle = cy
        .findAllByTestId("pivot-table-resize-handle")
        .first();
      const totalHeaderColHandle = cy
        .findAllByTestId("pivot-table-resize-handle")
        .last();

      dragColumnHeader(leftHeaderColHandle, -100);
      dragColumnHeader(totalHeaderColHandle, 100);

      cy.findByTestId("pivot-table").within(() => {
        cy.findByText("User → Source").should($headerTextEl => {
          expect(getCellWidth($headerTextEl)).equal(80); // min width is 80
        });
        cy.findByText("Row totals").should($headerTextEl => {
          expect(getCellWidth($headerTextEl)).equal(200);
        });
      });

      cy.findByTestId("qb-header-action-panel").within(() => {
        cy.findByText("Save").click();
      });

      cy.findByTestId("save-question-modal").within(() => {
        cy.findByText("Save").click();
      });

      cy.get("#QuestionSavedModal").within(() => {
        cy.findByText("Not now").click();
      });

      cy.reload(); // reload to make sure the settings are persisted

      cy.findByTestId("pivot-table").within(() => {
        cy.findByText("User → Source").then($headerTextEl => {
          expect(getCellWidth($headerTextEl)).equal(80);
        });
        cy.findByText("Row totals").then($headerTextEl => {
          expect(getCellWidth($headerTextEl)).equal(200);
        });
      });
    });
  });

  it("should not have to wait for data to show fields in summarisation (metabase#26467)", () => {
    cy.intercept("POST", "api/card/pivot/*/query", req => {
      req.on("response", res => {
        res.setDelay(20_000);
      });
    });

    createTestQuestion({ visitQuestion: false }).then(({ body }) => {
      // manually visiting the question to avoid the auto wait logic,
      // we need to go to the editor while the query is still loading
      cy.visit(`/question/${body.id}`);
    });

    // confirm that it's loading
    main().findByText("Doing science...").should("be.visible");

    openNotebook();

    main().findByText("User → Source").click();

    popover().findByText("Address").click();

    main().findByText("User → Address").should("be.visible");
  });

  it("should return the same number of rows when running as an ad-hoc query vs a saved card (metabase#34278)", () => {
    const query = {
      type: "query",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
          ["field", PRODUCTS.EAN, { "base-type": "type/Text" }],
        ],
      },
      database: SAMPLE_DB_ID,
    };

    visitQuestionAdhoc({
      dataset_query: query,
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: [
            ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
            ["field", PRODUCTS.EAN, { "base-type": "type/Text" }],
          ],
          columns: [["field", "count", { "base-type": "type/Integer" }]],
          values: [["aggregation", 0]],
        },
      },
    });

    cy.findByTestId("question-row-count").should(
      "have.text",
      "Showing 205 rows",
    );

    cy.findByTestId("qb-header-action-panel").findByText("Save").click();
    cy.findByTestId("save-question-modal").findByText("Save").click();
    cy.wait("@createCard");
    cy.url().should("include", "/question/");
    cy.intercept("POST", "/api/card/pivot/*/query").as("cardPivotQuery");
    cy.reload();
    cy.wait("@cardPivotQuery");

    cy.findByTestId("question-row-count").should(
      "have.text",
      "Showing 205 rows",
    );
  });

  describe("issue 37380", () => {
    beforeEach(() => {
      const categoryField = [
        "field",
        PRODUCTS.CATEGORY,
        { "base-type": "type/Text" },
      ];

      const createdAtField = [
        "field",
        PRODUCTS.CREATED_AT,
        {
          "base-type": "type/DateTime",
          "temporal-unit": "month",
        },
      ];

      // to reproduce metabase#37380 it's important that user has access to the database, but not to the table
      cy.updatePermissionsGraph({
        [USER_GROUPS.DATA_GROUP]: {
          [SAMPLE_DB_ID]: {
            "create-queries": {
              PUBLIC: {
                [PRODUCTS_ID]: "no",
              },
            },
          },
        },
      });

      createQuestion(
        {
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: ["count"],
            breakout: [categoryField, createdAtField],
          },
          display: "pivot",
          visualization_settings: {
            "pivot_table.column_split": {
              rows: [createdAtField],
              columns: [categoryField],
              values: [["aggregation", 0]],
            },
            "pivot_table.column_widths": {
              leftHeaderWidths: [141],
              totalLeftHeaderWidths: 141,
              valueHeaderWidths: {},
            },
          },
        },
        {
          wrapId: true,
          idAlias: "questionId",
        },
      );
    });

    it("does not allow users with no table access to update pivot questions (metabase#37380)", () => {
      cy.signInAsNormalUser();
      visitQuestion("@questionId");
      cy.findByTestId("viz-settings-button").click();
      cy.findByLabelText("Show row totals").click();

      cy.findByTestId("qb-save-button").should("have.attr", "data-disabled");
    });
  });

  describe("issue 38265", () => {
    beforeEach(() => {
      createQuestion(
        {
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["count"],
              [
                "sum",
                ["field", ORDERS.SUBTOTAL, { "base-type": "type/Float" }],
              ],
            ],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
              [
                "field",
                PEOPLE.STATE,
                { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
              ],
              [
                "field",
                PRODUCTS.CATEGORY,
                { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
              ],
            ],
          },
          display: "pivot",
        },
        {
          visitQuestion: true,
        },
      );
    });

    it("correctly filters the query when zooming in on a **row** header (metabase#38265)", () => {
      cy.findByTestId("pivot-table").findByText("KS").click();
      popover().findByText("Zoom in").click();

      cy.log("Filter pills");
      cy.findByTestId("filter-pill").should("have.text", "User → State is KS");

      cy.log("Pivot table column headings");
      cy.findByTestId("pivot-table")
        .should("contain", "Created At: Month")
        .and("contain", "User → Latitude")
        .and("contain", "User → Longitude");
    });
  });

  it("should be possible to switch between notebook and simple views when pivot table is the visualization (metabase#39504)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "sum",
              [
                "field",
                ORDERS.SUBTOTAL,
                {
                  "base-type": "type/Float",
                },
              ],
            ],
            [
              "sum",
              [
                "field",
                ORDERS.TOTAL,
                {
                  "base-type": "type/Float",
                },
              ],
            ],
          ],
          breakout: [
            [
              "field",
              PEOPLE.SOURCE,
              {
                "base-type": "type/Text",
                "source-field": ORDERS.USER_ID,
              },
            ],
          ],
        },
        type: "query",
      },
    });

    cy.log("Set the visualization to pivot table using the UI");
    cy.intercept("POST", "/api/dataset/pivot").as("pivotDataset");
    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("Pivot Table-button").click();
    cy.wait("@pivotDataset");
    cy.findByTestId("pivot-table")
      .should("contain", "User → Source")
      .and("contain", "Sum of Subtotal")
      .and("contain", "Sum of Total")
      .and("contain", "Grand totals");

    openNotebook();
    getNotebookStep("summarize")
      .should("be.visible")
      .and("contain", "Sum of Subtotal")
      .and("contain", "Sum of Total");

    // Close the notebook editor
    openNotebook();
    cy.findByTestId("pivot-table")
      .should("contain", "User → Source")
      .and("contain", "Sum of Subtotal")
      .and("contain", "Sum of Total")
      .and("contain", "Grand totals");
  });

  it("displays total values for collapsed rows (metabase#26919)", () => {
    const categoryField = [
      "field",
      PRODUCTS.CATEGORY,
      { "base-type": "type/Text" },
    ];

    createQuestion(
      {
        display: "pivot",
        query: {
          "source-table": PRODUCTS_ID,
          expressions: {
            test: [
              "case",
              [[["is-null", categoryField], categoryField]],
              { default: categoryField },
            ],
          },
          aggregation: [["count"]],
          breakout: [
            ["expression", "test", { "base-type": "type/Text" }],
            [
              "field",
              PRODUCTS.RATING,
              {
                "base-type": "type/Float",
                binning: {
                  strategy: "default",
                },
              },
            ],
          ],
        },
        visualization_settings: {
          "pivot_table.column_split": {
            rows: [
              ["expression", "test"],
              ["field", PRODUCTS.RATING],
            ],
            columns: [],
            values: [["aggregation", 0]],
          },
          "pivot_table.collapsed_rows": {
            value: ['["Doohickey"]', '["Gadget"]', '["Gizmo"]', '["Widget"]'],
            rows: [
              ["expression", "test"],
              [
                "field",
                PRODUCTS.RATING,
                {
                  "base-type": "type/Float",
                  binning: {
                    strategy: "num-bins",
                    "min-value": 0,
                    "max-value": 5.25,
                    "num-bins": 8,
                    "bin-width": 0.75,
                  },
                },
              ],
            ],
          },
        },
      },
      { visitQuestion: true },
    );

    getPivotTableBodyCell(0).should("have.text", "42");
    getPivotTableBodyCell(1).should("have.text", "53");
    getPivotTableBodyCell(2).should("have.text", "51");
    getPivotTableBodyCell(3).should("have.text", "54");
    getPivotTableBodyCell(4).should("have.text", "200");
  });
});

const testQuery = {
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        PEOPLE.SOURCE,
        { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
      ],
      [
        "field",
        PRODUCTS.CATEGORY,
        { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
      ],
    ],
  },
  database: SAMPLE_DB_ID,
};

function createTestQuestion({ display = "pivot", visitQuestion = true } = {}) {
  const { query } = testQuery;
  const questionDetails = { name: QUESTION_NAME, query, display };

  return cy.createQuestion(questionDetails, { visitQuestion });
}

function assertOnPivotSettings() {
  cy.findAllByTestId(/draggable-item/).as("fieldOption");

  cy.log("Implicit side-bar assertions");

  cy.findAllByTestId("pivot-table-setting").eq(0);
  cy.get("@fieldOption")
    .eq(0)
    .contains(/Users? → Source/);
  cy.findAllByTestId("pivot-table-setting").eq(1);
  cy.get("@fieldOption")
    .eq(1)
    .contains(/Products? → Category/);
  cy.findAllByTestId("pivot-table-setting").eq(2);
  cy.get("@fieldOption").eq(2).contains("Count");
}

function assertOnPivotFields() {
  cy.log("Implicit assertions on a table itself");

  cy.findByText(/Users? → Source/);
  cy.findByText(/Row totals/i);
  cy.findByText(/Grand totals/i);
  cy.findByText("3,520");
  cy.findByText("4,784");
  cy.findByText("18,760");
}

function dragColumnHeader(el, xDistance = 50) {
  const HANDLE_WIDTH = xDistance > 0 ? 2 : -2;
  el.then($el => {
    const currentXPos = $el[0].getBoundingClientRect().x;
    el.trigger("mousedown", { which: 1 })
      .trigger("mousemove", {
        clientX: currentXPos + (xDistance + HANDLE_WIDTH),
      })
      .trigger("mouseup");
  });
}

function openColumnSettings(columnName) {
  sidebar()
    .findByText(columnName)
    .siblings("[data-testid$=settings-button]")
    .click();
}

/**
 * @param {string} column
 * @param {("ascending"|"descending")} direction
 */
function sortColumnResults(column, direction) {
  const iconName = direction === "ascending" ? "arrow_up" : "arrow_down";

  cy.findByTestId("sidebar-content")
    .findByTestId(`${column}-settings-button`)
    .click();

  popover().icon(iconName).click();
  // Click anywhere to dismiss the popover from UI
  cy.get("body").click("topLeft");

  cy.location("hash").then(hash => {
    // Get rid of the leading `#`
    const base64EncodedQuery = hash.slice(1);
    const decodedQuery = atob(base64EncodedQuery);
    expect(decodedQuery).to.include(direction);
  });
}

function getPivotTableBodyCell(index) {
  return cy
    .findByLabelText("pivot-table-body-grid")
    .findAllByTestId("pivot-table-cell")
    .eq(index);
}
