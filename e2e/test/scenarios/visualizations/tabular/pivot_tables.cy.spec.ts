const { H } = cy;
import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import {
  DataPermission,
  DataPermissionValue,
} from "metabase-types/api/permissions";

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
  { case: "question", subject: QUESTION_NAME },
  { case: "dashboard", subject: DASHBOARD_NAME },
] as const;

const EMBED_RESOURCES = {
  question: { alias: "@questionId", resource: "question" },
  dashboard: { alias: "@dashboardId", resource: "dashboard" },
} as const;

describe("scenarios > visualizations > pivot tables", { tags: "@slow" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow drill through on cells and on left/top header values", () => {
    createTestQuestion({ wrapId: true });

    cy.log("Drill through on a cell");
    // open drill-through menu
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("783").click();
    // drill through to orders list
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("See these Orders").click();
    // filters are applied
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User → Source is Affiliate");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product → Category is Doohickey");
    // data loads
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("45.04");

    cy.log("Drill through on header values");
    H.visitQuestion("@questionId");
    // open drill-through menu and filter to that value
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Doohickey").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    H.popover().within(() => cy.findByText("=").click());
    // filter is applied
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product → Category is Doohickey");
    // filter out affiliate as a source
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Affiliate").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    H.popover().within(() => cy.findByText("≠").click());
    // filter is applied and value is gone from the left header
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User → Source is not Affiliate");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Affiliate").should("not.exist");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("3,193"); // new grand total
  });

  it("should be able to use binned numeric dimensions as rows (metabase#14136) and as only columns (metabase#44500)", () => {
    // Sample database Orders > Count by Subtotal: Auto binned
    H.visitQuestionAdhoc({
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
      cy.findByText("Subtotal: 8 bins");
      cy.findByText("Count");
      cy.findByText("2,720");
      cy.findByText(/Grand totals/i);
      cy.findByText("18,760");
    });

    cy.log("Binned dimensions as pivot columns with no rows");
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.SUBTOTAL, { binning: { strategy: "default" } }],
            ["field", ORDERS.TAX, { binning: { strategy: "default" } }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: [],
          columns: ["SUBTOTAL", "TAX"],
          values: ["count"],
        },
      },
    });

    getPivotTableBodyCell(0).should("have.text", "34");
    getPivotTableBodyCell(1).should("have.text", "1,594");
    getPivotTableBodyCell(2).should("have.text", "823");
    getPivotTableBodyCell(3).should("have.text", "974");
    getPivotTableBodyCell(4).should("have.text", "3,104");
  });

  describe("issue 50346", () => {
    const questionDetails: StructuredQuestionDetails = {
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["count"],
          ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
        ],
        breakout: [
          [
            "field",
            PRODUCTS.CATEGORY,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
          [
            "field",
            PRODUCTS.VENDOR,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
          [
            "field",
            PEOPLE.SOURCE,
            { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
          ],
        ],
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          // mix field refs with and without `base-type` to make sure we support both cases
          rows: [
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
            [
              "field",
              PRODUCTS.VENDOR,
              { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
            ],
            [
              "field",
              PEOPLE.SOURCE,
              { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
            ],
          ],
          columns: [],
          values: [
            ["aggregation", 0],
            ["aggregation", 1],
          ],
        },
        "pivot_table.column_widths": {
          leftHeaderWidths: [150, 214, 120],
          totalLeftHeaderWidths: 484,
          valueHeaderWidths: {},
        },
      },
    };

    const groupValue = "Annetta Wyman and Sons";
    const totalValue = "1,217.76";

    beforeEach(() => {
      cy.signInAsNormalUser();
      cy.intercept("PUT", "/api/card/*").as("updateCard");
    });

    it("should be able to collapse rows for questions with legacy pivot settings (metabase#50346)", () => {
      H.createQuestion(questionDetails, { visitQuestion: true, wrapId: true });

      cy.log("collapse one of the sections");
      cy.findByTestId("pivot-table").within(() => {
        cy.findByText(totalValue).should("be.visible");
        cy.findByTestId(`${groupValue}-toggle-button`).click();
        cy.findByText(totalValue).should("not.exist");
      });

      cy.log("save and make sure the setting is preserved on reload");
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      cy.wait("@updateCard");
      H.visitQuestion("@questionId");
      cy.findByTestId("pivot-table").within(() => {
        cy.findByText(totalValue).should("not.exist");
      });

      cy.log("expand the section");
      cy.findByTestId("pivot-table").within(() => {
        cy.findByTestId(`${groupValue}-toggle-button`).click();
        cy.findByText(totalValue).should("be.visible");
      });
    });
  });

  it("should be created from an ad-hoc question and allow formatting and resizing columns", () => {
    H.visitQuestionAdhoc({ dataset_query: testQuery, display: "pivot" });

    H.openVizSettingsSidebar();
    openColumnSettings("Count");

    cy.log("Change the value formatting");
    cy.findByTestId("chart-settings-widget-number_style")
      .findByText("123%")
      .click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();
    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("78,300%");
    });

    cy.log("Change the title of a row column");
    H.openVizSettingsSidebar();
    openColumnSettings("User → Source");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Column title/);
    cy.get("input[id=column_title]").clear().type("ModifiedTITLE").blur();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();
    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("ModifiedTITLE");
    });

    cy.log("Resize columns and persist the sizes");
    cy.findAllByTestId("pivot-table-resize-handle")
      .first()
      .as("leftHeaderColHandle");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("pivot-table-resize-handle")
      .last()
      .as("totalHeaderColHandle");

    H.moveDnDKitElementByAlias("@leftHeaderColHandle", {
      horizontal: -100,
      vertical: 0,
    });

    H.moveDnDKitElementByAlias("@totalHeaderColHandle", {
      horizontal: 100,
      vertical: 0,
    });
    cy.findByTestId("pivot-table").within(() => {
      cy.findByText("ModifiedTITLE").should(($headerTextEl) => {
        expect(getCellWidth($headerTextEl)).equal(80); // min width is 80
      });
      cy.findByText("Row totals").should(($headerTextEl) => {
        expect(getCellWidth($headerTextEl)).equal(220);
      });
    });

    H.saveQuestion(undefined, undefined, {
      path: ["Our analytics"],
    });

    cy.reload(); // reload to make sure the settings are persisted
    cy.findByTestId("pivot-table").within(() => {
      cy.findByText("78,300%");
      cy.findByText("ModifiedTITLE").should(($headerTextEl) => {
        expect(getCellWidth($headerTextEl)).equal(80);
      });
      cy.findByText("Row totals").should(($headerTextEl) => {
        expect(getCellWidth($headerTextEl)).equal(220);
      });
    });
  });

  describe("dashboards", () => {
    it("should be scrollable even when tiny (metabase#24678)", () => {
      H.createQuestionAndDashboard({
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
      }).then(({ body: { dashboard_id } }) => H.visitDashboard(dashboard_id));

      H.dashboardCards()
        .eq(0)
        .within(() => {
          cy.findByText("Doohickey").scrollIntoView().should("be.visible");
        });
    });

    it("should allow filtering drill through (metabase#14632) (metabase#14465) and hide an empty pivot dashcard (UXW-4145)", () => {
      const FILTER_ID = "d7988e02";

      H.createQuestionAndDashboard({
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
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        cy.log(
          "Add an ID filter to the dashboard and map it to the pivot card",
        );
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: [{ id: FILTER_ID, name: "ID", slug: "id", type: "id" }],
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 8,
              parameter_mappings: [
                {
                  parameter_id: FILTER_ID,
                  card_id,
                  target: ["dimension", ["field", ORDERS.ID]],
                },
              ],
            },
          ],
        });
        cy.wrap(dashboard_id).as("dashboardId");
        H.visitDashboard(dashboard_id);
      });

      cy.log("Drill through a header value adds a filter");
      assertOnPivotFields();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Google").click(); // open drill-through menu
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      H.popover().within(() => cy.findByText("=").click()); // drill with additional filter
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("User → Source is Google"); // filter was added
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Row totals"); // it's still a pivot table
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("1,027"); // primary data value
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("3,798"); // subtotal value

      H.visitDashboard("@dashboardId");

      cy.log("Filtering to a value with no rows shows the no-results state");
      H.filterWidget().click();
      H.dashboardParametersPopover().within(() => {
        cy.findByPlaceholderText("Enter an ID").type("-1{enter}");
        cy.button("Add filter").click();
      });
      // Pre-fix this rendered a blank pivot; the grand-total row hid the emptiness.
      H.getDashboardCard(0).findByText("No results").should("be.visible");

      cy.log("Enabling 'hide if empty' removes the now-empty card");
      H.editDashboard();
      cy.findByTestId("dashboardcard-actions-panel").within(() => {
        cy.icon("palette").click({ force: true });
      });
      cy.findByRole("dialog").within(() => {
        cy.findByLabelText("Hide this card if there are no results").click({
          force: true,
        });
        cy.button("Done").click();
      });
      H.saveDashboard();

      cy.findByTestId("dashcard").should("not.exist");
    });

    it("should allow mapping pivot table dashcard fields to click behavior targets (metabase#52339)", () => {
      const questionDetails: StructuredQuestionDetails = {
        name: "Orders, Distinct values of ID, Grouped by Product → Title and Created At (month) and User → ID",

        query: {
          "source-table": ORDERS_ID,
          aggregation: [["distinct", ["field", ORDERS.ID, null]]],
          breakout: [
            ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
            ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
          ],
        },
        display: "pivot",
        visualization_settings: {
          "pivot_table.column_split": {
            rows: ["TITLE", "SOURCE"],
            columns: [],
            values: ["distinct"],
          },
        },
      };

      const sourceParam = {
        name: "Source",
        slug: "filter-text",
        id: "1b9cd9f1",
        type: "string/=",
        sectionId: "string",
      };

      H.createQuestionAndDashboard({
        dashboardDetails: {
          parameters: [sourceParam],
        },
        questionDetails,
        cardDetails: {
          size_x: 16,
          size_y: 8,
        },
      }).then(({ body: { id, card_id, dashboard_id }, questionId }) => {
        cy.wrap(questionId).as("questionId");

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 8,
              series: [],
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: sourceParam.id,
                  card_id,
                  target: [
                    "dimension",
                    [
                      "field",
                      PEOPLE.SOURCE,
                      {
                        "source-field": ORDERS.USER_ID,
                      },
                    ],
                  ],
                },
              ],
            },
          ],
        });

        H.visitDashboard(dashboard_id);
      });

      H.editDashboard();
      H.getDashboardCard(0)
        .realHover({ scrollBehavior: "bottom" })
        .findByLabelText("Click behavior")
        .click();

      H.sidebar().within(() => {
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Dashboard").click();
      });

      H.modal().findByText("Test Dashboard").click();

      cy.findByTestId("click-mappings").findByText("Source").click();

      H.popover().within(() => {
        cy.findByText("Product → Title");
        cy.findByText("User → Source");
        cy.findByText("Distinct values of ID");
      });
    });
  });

  describe("sharing (metabase#14447)", () => {
    beforeEach(() => {
      cy.viewport(1400, 800); // Row totals on embed preview was getting cut off at the normal width
      cy.log("Create a question");

      H.createQuestionAndDashboard({
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

        cy.wrap(card_id).as("questionId");
        cy.wrap(dashboard_id).as("dashboardId");
      });
    });

    TEST_CASES.forEach((test) => {
      describe(test.case, () => {
        it("should display pivot table in an embed URL and a public link", () => {
          cy.visit("collection/root");
          // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
          cy.findByText(test.subject).click();
          cy.findByTestId("pivot-table").should("be.visible");
          if (test.case === "question") {
            H.openSharingMenu();
            H.modal().within(() => {
              cy.findByText("Save").click();
            });
          }
          H.openSharingMenu();
          H.sharingMenu()
            .findByText(/public link/i)
            .click();
          cy.findByTestId("public-link-popover-content")
            .findByTestId("public-link-input")
            .invoke("val")
            .as("publicLink", { type: "static" });
          cy.get("body").click("topLeft");
          cy.findByTestId("public-link-popover-content").should("not.exist");

          const { alias, resource } = EMBED_RESOURCES[test.case];

          cy.get<number>(alias).then((id) => {
            H.openLegacyStaticEmbeddingModal({
              resource: resource,
              resourceId: id,
              activeTab: "parameters",
              unpublishBeforeOpen: false,
            });
          });

          // visit the iframe src directly to ensure it's not sing preview endpoints
          H.visitIframe();

          cy.findByTestId("embed-frame-header").contains(test.subject);
          assertOnPivotFields();

          cy.get<string>("@publicLink").then((publicLink) =>
            cy.visit(publicLink),
          );
          cy.findByTestId("embed-frame-header").contains(test.subject);
          assertOnPivotFields();
        });
      });
    });
  });

  it("should show a download widget with a hint about pivoted xlsx exports (metabase#14750)", () => {
    const HINT_TEXT =
      "Trying to pivot this data in Excel? You should download the raw data instead.";
    createTestQuestion();
    cy.icon("download").click();

    H.popover().within(() => {
      cy.findByText(".xlsx").click();
      cy.findByText(HINT_TEXT);
      cy.findByText("Read the docs").should(
        "have.attr",
        "href",
        "https://www.metabase.com/docs/latest/questions/exporting-results.html#exporting-pivot-tables",
      );

      cy.findByLabelText("Close hint").click();
      cy.findByText(HINT_TEXT).should("not.exist");

      cy.findByText("Download");
    });

    // Ensure the hint is not visible after a page reload
    cy.reload();

    cy.icon("download").click();
    H.popover().within(() => {
      cy.findByText(".xlsx").click();
      cy.findByLabelText(".xlsx").should("be.checked");
      cy.findByText(HINT_TEXT).should("not.exist");
    });
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

    H.visitQuestionAdhoc({
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();
    H.leftSidebar().within(() => {
      // This part is still failing. Uncomment when fixed.
      // cy.findByText("Pivot Table")
      //   .parent()
      //   .should("have.css", "opacity", "1");
      cy.findByTestId("more-charts-toggle").click();
      cy.icon("pivot_table").click({ force: true });
    });

    cy.wait("@datasetPivot");
    cy.findByTestId("query-visualization-root").within(() => {
      cy.contains("Row totals");
      cy.findByText("333"); // Row totals for 2027
      cy.findByText("Grand totals");
    });
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
            // the data group keeps its full view-data access
            [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
            [DataPermission.CREATE_QUERIES]: {
              PUBLIC: {
                [PRODUCTS_ID]: DataPermissionValue.NO,
              },
            },
          },
        },
      });

      H.createQuestion(
        {
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: ["count"],
            breakout: [categoryField, createdAtField],
          },
          display: "pivot",
          visualization_settings: {
            "pivot_table.column_split": {
              rows: ["CREATED_AT"],
              columns: ["CATEGORY"],
              values: ["count"],
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
      H.visitQuestion("@questionId");
      H.openVizSettingsSidebar();
      cy.findByLabelText("Show row totals").click({ force: true });

      cy.findByTestId("qb-save-button").should("have.attr", "data-disabled");
    });
  });

  describe("issue 38265", () => {
    beforeEach(() => {
      H.createQuestion(
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
      H.popover().findByText("Zoom in: State").click();

      cy.log("Filter pills");
      cy.findByTestId("filter-pill").should("have.text", "User → State is KS");

      cy.log("Pivot table column headings");
      cy.findByTestId("pivot-table")
        .should("contain", "Created At: Month")
        .and("contain", "User → Latitude")
        .and("contain", "User → Longitude");
    });
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

function createTestQuestion({ wrapId = false }: { wrapId?: boolean } = {}) {
  const questionDetails: StructuredQuestionDetails = {
    name: QUESTION_NAME,
    query: testQuery.query,
    display: "pivot",
  };

  return H.createQuestion(questionDetails, { visitQuestion: true, wrapId });
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

function openColumnSettings(columnName: string) {
  H.sidebar()
    .findByTestId(`draggable-item-${columnName}`)
    .icon("ellipsis")
    .click({ force: true });
}

function getCellWidth(textEl: JQuery<HTMLElement>) {
  return textEl.closest("[data-testid=pivot-table-cell]").width();
}

function getPivotTableBodyCell(index: number) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return cy
    .findByLabelText("pivot-table-body-grid")
    .findAllByTestId("pivot-table-cell")
    .eq(index);
}
