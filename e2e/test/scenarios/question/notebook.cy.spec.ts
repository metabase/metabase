const { H } = cy;
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > notebook", { tags: "@slow" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow post-aggregation filters", () => {
    H.openTable({
      table: ORDERS_ID,
      mode: "notebook",
    });

    cy.findByRole("button", { name: "Summarize" }).click();

    // count orders by user id, filter to the one user with 46 orders
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Pick a function or metric").click();
    H.popover().within(() => {
      cy.findByText("Count of rows").click();
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Pick a column to group by").click();
    H.popover().within(() => {
      cy.contains("User ID").click();
    });
    cy.findByTestId("step-summarize-0-0").within(() => {
      cy.icon("filter").click();
    });
    H.popover().icon("int").click();
    H.selectFilterOperator("Equal to");
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("46");
      cy.contains("Add filter").click();
    });

    H.visualize();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("2372"); // user's id in the table
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 1 row"); // ensure only one user was returned
  });

  it("should render a step preview without the detail view column (metabase#63070)", () => {
    H.openOrdersTable({ mode: "notebook" });

    cy.findByTestId("step-preview-button").click();
    cy.findByTestId("table-scroll-container").should("contain", "37.65");
    cy.findAllByTestId("row-id-cell").should("have.length", 0);
  });

  it("should show the real number of rows instead of HARD_ROW_LIMIT when loading (metabase#17397)", () => {
    cy.intercept(
      {
        method: "POST",
        url: "/api/dataset",
        middleware: true,
      },
      (req) => {
        req.on("response", (res) => {
          res.setDelay(2000);
        });
      },
    ).as("dataset");

    const questionDetails = {
      query: {
        "source-table": ORDERS_ID,
        filter: ["=", ["field", ORDERS.PRODUCT_ID, null], 2],
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 98 rows");

    cy.findByTestId("filters-visibility-control").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID is 2").click();

    H.popover().within(() => {
      cy.findByLabelText("Filter value").focus().type("3").blur();
      cy.button("Update filter").click();
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID is 2 selections");

    cy.findByTestId("question-row-count").should(
      "have.text",
      "Showing 98 rows",
    );
    cy.wait("@dataset");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 175 rows");
  });

  describe("popover rendering issues (metabase#15502)", () => {
    beforeEach(() => {
      cy.viewport(1280, 720);
      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });
    });

    it("popover should render within the viewport and not cover the button that invoked it (metabase#15502-1, metabase#15502-2)", () => {
      H.getNotebookStep("filter")
        .findByText("Add filters to narrow your answer")
        .click();

      H.popover().isRenderedWithinViewport();
      // Click anywhere outside this popover to close it because the issue with rendering happens when popover opens for the second time
      H.getProfileLink().click();
      H.getNotebookStep("filter")
        .findByText("Add filters to narrow your answer")
        .click();
      H.popover().isRenderedWithinViewport();
      H.getProfileLink().click();

      H.getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();

      H.popover().findByText("Average of ...").should("be.visible");

      // Click outside to close this popover
      H.getProfileLink().click();
      // Popover invoked again blocks the button making it impossible to click the button for the third time
      H.getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
      H.getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
      H.popover().findByText("Average of ...").should("be.visible");
    });
  });

  it("should prompt to join with a model if the question is based on a model", () => {
    H.createQuestion({
      name: "Products model",
      query: { "source-table": PRODUCTS_ID },
      type: "model",
      display: "table",
    });

    H.createQuestion(
      {
        name: "Orders model",
        query: { "source-table": ORDERS_ID },
        type: "model",
        display: "table",
      },
      { visitQuestion: true },
    );

    H.openNotebook();

    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("Products model").click();
    });

    H.getNotebookStep("join").within(() => {
      cy.findByLabelText("Right table")
        .findByText("Products model")
        .should("be.visible");
      cy.findByLabelText("Left column")
        .findByText("Product ID")
        .should("be.visible");
      cy.findByLabelText("Right column")
        .findByText(/→ ID$/)
        .should("be.visible");
    });

    H.visualize();
    H.tableInteractive().should("be.visible");
  });

  describe('"median" aggregation function', { tags: "@external" }, () => {
    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();

      cy.request(`/api/database/${WRITABLE_DB_ID}/schema/public`).then(
        ({ body }) => {
          const tableId = body.find(
            (table: { id: number; name: string }) => table.name === "products",
          ).id;
          H.openTable({
            database: WRITABLE_DB_ID,
            table: tableId,
            mode: "notebook",
          });
        },
      );
    });

    it('should show "median" aggregation option for databases that support "percentile-aggregations" driver feature, in the notebook and the Summarize side panel', () => {
      cy.findByRole("button", { name: "Summarize" }).click();

      H.addSummaryField({ metric: "Median of ...", field: "Price" });

      H.getNotebookStep("summarize")
        .findByText("Median of Price")
        .should("be.visible");

      H.addSummaryGroupingField({ field: "Category" });

      H.visualize();

      cy.findByLabelText("Switch to data").click();
      cy.findAllByTestId("header-cell").should("contain", "Median of Price");

      H.summarize();

      H.openSummaryValueMenu("Median of Price");
      cy.findByRole("menuitem", { name: /^Median of/ }).should("be.visible");
    });

    it("should support custom columns", () => {
      H.addCustomColumn();
      H.enterCustomColumnDetails({
        formula: "Price * 10",
        name: "Mega price",
      });
      cy.button("Done").click();

      cy.findByRole("button", { name: /Summarize/ }).click();

      H.addSummaryField({ metric: "Median of ...", field: "Mega price" });
      H.addSummaryField({ metric: "Count of rows" });
      H.addSummaryGroupingField({ field: "Category" });
      H.addSummaryGroupingField({ field: "Vendor" });

      H.summarize({ mode: "notebook" });

      H.addSummaryField({
        metric: "Median of ...",
        field: "Median of Mega price",
        stage: 1,
      });
      H.addSummaryField({ metric: "Median of ...", field: "Count", stage: 1 });
      H.addSummaryGroupingField({ field: "Category", stage: 1 });

      H.visualize();

      cy.findByLabelText("Switch to data").click();
      cy.findAllByTestId("header-cell")
        .should("contain", "Median of Median of Mega price")
        .should("contain", "Median of Count");
    });
  });

  it("should properly render previews (metabase#28726, metabase#29959)", () => {
    H.startNewQuestion();

    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });

    H.getNotebookStep("data").as("dataStep");

    cy.get("@dataStep").within(() => {
      cy.icon("play").click();
      assertTableRowCount(10);
      cy.findByTextEnsureVisible("Subtotal");
      cy.findByTextEnsureVisible("Tax");
      cy.findByTextEnsureVisible("Total");
      cy.icon("close").click();
    });

    cy.button("Row limit").click();
    H.getNotebookStep("limit").within(() => {
      cy.findByPlaceholderText("Enter a limit").type("5").realPress("Tab");

      cy.icon("play").click();
      assertTableRowCount(5);

      cy.findByDisplayValue("5").type("{selectall}50").realPress("Tab");
      cy.button("Refresh").click();
      assertTableRowCount(10);
    });
  });

  it("should be able to drag-n-drop query clauses", () => {
    type MoveElementOpts = {
      name: string;
      horizontal?: number;
      vertical?: number;
      index: number;
    };

    type MoveElementInStepOpts = MoveElementOpts & {
      type: Parameters<typeof H.getNotebookStep>[0];
    };

    function moveElement({
      name,
      horizontal,
      vertical,
      index,
    }: MoveElementOpts) {
      cy.findByText(name).as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", {
        horizontal,
        vertical,
        useMouseEvents: true,
      });
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByTestId("notebook-cell-item")
        .eq(index)
        .should("have.text", name);
    }

    function verifyDragAndDrop() {
      H.getNotebookStep("expression").within(() => {
        moveElement({ name: "E1", horizontal: 100, index: 1 });
      });
      H.getNotebookStep("filter").within(() => {
        moveElement({ name: "ID is 2", horizontal: -100, index: 0 });
      });
      H.getNotebookStep("summarize").within(() => {
        cy.findByTestId("aggregate-step").within(() => {
          moveElement({ name: "Count", vertical: 100, index: 4 });
        });
        cy.findByTestId("breakout-step").within(() => {
          moveElement({ name: "ID", horizontal: 100, index: 1 });
        });
      });
      H.getNotebookStep("sort").within(() => {
        moveElement({ name: "Average of Total", horizontal: -100, index: 0 });
      });
    }

    function verifyPopoverDoesNotMoveElement({
      type,
      name,
      index,
      horizontal,
      vertical,
    }: MoveElementInStepOpts) {
      H.getNotebookStep(type).findByText(name).click();
      H.popover().within(() => {
        cy.findByText("Is").as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", {
          horizontal,
          vertical,
          useMouseEvents: true,
        });
      });
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.getNotebookStep(type)
        .findAllByTestId("notebook-cell-item")
        .eq(index)
        .should("have.text", name);
    }

    function verifyPopoverIsClosedAfterDragAndDrop({
      type,
      name,
      index,
      horizontal,
      vertical,
    }: MoveElementInStepOpts) {
      H.getNotebookStep(type).within(() => {
        cy.findByText(name).click();
      });
      H.popover().should("be.visible");
      H.getNotebookStep(type).within(() => {
        moveElement({ name, horizontal, vertical, index });
      });
      cy.get(H.POPOVER_ELEMENT).should("not.exist");
    }

    const questionDetails = {
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          E1: ["+", ["field", ORDERS.ID, null], 1],
          E2: ["+", ["field", ORDERS.ID, null], 2],
        },
        filter: [
          "and",
          ["=", ["field", ORDERS.ID, null], 1],
          ["=", ["field", ORDERS.ID, null], 2],
          ["=", ["field", ORDERS.ID, null], 3],
        ],
        breakout: [
          ["field", ORDERS.ID, null],
          ["field", ORDERS.PRODUCT_ID, null],
        ],
        aggregation: [
          ["count"],
          ["sum", ["field", ORDERS.TAX, null]],
          ["sum", ["field", ORDERS.SUBTOTAL, null]],
          ["sum", ["field", ORDERS.TOTAL, null]],
          ["avg", ["field", ORDERS.TOTAL, null]],
        ],
        "order-by": [
          ["asc", ["aggregation", 0]],
          ["asc", ["aggregation", 4]],
        ],
      },
    };
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();
    verifyDragAndDrop();
    verifyPopoverDoesNotMoveElement({
      type: "filter",
      name: "ID is 1",
      index: 1,
      horizontal: -100,
    });
    verifyPopoverIsClosedAfterDragAndDrop({
      type: "filter",
      name: "ID is 1",
      index: 0,
      horizontal: -100,
    });
  });

  it("should not leave the UI in broken state after adding an aggregation (metabase#48358)", () => {
    cy.visit("/");
    H.newButton("Question").click();
    H.miniPicker().findByText("Sample Database").click();
    H.miniPicker().findByText("Products").click();
    H.addSummaryField({ metric: "Sum of ...", field: "Price" });
    H.addSummaryGroupingField({ field: "Created At" });
    H.addSummaryGroupingField({ field: "Category" });
    H.visualize();
    H.saveQuestionToCollection();
    H.notebookButton().click();
    H.addSummaryField({ metric: "Sum of ...", field: "Rating" });
    H.visualize();
    H.saveSavedQuestion();
    H.notebookButton().click();
    cy.findByLabelText("View SQL").click();
    H.addSummaryField({ metric: "Sum of ...", field: "Price" });

    cy.findByTestId("loading-indicator").should("not.exist");
    H.NativeEditor.get()
      .should("include.text", 'SUM("PUBLIC"."PRODUCTS"."PRICE") AS "sum"')
      .and("include.text", 'SUM("PUBLIC"."PRODUCTS"."RATING") AS "sum_2"')
      .and("include.text", 'SUM("PUBLIC"."PRODUCTS"."PRICE") AS "sum_3"');
  });

  it("should not shrink the remove clause button (metabase#50128)", () => {
    const CUSTOM_COLUMN_LONG_NAME = "very-very-very-long-name";

    // The issue is reproducible on all viewports, but the smaller the viewport is,
    // the more likely the issue is going to occur.
    cy.viewport(300, 800);
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            [CUSTOM_COLUMN_LONG_NAME]: ["+", 1000, 1000],
          },
          filter: ["<", ["expression", CUSTOM_COLUMN_LONG_NAME, null], 1000000],
          aggregation: [["avg", ["expression", CUSTOM_COLUMN_LONG_NAME, null]]],
          breakout: [["expression", CUSTOM_COLUMN_LONG_NAME, null]],
          "order-by": [["asc", ["expression", CUSTOM_COLUMN_LONG_NAME, null]]],
        },
      },
      { visitQuestion: true },
    );
    H.openNotebook();

    H.verifyNotebookQuery("Orders", [
      {
        expressions: [CUSTOM_COLUMN_LONG_NAME],
        filters: [`${CUSTOM_COLUMN_LONG_NAME} is less than 1000000`],
        aggregations: [`Average of ${CUSTOM_COLUMN_LONG_NAME}`],
        breakouts: [CUSTOM_COLUMN_LONG_NAME],
        sort: [{ column: CUSTOM_COLUMN_LONG_NAME, order: "asc" }],
      },
    ]);

    cy.findAllByTestId("notebook-cell-item")
      .filter(`:contains(${CUSTOM_COLUMN_LONG_NAME})`)
      .then((items) => {
        for (let index = 0; index < items.length; ++index) {
          cy.wrap(items[index]).within(() => {
            assertRemoveClauseIconSize();
          });
        }
      });

    function assertRemoveClauseIconSize() {
      cy.findByLabelText("close icon").invoke("outerWidth").should("eq", 16);
      cy.findByLabelText("close icon").invoke("outerHeight").should("eq", 16);
    }
  });

  it("should let the user navigate back (metabase#50971)", () => {
    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use the notebook editor")
      .click();

    H.miniPicker().should("be.visible");

    // Cypress can emulate the browser's back button with cy.go('back'), but
    // this does not trigger a confirmation modal, so we need to perform a
    // similar action that also triggers the confirmation modal: clicking the
    // cancel button in the edit bar.
    cy.log('Triggering a "Discard your changes?" confirmation modal');
    cy.findByTestId("dataset-edit-bar")
      .findByRole("button", { name: "Cancel", hidden: true })
      .click({ force: true });

    cy.log(
      'Clicking "Discard changes" in the confirmation modal to verify that this modal is above the data picker modal',
    );
    H.modal().should("be.visible").contains("Discard changes").click();
    cy.findByTestId("greeting-message").should("be.visible");
  });

  it("Correctly translates aggregations", () => {
    cy.request("PUT", `/api/user/${ADMIN_USER_ID}`, {
      locale: "en-ZZ",
    });

    H.openTable({
      table: ORDERS_ID,
      mode: "notebook",
    });

    cy.findByRole("button", { name: "[zz] Summarize" }).click();
    H.popover().within(() => {
      cy.findByText("[zz] Average of ...").click();
      cy.findByText("Subtotal").click();
    });

    cy.findAllByText("[zz] Average of Subtotal").should("exist");
    cy.findAllByText("Average of Subtotal").should("not.exist");
  });

  it("should support browser based navigation (metabase#55162)", () => {
    H.createQuestion(
      { query: { "source-table": PRODUCTS_ID }, name: "products" },
      { visitQuestion: true, wrapId: true },
    );

    cy.get("@questionId").then((PRODUCT_QUESTION_ID) => {
      cy.findByRole("button", { name: /Editor/ }).click();
      cy.location("pathname").should(
        "equal",
        `/question/${PRODUCT_QUESTION_ID}-products/notebook`,
      );

      cy.findByRole("button", { name: /Visualization/ }).click();
      cy.location("pathname").should(
        "equal",
        `/question/${PRODUCT_QUESTION_ID}-products`,
      );

      cy.go("back");
      cy.location("pathname").should(
        "equal",
        `/question/${PRODUCT_QUESTION_ID}-products/notebook`,
      );

      cy.go("back");
      cy.location("pathname").should(
        "equal",
        `/question/${PRODUCT_QUESTION_ID}-products`,
      );

      cy.go("forward");
      cy.location("pathname").should(
        "equal",
        `/question/${PRODUCT_QUESTION_ID}-products/notebook`,
      );

      cy.log("Turn this question into a model");
      H.openQuestionActions("Turn into a model");
      H.modal()
        .findByRole("button", { name: "Turn this into a model" })
        .click();

      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/notebook`,
      );

      H.openQuestionActions("Edit metadata");
      H.waitForLoaderToBeRemoved();
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/columns`,
      );

      H.datasetEditBar().findByRole("button", { name: "Cancel" }).click();
      H.datasetEditBar().should("not.exist");
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products`,
      );

      H.openQuestionActions("Edit metadata");
      H.waitForLoaderToBeRemoved();
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/columns`,
      );

      cy.go("back");
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products`,
      );

      cy.go("back");
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/columns`,
      );

      H.datasetEditBar().findByText("Query").click();
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/query`,
      );

      cy.go("back");
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/columns`,
      );

      cy.go("forward");
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/query`,
      );

      H.datasetEditBar().findByRole("button", { name: "Cancel" }).click();
      H.datasetEditBar().should("not.exist");

      cy.go("back");
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/query`,
      );

      // This should work, but doesn't (metabase#55486)
      // cy.go("back");
      // cy.location("pathname").should(
      //   "equal",
      //   `/model/${PRODUCT_QUESTION_ID}-products/columns`,
      // );

      H.datasetEditBar()
        .findByRole("button", { name: "Cancel" })
        .should("be.visible")
        .click();
      H.datasetEditBar().should("not.exist");

      const PRODUCT_ROW_ID = "1";
      cy.findByTestId("table-body")
        .find("[data-column-id='ID']")
        .first()
        .should("be.visible")
        .and("have.text", PRODUCT_ROW_ID)
        .click();
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/${PRODUCT_ROW_ID}`,
      );

      cy.log("Navigate back and forth to details modal (metabase#55487)");
      cy.go("back");
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products`,
      );

      cy.go("forward");
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/${PRODUCT_ROW_ID}`,
      );

      cy.go("back");
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products`,
      );

      H.openQuestionActions("Turn back to saved question");

      cy.location("pathname").should(
        "equal",
        `/question/${PRODUCT_QUESTION_ID}-products`,
      );

      // Going back returns us to a model URL, which it should not (metabase#55488)
      // cy.go("back");
      // cy.location("pathname").should(
      //   "not.equal",
      //   `/model/${PRODUCT_QUESTION_ID}-products`,
      // );
    });
  });

  it("should render a newly added custom column when previewing Detail visualization (metabase#63181)", () => {
    const CUSTOM_COLUMN_NAME = "Tax custom column";

    H.createQuestion(
      {
        name: "Detail viz with custom column (preview)",
        query: { "source-table": ORDERS_ID },
        display: "object",
      },
      { visitQuestion: true },
    );

    H.openNotebook();
    H.addCustomColumn();
    H.enterCustomColumnDetails({ formula: "[Tax]", name: CUSTOM_COLUMN_NAME });
    cy.button("Done").click();

    // Click Visualize without saving the question
    cy.button("Visualize").click();

    cy.findByTestId("object-detail").should("be.visible");
    cy.findByTestId("object-detail")
      .findByText(CUSTOM_COLUMN_NAME)
      .should("exist");
  });
});

function assertTableRowCount(expectedCount: number) {
  cy.get(".test-Table-ID:not(.test-Table-FK)").should(
    "have.length",
    expectedCount,
  );
}
