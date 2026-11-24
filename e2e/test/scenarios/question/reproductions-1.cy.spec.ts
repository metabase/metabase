const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { QuestionDetails } from "e2e/support/helpers";
import { checkNotNull } from "metabase/utils/types";

import { setAdHocFilter } from "../native/helpers/e2e-date-filter-helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const QUESTION_NAME = "Foo";

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

function goToSavedQuestionPickerAndAssertQuestion(
  questionName: string,
  exists = true,
) {
  H.startNewQuestion();
  H.miniPickerBrowseAll().click();
  H.entityPickerModal().within(() => {
    H.entityPickerModalItem(0, "Our analytics").click();
    H.entityPickerModalItem(1, "Orders").should("exist");
    cy.findByText(questionName).should(exists ? "exist" : "not.exist");
    cy.button("Close").click();
  });
}

function archiveQuestion(questionName: string) {
  H.navigationSidebar().findByText("Our analytics").click();
  openEllipsisMenuFor(questionName);
  H.popover().findByText("Move to trash").click();
}

function unarchiveQuestion(questionName: string) {
  H.navigationSidebar().within(() => {
    cy.findByText("Trash").click();
  });
  openEllipsisMenuFor(questionName);
  H.popover().findByText("Restore").click();
}

function openEllipsisMenuFor(item: string) {
  cy.findByText(item)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click({ force: true });
}

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

        H.editDashboardCard(card, {
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id: checkNotNull(card_id),
              target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
            },
          ],
        });

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

      H.openNotebook();

      removeJoinedTable();

      H.visualize();

      cy.findByTextEnsureVisible("Subtotal");

      cy.log("Update the question");
      cy.findByTestId("qb-header").button("Save").click();
      cy.findByTestId("save-question-modal").button("Save").click();
      cy.findByTestId("save-question-modal").should("not.exist");
    });

    it("should not show the run overlay because of the references to the orphaned fields (metabase#17514-2)", () => {
      H.openNotebook();

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

function hideColumn(columnName: string) {
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

function removeJoinedTable() {
  cy.findAllByText("Join data")
    .first()
    .parent()
    .findByLabelText("Remove step")
    .click({ force: true });
}

function moveColumnToTop(column: string) {
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
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByText("Save").click();
    });
    cy.wait("@card");

    H.questionInfoButton().click();

    H.sidesheet().within(() => {
      cy.findAllByPlaceholderText("Add description")
        .type("A description")
        .blur();
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
    H.popover().findByText("Move").should("be.visible");
    H.popover().findByText("Duplicate").should("not.exist");

    cy.log(
      "Make sure we don't offer to duplicate question based on a question with a query for which the user has no permission to run (metabase#23857)",
    );
    cy.findByLabelText("Move, trash, and more…").click(); // close actions menu, without this "Search" button is treated as hidden by cypress
    H.commandPaletteSearch("Repro", false);
    H.commandPalette().findByText("Repro").click();
    cy.findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Move").should("be.visible");
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

      assertSearchListsOnlyTables();

      cy.findByText("Orders").click();
    });

    cy.icon("join_left_outer").click();
    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalItem(0, "Databases").should("be.visible");
      assertSearchListsOnlyTables();
    });

    // Test "Explore results" button is hidden for native questions
    cy.visit("/collection/root");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(TEST_NATIVE_QUESTION_NAME).click();
    cy.wait("@cardQuery");
    cy.findByTestId("saved-question-header-title").should(
      "have.text",
      TEST_NATIVE_QUESTION_NAME,
    );
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Explore results").should("not.exist");
  });

  function assertSearchListsOnlyTables() {
    cy.findByPlaceholderText("Search…").type("Ord");
    cy.findByTestId("loading-indicator").should("not.exist");

    cy.findAllByTestId("result-item").then(($result) => {
      const modelTypes = new Set(
        $result.toArray().map((k) => k.getAttribute("data-model-type")),
      );

      expect(modelTypes).not.to.include("card");
      expect(modelTypes).to.include("table");
    });
  }
});

describe("issue 23023", () => {
  const questionDetails: QuestionDetails = {
    display: "table",
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: [
              ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
            ],
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
        fields: [
          ["field", ORDERS.ID, null],
          ["field", ORDERS.PRODUCT_ID, null],
        ],
      },
      type: "query",
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show only selected columns in a step preview (metabase#23023)", () => {
    H.visitQuestionAdhoc(questionDetails);

    H.openNotebook();

    cy.icon("play").eq(1).click();

    cy.findAllByTestId("header-cell").contains("Products → Category");
    cy.findAllByTestId("header-cell").contains("Tax").should("not.exist");
  });
});

describe("issue 35290", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should render column settings when source query is a table joined on itself (metabase#35290)", () => {
    const questionDetails = {
      name: "Orders + Orders",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            "source-table": ORDERS_ID,
            condition: [
              "=",
              ["field", ORDERS.ID, null],
              ["field", ORDERS.ID, null],
            ],
            alias: "Orders",
          },
        ],
        limit: 5,
      },
    };

    H.createQuestion(questionDetails).then(({ body: { id: questionId } }) => {
      const questionDetails = {
        name: "35290",
        query: {
          "source-table": `card__${questionId}`,
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });
    });

    H.openVizSettingsSidebar();
    cy.findByTestId("chartsettings-sidebar")
      // verify panel is shown
      .should("contain", "Add or remove columns")
      // verify column name is shown
      .should("contain", "Created At");

    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.icon("warning").should("not.exist");
    });
  });
});

describe("issue 43216", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createNativeQuestion({
      name: "Source question",
      native: { query: "select 1 as A, 2 as B, 3 as C" },
    });
  });

  it("should update source question metadata when it changes (metabase#43216)", () => {
    cy.intercept("GET", "/api/search*source*").as("searchSource");
    cy.intercept("GET", "/api/search*target*").as("searchTarget");
    cy.intercept("GET", "/api/card/**/query_metadata").as("queryMetadata");

    cy.visit("/");
    H.waitForLoaderToBeRemoved();

    cy.log("Create target question");
    H.newButton("Question").click();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("Source question").click();
    });
    H.saveQuestion("Target question");
    cy.wait("@queryMetadata");

    cy.log("Update source question");
    H.commandPaletteButton().click();
    H.commandPaletteInput().type("source");
    cy.wait("@searchSource");
    H.commandPalette().findByText("Source question").click();
    cy.wait("@queryMetadata");
    cy.findByTestId("native-query-editor-container")
      .findByText("Open Editor")
      .click();
    H.NativeEditor.focus().type(" , 4 as D;");
    H.saveSavedQuestion();
    cy.wait("@queryMetadata");
    cy.wait(450); // let react process things (flaky test)

    cy.log("Assert updated metadata in target question");
    H.commandPaletteButton().click();
    H.commandPaletteInput().type("target");
    cy.wait("@searchTarget");
    H.commandPalette().findByText("Target question").click();
    cy.wait("@queryMetadata");
    cy.findAllByTestId("header-cell").eq(3).should("have.text", "D");
    H.openNotebook();
    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("D").should("be.visible");
  });
});

const EXPRESSION_NAME = "TEST_EXPRESSION";

describe("Custom columns visualization settings", () => {
  const question = {
    name: "30905",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        [EXPRESSION_NAME]: ["+", 1, 1],
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.createQuestion(question).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      H.visitQuestion(id);
    });
  });

  it("should not show 'Save' after modifying minibar settings for a custom column", () => {
    goToExpressionSidebarVisualizationSettings();
    H.popover().within(() => {
      cy.findByLabelText("Show a mini bar chart")
        .click({ force: true })
        .should("be.checked");
    });
    saveModifiedQuestion();
  });
});

function saveModifiedQuestion() {
  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.findByText("Save").click();
  });
  cy.findByTestId("save-question-modal").within(() => {
    cy.findByText(/Replace original question/i).should("exist");
    cy.findByText("Save").click();
  });

  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.findByText("Save").should("not.exist");
  });
}

function goToExpressionSidebarVisualizationSettings() {
  H.openVizSettingsSidebar();
  cy.findByTestId(`${EXPRESSION_NAME}-settings-button`).click();
}
