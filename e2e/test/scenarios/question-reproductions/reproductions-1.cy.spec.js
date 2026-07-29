const { H } = cy;
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

import { setAdHocFilter } from "../native-filters/helpers/e2e-date-filter-helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const QUESTION_NAME = "Foo";

describe("issue 6239", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.openOrdersTable({ mode: "notebook" });

    H.summarize({ mode: "notebook" });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    H.CustomExpressionEditor.type("CountIf([Total] > 0)").format();

    H.CustomExpressionEditor.nameInput().type("CE");
    cy.button("Done").click();

    cy.findByTestId("aggregate-step").contains("CE").should("exist");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    H.popover().contains("Created At").first().click();
  });

  it("should be possible to sort by using custom expression (metabase#6239)", () => {
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sort").click();
    H.popover().contains(/^CE$/).click();

    H.visualize();

    // Line chart renders initially. Switch to the table view.
    cy.icon("table2").click();

    cy.get("[data-testid=cell-data]")
      .eq(1)
      .should("contain", "CE")
      .and("have.descendants", ".Icon-chevronup");

    cy.get("[data-testid=cell-data]").eq(3).invoke("text").should("eq", "1");

    // Go back to the notebook editor
    H.openNotebook();

    // Sort descending this time
    cy.icon("arrow_up").click();
    cy.icon("arrow_up").should("not.exist");
    cy.icon("arrow_down");

    H.visualize();

    cy.get("[data-testid=cell-data]")
      .eq(1)
      .should("contain", "CE")
      .and("have.descendants", ".Icon-chevrondown");

    cy.get("[data-testid=cell-data]").eq(3).invoke("text").should("eq", "584");
  });
});

describe("issue 9027", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.startNewQuestion();
    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalItem(0, "Our analytics").click();
      H.entityPickerModalItem(1, "Orders").should("exist");
      cy.button("Close").click();
    });

    H.startNewNativeQuestion();

    H.NativeEditor.focus().type("select 0");
    cy.findByTestId("native-query-editor-container").icon("play").click();

    H.saveQuestion(QUESTION_NAME, undefined, {
      path: ["Our analytics"],
    });
  });

  it("should display newly saved question in the 'Saved Questions' list immediately (metabase#9027)", () => {
    goToSavedQuestionPickerAndAssertQuestion(QUESTION_NAME);
    H.openNavigationSidebar();
    archiveQuestion(QUESTION_NAME);
    goToSavedQuestionPickerAndAssertQuestion(QUESTION_NAME, false);
    H.openNavigationSidebar();
    unarchiveQuestion(QUESTION_NAME);
    goToSavedQuestionPickerAndAssertQuestion(QUESTION_NAME);
  });
});

function goToSavedQuestionPickerAndAssertQuestion(questionName, exists = true) {
  H.startNewQuestion();
  H.miniPickerBrowseAll().click();
  H.entityPickerModal().within(() => {
    H.entityPickerModalItem(0, "Our analytics").click();
    cy.findByText(questionName).should(exists ? "exist" : "not.exist");
    cy.button("Close").click();
  });
}

function archiveQuestion(questionName) {
  H.navigationSidebar().findByText("Our analytics").click();
  openEllipsisMenuFor(questionName);
  H.popover().findByText("Move to trash").click();
}

function unarchiveQuestion(questionName) {
  H.navigationSidebar().within(() => {
    cy.findByText("Trash").click();
  });
  openEllipsisMenuFor(questionName);
  H.popover().findByText("Restore").click();
}

function openEllipsisMenuFor(item) {
  cy.findByText(item)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click({ force: true });
}

describe("issue 14957", { tags: "@external" }, () => {
  const PG_DB_NAME = "QA Postgres12";

  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should save a question before query has been executed (metabase#14957)", () => {
    H.startNewNativeQuestion();

    cy.findByTestId("gui-builder-data").click();
    cy.findByLabelText(PG_DB_NAME).click();
    H.NativeEditor.type("select pg_sleep(60)");
    H.saveQuestion("14957", undefined, {
      path: ["Our analytics"],
    });
    H.modal().should("not.exist");
  });
});

describe("postgres > question > custom columns", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();

    cy.request(`/api/database/${WRITABLE_DB_ID}/schema/public`).then(
      ({ body }) => {
        const tableId = body.find((table) => table.name === "orders").id;
        H.openTable({
          database: WRITABLE_DB_ID,
          table: tableId,
          mode: "notebook",
        });
      },
    );

    cy.findByRole("button", { name: "Summarize" }).click();
  });

  it("`Percentile` custom expression function should accept two parameters (metabase#15714)", () => {
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a function or metric").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    H.enterCustomColumnDetails({
      formula: "Percentile([Subtotal], 0.1)",
      format: true,
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Function Percentile expects 1 argument").should("not.exist");
    H.CustomExpressionEditor.nameInput().type("Expression name");
    cy.button("Done").should("not.be.disabled").click();
    // Todo: Add positive assertions once this is fixed

    cy.findByTestId("aggregate-step")
      .contains("Expression name")
      .should("exist");
  });
});

const PG_DB_ID = 2;

const questionDetails = {
  native: {
    query: `select mytz as "ts", mytz::text as "tsAStext", state, mytz::time as "time - LOOK AT THIS COLUMN", mytz::time::text as "timeAStext", mytz::time(0) as "time(0) - ALL INCORRECT", mytz::time(3) as "time(3) - MOSTLY WORKING" from (
      select '2022-05-04 16:29:59.268160-04:00'::timestamptz as mytz, 'incorrect' AS state union all
      select '2022-05-04 16:29:59.412459-04:00'::timestamptz, 'good' union all
      select '2022-05-08 13:14:42.926221-04:00'::timestamptz, 'incorrect' union all
      select '2022-05-08 13:14:42.132026-04:00'::timestamptz, 'good' union all
      select '2022-05-10 07:38:58.987352-04:00'::timestamptz, 'incorrect' union all
      select '2022-05-10 07:38:58.001001-04:00'::timestamptz, 'good' union all
      select '2022-05-12 11:01:23.000000-04:00'::timestamptz, 'ALWAYS incorrect' union all
      select '2022-05-12 11:01:23.000-04:00'::timestamptz, 'ALWAYS incorrect' union all
      select '2022-05-12 11:01:23-04:00'::timestamptz, 'ALWAYS incorrect'
  )x`,
  },
  database: PG_DB_ID,
};

// time, time(0), time(3)
const castColumns = 3;

const correctValues = [
  {
    value: "1:29 PM",
    rows: 2,
  },
  {
    value: "10:14 AM",
    rows: 2,
  },
  {
    value: "4:38 AM",
    rows: 2,
  },
  {
    value: "8:01 AM",
    rows: 3,
  },
];

describe("issue 15876", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should correctly cast to `TIME` (metabase#15876)", () => {
    H.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.findByTestId("query-visualization-root").within(() => {
      correctValues.forEach(({ value, rows }) => {
        const count = rows * castColumns;

        cy.findAllByText(value).should("have.length", count);
      });
    });
  });
});

describe("issue 17514", () => {
  const questionDetails = {
    name: "17514",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          fields: "all",
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          alias: "Products",
        },
      ],
    },
  };

  const filter = {
    name: "All Options",
    slug: "date_filter",
    id: "23ccbbf",
    type: "date/all-options",
    sectionId: "date",
  };

  const dashboardDetails = { parameters: [filter] };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("scenario 1", () => {
    beforeEach(() => {
      H.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: card }) => {
        const { card_id, dashboard_id } = card;

        cy.intercept(
          "POST",
          `/api/dashboard/${dashboard_id}/dashcard/*/card/${card_id}/query`,
        ).as("cardQuery");

        const mapFilterToCard = {
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id,
              target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
            },
          ],
        };

        H.editDashboardCard(card, mapFilterToCard);

        H.visitDashboard(dashboard_id);

        cy.wait("@cardQuery");
        cy.findByText("110.93").should("be.visible");
      });
    });

    it("should not show the run overlay when we apply dashboard filter on a question with removed column and then click through its title (metabase#17514-1)", () => {
      H.editDashboard();

      openVisualizationOptions();

      hideColumn("Products → Ean");

      closeModal();

      H.saveDashboard();

      H.filterWidget().click();
      setAdHocFilter({ timeBucket: "years" });

      cy.location("search").should("eq", "?date_filter=past30years");
      cy.wait("@cardQuery");

      cy.findByTestId("parameter-value-widget-target")
        .findByText("Previous 30 years")
        .click();

      cy.findByTestId("parameter-value-dropdown")
        .findByText("Update filter")
        .click();

      cy.findByTestId("legend-caption").findByText("17514").click();
      cy.wait("@dataset");
      cy.findByTextEnsureVisible("Subtotal");

      cy.findByTestId("question-row-count")
        .contains(/^Showing .+ rows$/)
        .should("be.visible");

      cy.findByTestId("query-builder-main")
        .findAllByText("79.37")
        .eq(0)
        .should("be.visible")
        .click();

      cy.findByTestId("click-actions-view").should(
        "contain",
        "Filter by this value",
      );
    });
  });

  describe("scenario 2", () => {
    beforeEach(() => {
      H.createQuestion(questionDetails, { visitQuestion: true });

      H.openVizSettingsSidebar();

      moveColumnToTop("Subtotal");

      openNotebookMode();

      removeJoinedTable();

      H.visualize();

      cy.findByTextEnsureVisible("Subtotal");

      cy.log("Update the question");
      cy.findByTestId("qb-header").button("Save").click();
      cy.findByTestId("save-question-modal").button("Save").click();
      cy.findByTestId("save-question-modal").should("not.exist");
    });

    it("should not show the run overlay because of the references to the orphaned fields (metabase#17514-2)", () => {
      openNotebookMode();

      H.join();
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Products").click();
      });

      H.visualize();

      cy.log("Wait until view results are done rendering");
      cy.findByTestId("query-builder-main").within(() => {
        cy.findByText("Doing science...").should("not.exist");
      });

      // Cypress cannot click elements that are blocked by an overlay so this will immediately fail if the issue is not fixed
      H.tableHeaderClick("Subtotal");
      cy.findByTestId("click-actions-view").should(
        "contain",
        "Filter by this column",
      );
    });
  });
});

function openVisualizationOptions() {
  H.showDashboardCardActions();
  cy.icon("palette").click({ force: true });
}

function hideColumn(columnName) {
  cy.findByTestId("chartsettings-sidebar").within(() => {
    cy.findByTestId(`draggable-item-${columnName}`)
      .icon("eye_outline")
      .click({ force: true });
  });
}

function closeModal() {
  H.modal().within(() => {
    cy.button("Done").click();
  });
}

function openNotebookMode() {
  H.openNotebook();
}

function removeJoinedTable() {
  cy.findAllByText("Join data")
    .first()
    .parent()
    .findByLabelText("Remove step")
    .click({ force: true });
}

function moveColumnToTop(column) {
  cy.findByTestId("sidebar-left").within(() => {
    cy.findByText(column)
      .should("be.visible")
      .closest("[data-testid^=draggable-item]")
      .as("dragColumn");
  });
  H.moveDnDKitElementByAlias("@dragColumn", {
    vertical: -130,
    useMouseEvents: true,
  });
}

describe("issue 17910", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("revisions should work after creating a question without reloading (metabase#17910)", () => {
    H.openOrdersTable();
    cy.intercept("POST", "/api/card").as("card");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    cy.findByTestId("save-question-modal").within((modal) => {
      cy.findByText("Save").click();
    });
    cy.wait("@card");

    H.questionInfoButton().click();

    H.sidesheet().within(() => {
      cy.findAllByPlaceholderText("Add description")
        .type("A description")
        .blur();
      cy.findByRole("tab", { name: "History" }).click();
      cy.findByTestId("saved-question-history-list")
        .findAllByTestId("revision-history-event")
        .should("have.length", 2);
    });
  });
});

describe("issues 11914, 18978, 18977, 23857", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.createQuestion({
      name: "Repro",
      query: {
        "source-table": `card__${ORDERS_QUESTION_ID}`,
        limit: 2,
      },
    });
    cy.signIn("nodata");
  });

  it("should not display query editing controls and 'Browse databases' link", () => {
    cy.log(
      "Make sure we don't offer to duplicate question with a query for which the user has no permission to run (metabase#23857)",
    );
    H.visitQuestion(ORDERS_QUESTION_ID);
    cy.findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Duplicate").should("not.exist");

    cy.log(
      "Make sure we don't offer to duplicate question based on a question with a query for which the user has no permission to run (metabase#23857)",
    );
    cy.findByLabelText("Move, trash, and more…").click(); // close actions menu, without this "Search" button is treated as hidden by cypress
    H.commandPaletteSearch("Repro", false);
    H.commandPalette().findByText("Repro").click();
    cy.findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Duplicate").should("not.exist");

    cy.log(
      "Make sure we don't prompt user to browse databases from the sidebar",
    );
    H.openNavigationSidebar();
    cy.findByLabelText("Browse databases").should("not.exist");

    cy.log("Make sure we don't prompt user to create a new query");
    H.appBar().icon("add").click();
    H.popover().within(() => {
      cy.findByText("Dashboard").should("be.visible");
      cy.findByText("Question").should("not.exist");
      cy.findByText(/SQL query/).should("not.exist");
      cy.findByText("Model").should("not.exist");
    });
    // Click anywhere to close the "new" button popover
    cy.get("body").click("topLeft");

    cy.log(
      "Make sure we don't prompt user to perform any further query manipulations",
    );
    cy.findByTestId("qb-header-action-panel").within(() => {
      // visualization
      cy.icon("refresh").should("be.visible");
      cy.icon("bookmark").should("be.visible");
      // querying
      cy.findByTestId("notebook-button").should("not.exist");
      cy.findByText("Filter").should("not.exist");
      cy.findByText("Summarize").should("not.exist");
      cy.button("Save").should("not.exist");
    });

    cy.log("Make sure drill-through menus do not appear");
    // No drills when clicking a column header
    cy.findAllByTestId("header-cell").contains("Subtotal").click();
    assertNoOpenPopover();

    // No drills when clicking a regular cell
    cy.findAllByRole("gridcell").contains("37.65").click();
    assertNoOpenPopover();

    // No drills when clicking on a FK
    cy.get(".test-Table-FK").contains("123").click();
    assertNoOpenPopover();

    assertIsNotAdHoc();

    cy.log("Make sure user can change visualization but not save the question");
    H.openVizTypeSidebar();
    H.leftSidebar().within(() => {
      cy.findByTestId("more-charts-toggle").click();
      cy.icon("number").click();
    });
    cy.findByTestId("scalar-value").should("exist");
    assertSaveIsDisabled();

    cy.log("Make sure we don't prompt user to refresh the updated query");
    // Rerunning a query with changed viz settings will make it use the `/dataset` endpoint,
    // so a user will see the "You don't have permission" error
    assertNoRefreshButton();
  });
});

function assertSaveIsDisabled() {
  saveButton().should("have.attr", "aria-disabled", "true");
}

function assertIsNotAdHoc() {
  // Ad-hoc questions have a base64 encoded hash in the URL
  cy.location("hash").should("eq", "");
  saveButton().should("not.exist");
}

function assertNoRefreshButton() {
  cy.findByTestId("qb-header-action-panel").icon("refresh").should("not.exist");
}

function assertNoOpenPopover() {
  cy.get(H.POPOVER_ELEMENT).should("not.exist");
}

function saveButton() {
  return cy.findByTestId("qb-header").button("Save");
}

describe("issue 19341", () => {
  const TEST_NATIVE_QUESTION_NAME = "Native";

  beforeEach(() => {
    H.restore();
    H.mockSessionProperty("enable-nested-queries", false);
    cy.signInAsAdmin();
    H.createNativeQuestion({
      name: TEST_NATIVE_QUESTION_NAME,
      native: {
        query: "SELECT * FROM products",
      },
    });
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should correctly disable nested queries (metabase#19341)", () => {
    // Test "Saved Questions" table is hidden in QB data selector
    H.startNewQuestion();
    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").should("exist");

      // Ensure the search doesn't list saved questions
      cy.findByPlaceholderText("Search…").type("Ord");
      cy.findByTestId("loading-indicator").should("not.exist");

      cy.findAllByTestId("result-item").then(($result) => {
        const searchResults = $result.toArray();
        const modelTypes = new Set(
          searchResults.map((k) => k.getAttribute("data-model-type")),
        );

        expect(modelTypes).not.to.include("card");
        expect(modelTypes).to.include("table");
      });

      cy.findByText("Orders").click();
    });

    cy.icon("join_left_outer").click();
    H.miniPickerBrowseAll().click();
    H.entityPickerModal().findAllByRole("tab").should("not.exist");

    // Test "Explore results" button is hidden for native questions
    cy.visit("/collection/root");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(TEST_NATIVE_QUESTION_NAME).click();
    cy.wait("@cardQuery");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Explore results").should("not.exist");
  });
});

describe("issue 19742", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  // In order to reproduce the issue, it's important to only use in-app links
  // and don't refresh the app state (like by doing cy.visit)
  it("shouldn't auto-close the data selector after a table was hidden", () => {
    cy.visit("/");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();

    H.popover().findByText("Question").click();
    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalItem(0, "Databases").click();
      H.entityPickerModalItem(1, "Sample Database").click();
      cy.findByText("Orders").should("exist");
      cy.button("Close").click();
    });

    H.openNavigationSidebar();
    H.goToAdmin();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Table Metadata").click();
    H.DataModel.TablePicker.getTable("Orders").button("Hide table").click();

    H.goToMainApp();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    H.popover().findByText("Question").click();

    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalItem(0, "Databases").click();
      H.entityPickerModalItem(1, "Sample Database").click();

      cy.findByText("Orders").should("not.exist");
      cy.findByText("Products").should("exist");
      cy.findByText("Reviews").should("exist");
      cy.findByText("People").should("exist");
    });
  });
});

const QUESTION_1 = {
  name: "Q1",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
  },
};

const QUESTION_2 = {
  name: "Q2",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [
      ["sum", ["field", PRODUCTS.PRICE, { "base-type": "type/Float" }]],
    ],
    breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
  },
};

describe("issue 19893", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it(
    "should display correct join source table when joining visited questions (metabase#19893)",
    { tags: "@skip" },
    () => {
      H.createQuestion(QUESTION_1, {
        wrapId: true,
        idAlias: "questionId1",
        visitQuestion: true,
      });
      H.createQuestion(QUESTION_2, {
        wrapId: true,
        idAlias: "questionId2",
        visitQuestion: true,
      });

      cy.then(function () {
        const { questionId1, questionId2 } = this;

        createQ1PlusQ2Question(questionId1, questionId2).then(
          ({ body: question }) => {
            cy.visit(`/question/${question.id}/notebook`);
          },
        );
      });

      assertQ1PlusQ2Joins();
    },
  );

  it(
    "should display correct join source table when joining non-visited questions (metabase#19893)",
    { tags: "@skip" },
    () => {
      H.createQuestion(QUESTION_1, { wrapId: true, idAlias: "questionId1" });
      H.createQuestion(QUESTION_2, { wrapId: true, idAlias: "questionId2" });

      cy.then(function () {
        const { questionId1, questionId2 } = this;

        createQ1PlusQ2Question(questionId1, questionId2).then(
          ({ body: question }) => {
            cy.visit(`/question/${question.id}/notebook`);
          },
        );
      });

      assertQ1PlusQ2Joins();
    },
  );
});

const createQ1PlusQ2Question = (questionId1, questionId2) => {
  return H.createQuestion({
    name: "Q1 + Q2",
    query: {
      "source-table": `card__${questionId1}`,
      joins: [
        {
          fields: "all",
          strategy: "left-join",
          alias: "Q2 - Category",
          condition: [
            "=",
            ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
            [
              "field",
              PRODUCTS.CATEGORY,
              { "base-type": "type/Text", "join-alias": "Q2 - Category" },
            ],
          ],
          "source-table": `card__${questionId2}`,
        },
      ],
    },
  });
};

const assertQ1PlusQ2Joins = () => {
  H.getNotebookStep("join").within(() => {
    cy.findAllByTestId("notebook-cell-item").then((items) => {
      cy.wrap(items[0]).should("contain", QUESTION_1.name);
      cy.wrap(items[1]).should("contain", QUESTION_2.name);
    });

    cy.findByLabelText("Left column").within(() => {
      cy.findByText(QUESTION_1.name).should("exist");
      cy.findByText("Category").should("exist");
    });

    cy.findByLabelText("Right column").within(() => {
      cy.findByText(QUESTION_2.name).should("exist");
      cy.findByText("Q2 - Category → Category").should("exist");
    });
  });
};
