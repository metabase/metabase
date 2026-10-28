const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

describe("scenarios > joins", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("notebook", () => {
    it("should join raw tables (metabase#11452, metabase#12221, metabase#13468, metabase#15570)", () => {
      H.openOrdersTable({ mode: "notebook" });

      H.join();
      H.joinTable("Reviews", "Product ID", "Product ID");

      H.visualize();
      H.assertJoinValid({
        lhsTable: "Orders",
        rhsTable: "Reviews",
        lhsSampleColumn: "Product ID",
        rhsSampleColumn: "Reviews - Product → ID",
      });

      H.openNotebook();
      H.getNotebookStep("join").icon("chevrondown").click();
      H.popover().within(() => {
        cy.findByText("Product ID").click();
        cy.findByText("Body").click();
        cy.findByText("Created At").click();
      });
      H.visualize();

      H.assertJoinValid({
        lhsTable: "Orders",
        rhsTable: "Reviews",
        lhsSampleColumn: "Product ID",
        rhsSampleColumn: "Reviews - Product → Reviewer",
      });
      H.queryBuilderMain()
        .findByText("Reviews - Product → Body")
        .should("not.exist");

      // Post-join filters on the joined table (metabase#12221, metabase#15570)
      H.openNotebook();
      H.filter({ mode: "notebook" });
      H.popover().within(() => {
        cy.findByText("Reviews").click();
        cy.findByText("Rating").click();
      });
      H.selectFilterOperator("Equal to");
      H.popover().within(() => {
        cy.findByLabelText("2").click();
        cy.button("Add filter").click();
      });

      // Post-join aggregation (metabase#11452):
      H.summarize({ mode: "notebook" });
      H.addSummaryField({
        metric: "Average of ...",
        table: "Reviews",
        field: "Rating",
      });
      H.addSummaryGroupingField({ table: "Reviews", field: "Reviewer" });

      H.visualize();

      cy.findByTestId("qb-filters-panel").findByText(
        "Reviews - Product → Rating is equal to 2",
      );
      H.assertQueryBuilderRowCount(89);

      // Make sure UI overlay doesn't obstruct viewing results after we save this question (metabase#13468)
      cy.findByTestId("qb-header").button("Save").click();
      cy.findByTestId("save-question-modal")
        .findByLabelText(/Where do you want to save this/)
        .click();
      H.pickEntity({
        path: ["Our analytics"],
      });
      H.entityPickerModal().button("Select this collection").click();
      cy.findByTestId("save-question-modal").button("Save").click();

      cy.findByTestId("qb-filters-panel").findByText(
        "Reviews - Product → Rating is equal to 2",
      );
      H.assertQueryBuilderRowCount(89);
    });

    it("joining on a question with remapped values should work (metabase#15578)", () => {
      const JOINED_QUESTION_NAME = "15578";

      // Remap display value
      cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
        name: "Product ID",
        type: "external",
        human_readable_field_id: PRODUCTS.TITLE,
      });

      H.createQuestion({
        name: JOINED_QUESTION_NAME,
        query: { "source-table": ORDERS_ID },
      });

      H.openProductsTable({ mode: "notebook" });

      cy.button("Join data").click();
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText(JOINED_QUESTION_NAME).click();
      });

      H.visualize();

      H.queryBuilderHeader()
        .findByTestId("question-table-badges")
        .within(() => {
          cy.findByText("Products").should("be.visible");
          cy.findByText(JOINED_QUESTION_NAME).should("be.visible");
        });

      H.queryBuilderMain().within(() => {
        cy.findByText("Category").should("be.visible");
        cy.findByText(`${JOINED_QUESTION_NAME} → ID`).should("be.visible");
      });
    });

    it("correctly displays joined question's column names (metabase#27521)", () => {
      cy.signInAsNormalUser();
      cy.visit("/");

      cy.log("Create Q1");
      H.openOrdersTable({ mode: "notebook" });

      H.getNotebookStep("data").button("Pick columns").click();
      H.popover().findByText("Select all").click();

      cy.log("close popover");
      H.getNotebookStep("data").click();

      H.join();

      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });

      H.popover().findByText("ID").click();
      H.popover().findByText("ID").click();

      H.getNotebookStep("join", { stage: 0, index: 0 })
        .button("Pick columns")
        .click();
      H.popover().within(() => {
        cy.findByText("Select all").click();
        cy.findByText("ID").click();
      });

      H.visualize();
      assertTableHeader(0, "ID");
      assertTableHeader(1, "Orders_2 → ID");

      H.saveQuestion("Q1");

      assertTableHeader(0, "ID");
      assertTableHeader(1, "Orders_2 → ID");

      cy.log("Create second question (Products + Q1)");
      H.newButton("Question").click();
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("People").click();
      });

      H.getNotebookStep("data").button("Pick columns").click();
      H.popover().findByText("Select all").click();

      H.join();

      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("Q1").click();
      });

      H.popover().findByText("ID").click();
      H.popover().findByText("Orders_2 → ID").should("be.visible").click();
      H.getNotebookStep("join")
        .findByLabelText("Right column")
        .findByText("Q1 → ID")
        .should("be.visible")
        .click();
      H.popover()
        .findAllByText("Q1 → ID")
        .should("have.length", 2)
        .first()
        .click();

      H.visualize();

      assertTableHeader(0, "ID");
      assertTableHeader(1, "Q1 → ID");
      assertTableHeader(2, "Q1 → ID");

      H.openVizSettingsSidebar();
      cy.findByTestId("chartsettings-sidebar").within(() => {
        cy.findAllByText("ID").should("have.length", 1);
        cy.findAllByText("Q1 → ID").should("have.length", 2);

        cy.findByRole("button", { name: "Add or remove columns" }).click();
        cy.findAllByText("ID").should("have.length", 1);
        cy.findAllByText("Q1 → ID").should("have.length", 2);

        // TODO: add assertions for what happens when toggling all the columns here
        // See https://github.com/metabase/metabase/issues/27521#issuecomment-1948658757
      });
    });
  });

  describe("drills", () => {
    it("x-rays should work on explicit joins when metric is for the joined table (metabase#14793)", () => {
      const XRAY_DATASETS = 11; // enough to load most questions

      cy.intercept("GET", "/api/automagic-dashboards/adhoc/**").as("xray");
      cy.intercept("POST", "/api/dataset").as("postDataset");

      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": REVIEWS_ID,
            joins: [
              {
                fields: "all",
                "source-table": PRODUCTS_ID,
                condition: [
                  "=",
                  ["field", REVIEWS.PRODUCT_ID, null],
                  ["field", PRODUCTS.ID, { "join-alias": "Products" }],
                ],
                alias: "Products",
              },
            ],
            aggregation: [
              ["sum", ["field", PRODUCTS.PRICE, { "join-alias": "Products" }]],
            ],
            breakout: [
              ["field", REVIEWS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      H.cartesianChartCircle().eq(2).click({ force: true });

      H.popover().findByText("Automatic insights…").click();
      H.popover().findByText("X-ray").click();

      cy.wait("@xray").then((xhr) => {
        for (let i = 0; i < XRAY_DATASETS; ++i) {
          cy.wait("@postDataset");
        }
        expect(xhr.response.statusCode).not.to.eq(500);
        expect(xhr.response.body.cause).not.to.exist;
      });

      H.dashboardGrid()
        .findByText("How this metric is distributed across different numbers")
        .should("exist");

      cy.findByTestId("automatic-dashboard-header")
        .findByText(/^A closer look at/)
        .should("be.visible");

      H.getDashboardCards().should("have.length", 35);
    });

    it("should retain the filter when drilling through the dashboard card with implicitly added column (metabase#23293)", () => {
      cy.intercept("POST", "/api/card").as("saveQuestion");

      H.openOrdersTable();

      H.openVizSettingsSidebar();
      modifyColumn("Product ID", "remove");
      modifyColumn("Category", "add");
      cy.wait("@dataset");

      H.queryBuilderHeader().button("Save").click();
      cy.findByTestId("save-question-modal")
        .findByLabelText(/Where do you want to save this/)
        .click();
      H.pickEntity({
        path: ["Our analytics"],
      });
      H.entityPickerModal().findByText("Select this collection").click();
      cy.findByTestId("save-question-modal").button("Save").click();

      cy.wait("@saveQuestion").then(({ response }) => {
        const id = response.body.id;
        const questionDetails = {
          query: {
            "source-table": `card__${id}`,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                PRODUCTS.CATEGORY,
                {
                  "source-field": ORDERS.PRODUCT_ID,
                },
              ],
            ],
          },
          display: "bar",
        };

        H.createQuestionAndDashboard({ questionDetails }).then(
          ({ body: { dashboard_id } }) => {
            H.visitDashboard(dashboard_id);
          },
        );

        // Click on the first bar
        H.chartPathWithFillColor("#509EE3").first().realClick();
        H.popover()
          .findByText(/^See these/)
          .click();

        cy.findByTestId("qb-filters-panel").should(
          "contain",
          "Orders → Category is Doohickey",
        );
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        cy.findAllByTestId("header-cell")
          .last()
          .should("have.text", "Product → Category");

        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        cy.findAllByRole("grid")
          .last()
          .should("contain", "Doohickey")
          .and("not.contain", "Gizmo");
      });
    });

    it("should not drop fields from joined table on dashboard 'zoom-in' (metabase#27380)", () => {
      cy.intercept("POST", "/api/dataset").as("dataset");

      const questionDetails = {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              PRODUCTS.CREATED_AT,
              { "source-field": ORDERS.PRODUCT_ID, "temporal-unit": "month" },
            ],
          ],
        },
        display: "line",
      };
      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { dashboard_id } }) => {
          H.visitDashboard(dashboard_id);
        },
      );

      // Doesn't really matter which 'circle" we click on the graph
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.cartesianChartCircle().last().click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("See this month by week").click();
      cy.wait("@dataset");

      // Graph should still exist
      // Checks the y-axis label
      H.echartsContainer().findByText("Count");

      H.openNotebook();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").should("not.exist");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Product → Created At: Week");
    });
  });

  describe("models", () => {
    it("model based on multi-level nested saved question should work (metabase#22859-1)", () => {
      H.createQuestion(
        {
          name: "22859-Q1",
          query: {
            "source-table": REVIEWS_ID,
            joins: [
              {
                fields: "all",
                "source-table": PRODUCTS_ID,
                condition: [
                  "=",
                  ["field", REVIEWS.PRODUCT_ID, null],
                  ["field", PRODUCTS.ID, { "join-alias": "Products" }],
                ],
                alias: "Products",
              },
            ],
          },
        },
        { wrapId: true, idAlias: "q1Id" },
      );

      // Join Orders table with the previously saved question and save it again
      cy.get("@q1Id").then((id) => {
        H.createQuestion(
          {
            name: "22859-Q2",
            query: {
              "source-table": ORDERS_ID,
              joins: [
                {
                  fields: "all",
                  alias: `Question ${id}`,
                  condition: [
                    "=",
                    [
                      "field",
                      ORDERS.PRODUCT_ID,
                      { "base-type": "type/Integer" },
                    ],
                    [
                      "field",
                      REVIEWS.PRODUCT_ID,
                      {
                        "base-type": "type/Integer",
                        "join-alias": `Question ${id}`,
                      },
                    ],
                  ],
                  "source-table": `card__${id}`,
                },
              ],
              limit: 5,
            },
          },
          { wrapId: true, idAlias: "q2Id" },
        );
      });

      cy.get("@q2Id").then((id) => {
        // Convert the second question to a model
        cy.request("PUT", `/api/card/${id}`, { type: "model" });

        cy.intercept("POST", "/api/dataset").as("dataset");
        cy.visit(`/model/${id}`);
        cy.wait("@dataset");
      });

      cy.get("@q1Id").then((id) => {
        cy.findByText(`Question ${id} → ID`);
      });
    });
  });
});

function assertTableHeader(index, name) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByTestId("header-cell").eq(index).should("have.text", name);
}

/**
 * @param {string} columnName
 * @param {("add"|"remove")} action
 */
function modifyColumn(columnName, action) {
  cy.findByTestId("sidebar-left").within(() => {
    cy.findByRole("button", { name: "Add or remove columns" }).click();
    if (action === "add") {
      cy.findByLabelText(columnName).should("not.be.checked").click();
    } else {
      cy.findByLabelText(columnName).should("be.checked").click();
    }

    cy.findByRole("button", { name: "Done picking columns" }).click();
  });
}
