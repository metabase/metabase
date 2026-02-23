const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type { NativeQuestionDetails } from "e2e/support/helpers/api/createQuestion";

import {
  openDetailsSidebar,
  turnIntoModel,
} from "./helpers/e2e-models-helpers";

const { ORDERS_ID, ORDERS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("issue 19180", () => {
  const QUESTION = {
    native: { query: "select * from products" },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("/api/card/*/query").as("cardQuery");
  });

  it("shouldn't drop native model query results after leaving the query editor", () => {
    H.createNativeQuestion(QUESTION).then(({ body: { id: QUESTION_ID } }) => {
      cy.request("PUT", `/api/card/${QUESTION_ID}`, { type: "model" }).then(
        () => {
          cy.visit(`/model/${QUESTION_ID}/query`);
          cy.wait("@cardQuery");
          cy.button("Cancel").click();
          H.tableInteractive();
          cy.findByText("Here's where your results will appear").should(
            "not.exist",
          );
        },
      );
    });
  });
});

describe("issue 20042", () => {
  beforeEach(() => {
    cy.intercept("POST", `/api/card/${ORDERS_QUESTION_ID}/query`).as("query");

    H.restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      name: "Orders Model",
      type: "model",
    });

    cy.signIn("nodata");
  });

  it("nodata user should not see the blank screen when visiting model (metabase#20042)", () => {
    cy.visit(`/model/${ORDERS_QUESTION_ID}`);

    cy.wait("@query");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders Model");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });
});

describe("issue 20045", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      name: "Orders Model",
      type: "model",
    });
  });

  it("should not add query hash on the rerun (metabase#20045)", () => {
    cy.visit(`/model/${ORDERS_QUESTION_ID}`);

    cy.wait("@dataset");

    cy.location("pathname").should(
      "eq",
      `/model/${ORDERS_QUESTION_ID}-orders-model`,
    );
    cy.location("hash").should("eq", "");

    cy.findByTestId("qb-header-action-panel").find(".Icon-refresh").click();

    cy.wait("@dataset");

    cy.location("pathname").should(
      "eq",
      `/model/${ORDERS_QUESTION_ID}-orders-model`,
    );
    cy.location("hash").should("eq", "");
  });
});

describe("issue 20624", { tags: "@skip" }, () => {
  const renamedColumn = "TITLE renamed";

  const questionDetails: NativeQuestionDetails = {
    name: "20624",
    type: "model",
    native: { query: "select * from PRODUCTS limit 2" },
    visualization_settings: {
      column_settings: { '["name","TITLE"]': { column_title: renamedColumn } },
    },
  };

  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("models metadata should override previously defined column settings (metabase#20624)", () => {
    openDetailsSidebar();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Customize metadata").click();

    // Open settings for this column
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(renamedColumn).click();
    // Let's set a new name for it
    cy.findByDisplayValue(renamedColumn).clear().type("Foo").blur();

    cy.button("Save changes").click();
    cy.wait("@updateCard");

    cy.get("[data-testid=cell-data]").should("contain", "Foo");
  });
});

describe("issue 20963", () => {
  const snippetName = "string 'test'";
  const questionName = "Converting questions with snippets to models";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow converting questions with static snippets to models (metabase#20963)", () => {
    cy.visit("/");

    H.startNewNativeQuestion();

    // Create a snippet
    cy.icon("snippet").click();
    cy.findByTestId("sidebar-content").findByText("Create snippet").click();

    H.modal().within(() => {
      cy.findByLabelText("Enter some SQL here so you can reuse it later").type(
        "'test'",
      );
      cy.findByLabelText("Give your snippet a name").type(snippetName);
      cy.findByText("Save").click();
    });

    H.NativeEditor.type("{moveToStart}select ");

    H.saveQuestion(
      questionName,
      { wrapId: true },
      {
        path: ["Our analytics"],
      },
    );

    // Convert into to a model
    H.openQuestionActions();
    H.popover().within(() => {
      cy.icon("model").click();
    });

    H.modal().within(() => {
      cy.findByText("Turn this into a model").click();
    });
  });
});

describe("issue 22517", () => {
  function renameColumn(column: string, newName: string) {
    cy.findByDisplayValue(column).clear().type(newName).blur();
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("PUT", "/api/card/*").as("updateMetadata");

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(
      {
        name: "22517",
        native: { query: "select * from orders" },
        type: "model",
      },
      { visitQuestion: true },
    );

    H.openQuestionActions();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit metadata").click();

    renameColumn("ID", "Foo");

    cy.button("Save changes").click();
    cy.wait("@updateMetadata");
  });

  it(
    "adding or removing a column should not drop previously edited metadata (metabase#22517)",
    { tags: "@skip" },
    () => {
      H.openQuestionActions();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit query definition").click();

      // Make sure previous metadata changes are reflected in the UI
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Foo");

      // This will edit the original query and add the `SIZE` column
      // Updated query: `select *, case when quantity > 4 then 'large' else 'small' end size from orders`
      H.NativeEditor.focus().type(
        "{leftarrow}".repeat(" from orders".length) +
          ", case when quantity > 4 then 'large' else 'small' end size ",
      );

      cy.findByTestId("native-query-editor-container").icon("play").click();
      cy.wait("@dataset");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Foo");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save changes").click();

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Foo");
    },
  );
});

describe("issue 22518", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.createNativeQuestion(
      {
        native: {
          query: "select 1 id, 'a' foo",
        },
        type: "model",
      },
      { visitQuestion: true },
    );
  });

  it("UI should immediately reflect model query changes upon saving (metabase#22518)", () => {
    H.openQuestionActions();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit query definition").click();

    H.NativeEditor.focus().type(", 'b' bar");
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");

    cy.findByTestId("dataset-edit-bar").button("Save changes").click();

    cy.findAllByTestId("header-cell")
      .should("have.length", 3)
      .and("contain", "BAR");

    H.summarize();

    H.sidebar()
      .should("contain", "ID")
      .and("contain", "FOO")
      .and("contain", "BAR");
  });
});

describe("filtering based on the remapped column name should result in a correct query (metabase#22715)", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/card/*").as("updateModel");

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion({
      native: {
        query:
          'select 1 as "ID", current_timestamp::datetime as "ALIAS_CREATED_AT"',
      },
    }).then(({ body: { id } }) => {
      // Turn the question into a model
      cy.request("PUT", `/api/card/${id}`, { type: "model" });

      // Let's go straight to the model metadata editor
      cy.visit(`/model/${id}/columns`);
      cy.findByText("Database column this maps to").should("be.visible");

      // The first column `ID` is automatically selected
      H.mapColumnTo({ table: "Orders", column: "ID" });
      cy.findByText("ALIAS_CREATED_AT").click();

      H.mapColumnTo({ table: "Orders", column: "Created At" });

      // Make sure the column name updated before saving
      cy.findByDisplayValue("Created At");

      cy.button("Save changes").click();
      cy.wait("@updateModel");

      H.visitModel(id);
    });
  });

  it("when done through the column header action (metabase#22715-1)", () => {
    H.tableHeaderClick("Created At");
    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Today").click();
    });
    cy.wait("@dataset");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Today").should("not.exist");
    cy.get("[data-testid=cell-data]")
      .should("have.length", 4)
      .and("contain", "Created At");
  });

  it("when done through the filter trigger (metabase#22715-2)", () => {
    H.filter();
    H.popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Today").click();
    });
    cy.wait("@dataset");
    cy.get("[data-testid=cell-data]")
      .should("have.length", 4)
      .and("contain", "Created At");
  });
});

describe("issue 26091", () => {
  const modelDetails: StructuredQuestionDetails = {
    name: "Old model",
    query: { "source-table": PRODUCTS_ID },
    type: "model",
  };

  const startNewQuestion = () => {
    cy.findByText("New").click();
    H.popover().within(() => cy.findByText("Question").click());
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("saveQuestion");
  });

  it("should allow to choose a newly created model in the data picker (metabase#26091)", () => {
    H.createQuestion(modelDetails);
    cy.visit("/");

    startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    H.saveQuestion("New model", undefined, {
      path: ["Our analytics"],
    });
    turnIntoModel();

    startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("New model").should("be.visible");
      cy.findByText("Old model").should("be.visible");
      cy.findByText("Orders Model").should("be.visible");
    });
  });
});

describe("issue 28193", () => {
  const ccName = "CTax";

  function assertOnColumns() {
    cy.findAllByText("2.07").should("be.visible").and("have.length", 2);
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("header-cell")
      .should("be.visible")
      .last()
      .should("have.text", ccName);
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();

    // Turn the question into a model
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
  });

  it("should be able to use custom column in a model query (metabase#28193)", () => {
    // Go directly to model's query definition
    cy.visit(`/model/${ORDERS_QUESTION_ID}/query`);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    H.enterCustomColumnDetails({
      formula: "[Tax]",
      name: ccName,
    });
    cy.button("Done").click();

    cy.findByTestId("run-button").click();
    cy.wait("@dataset");

    cy.button("Save changes").click();
    cy.location("pathname").should("not.include", "/query");

    assertOnColumns();

    cy.reload();
    cy.wait("@dataset");

    assertOnColumns();
  });
});

describe("issue 28971", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/card").as("createModel");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to filter a newly created model (metabase#28971)", () => {
    H.startNewModel();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    cy.findByTestId("run-button").click();
    cy.wait("@dataset");

    cy.findByTestId("dataset-edit-bar").button("Save").click();
    cy.findByTestId("save-question-modal").button("Save").click();
    cy.wait("@createModel");

    H.filter();
    H.popover().within(() => {
      cy.findByText("Quantity").click();
      cy.findByText("20").click();
      cy.button("Apply filter").click();
    });
    cy.wait("@dataset");

    cy.findByTestId("filter-pill").should(
      "have.text",
      "Quantity is equal to 20",
    );
    cy.findByTestId("question-row-count").should("have.text", "Showing 4 rows");
  });
});

describe("issue 53604 - nested native question with multiple breakouts on same column", () => {
  const questionDetails: NativeQuestionDetails = {
    name: "53604 base",
    type: "question",
    native: {
      query: "select ID, CREATED_AT from ORDERS",
      "template-tags": {},
    },
  };

  function createNestedQuestion({
    turnIntoModel: shouldTurnIntoModel = false,
  } = {}) {
    H.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      if (shouldTurnIntoModel) {
        H.visitQuestion(id);
        turnIntoModel();
      }
      H.createQuestion(
        {
          type: "question",
          name: "53604",
          query: {
            "source-table": `card__${id}`,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                "CREATED_AT",
                { "temporal-unit": "month", "base-type": "type/DateTime" },
              ],
              [
                "field",
                "CREATED_AT",
                { "temporal-unit": "year", "base-type": "type/DateTime" },
              ],
            ],
          },
          display: "line",
        },
        {
          wrapId: true,
          idAlias: "nestedQuestionId",
        },
      );
    });
  }

  function testUnderlyingRecordsDrillThru() {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.visitQuestion("@nestedQuestionId");

    // We can click on any circle; this index was chosen randomly
    H.cartesianChartCircle().eq(25).click({ force: true });
    H.popover()
      .findByText(/^See these/)
      .click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").findByText(
      "CREATED_AT is May 1–31, 2024",
    );

    cy.findByTestId("qb-filters-panel").findByText(
      "CREATED_AT: Year is Jan 1 – Dec 31, 2024",
    );

    H.assertQueryBuilderRowCount(520);
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("Underlying records drill-through should work on nested native question (metabase#53604)", () => {
    createNestedQuestion();
    testUnderlyingRecordsDrillThru();
  });

  it("Underlying records drill-through should work on nested native model (metabase#53604)", () => {
    createNestedQuestion({ turnIntoModel: true });
    testUnderlyingRecordsDrillThru();
  });
});

describe("issue 54108 - nested question broken out by day", () => {
  const questionDetails: NativeQuestionDetails = {
    name: "54108 base",
    type: "question",
    native: {
      query: "select ID, CREATED_AT from ORDERS",
      "template-tags": {},
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      H.createQuestion(
        {
          type: "question",
          name: "54108",
          query: {
            "source-table": `card__${id}`,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                "CREATED_AT",
                { "temporal-unit": "day", "base-type": "type/Date" },
              ],
            ],
          },
          display: "line",
        },
        {
          wrapId: true,
          idAlias: "nestedQuestionId",
        },
      );
    });
  });

  it("drill-through should work (metabase#54108)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.visitQuestion("@nestedQuestionId");

    // We can click on any circle; this index was chosen randomly
    H.cartesianChartCircle().eq(500).click({ force: true });
    H.popover()
      .findByText(/^See these/)
      .click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").findByText(
      "CREATED_AT is Oct 11, 2023",
    );

    H.assertQueryBuilderRowCount(6);
  });
});

describe("issue 29951", { requestTimeout: 10000, viewportWidth: 1600 }, () => {
  const questionDetails: StructuredQuestionDetails = {
    name: "29951",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        CC1: ["+", ["field", ORDERS.TOTAL], 1],
        CC2: ["+", ["field", ORDERS.TOTAL], 1],
      },
      limit: 2,
    },
    type: "model",
  };
  const removeExpression = (name: string) => {
    H.getNotebookStep("expression")
      .findByText(name)
      .findByLabelText("close icon")
      .click();
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should allow to run the model query after changing custom columns (metabase#29951)", () => {
    H.createQuestion(questionDetails).then(({ body: { id } }) => {
      cy.visit(`/model/${id}/query`);
    });

    removeExpression("CC2");
    // The UI shows us the "play" icon, indicating we should refresh the query,
    // but the point of this repro is to save without refreshing
    cy.button("Get Answer").should("be.visible");
    H.saveMetadataChanges();

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("header-cell").last().should("have.text", "CC1");
    H.tableHeaderColumn("ID").as("idHeader");
    H.moveDnDKitElementByAlias("@idHeader", { horizontal: 100 });

    cy.findByTestId("qb-header").button("Refresh").click();
    cy.wait("@dataset");
    cy.get("[data-testid=cell-data]").should("contain", "37.65");
    cy.findByTestId("view-footer").should("contain", "Showing 2 rows");
  });
});

// Should be removed once proper model FK support is implemented
describe("issue 31663", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/idfields`).as(
      "idFields",
    );

    H.createQuestion(
      {
        name: "Products Model",
        type: "model",
        query: { "source-table": PRODUCTS_ID },
      },
      { visitQuestion: true },
    );
  });

  it("shouldn't list model IDs as possible model FK targets (metabase#31663)", () => {
    // It's important to have product model's metadata loaded to reproduce this
    H.appBar().findByText("Our analytics").click();

    H.main().findByText("Orders Model").click();
    cy.wait("@dataset");
    cy.findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Edit metadata").click();

    H.tableInteractive().findByText("Product ID").click();
    cy.wait("@idFields");
    cy.findByPlaceholderText("Select a target").click();
    H.popover().findByText("Orders Model → ID").should("not.exist");
    H.popover().findByText("Products Model → ID").should("not.exist");

    H.popover().findByText("Orders → ID").should("be.visible");
    H.popover().findByText("People → ID").should("be.visible");
    H.popover().findByText("Products → ID").should("be.visible");
    H.popover()
      .scrollTo("bottom")
      .findByText("Reviews → ID")
      .should("be.visible");
  });
});

describe("issue 31905", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/card/*").as("card");

    H.createQuestion(
      {
        name: "Orders Model",
        type: "model",
        query: { "source-table": ORDERS_ID, limit: 2 },
      },
      { visitQuestion: true },
    );
  });

  // TODO: This should be 1, but MainNavbar.tsx RTKQ fetch + QB's call to loadCard makes it 2
  it("should not send more than one same api requests to load a model (metabase#31905)", () => {
    cy.get("@card.all").should("have.length.lte", 2);
  });
});

describe("issue 32963", () => {
  function assertLineChart() {
    H.openVizTypeSidebar();
    H.leftSidebar().within(() => {
      cy.findByTestId("Line-container").should(
        "have.attr",
        "aria-selected",
        "true",
      );
      cy.findByTestId("Table-container").should(
        "have.attr",
        "aria-selected",
        "false",
      );
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.createQuestion(
      {
        name: "Orders Model",
        type: "model",
        query: { "source-table": ORDERS_ID },
      },
      { visitQuestion: true },
    );
  });

  it("should pick sensible display for model based questions (metabase#32963)", () => {
    cy.findByTestId("qb-header")
      .button(/Summarize/)
      .click();
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.rightSidebar().within(() => {
      cy.findAllByText("Created At").eq(0).click();
      cy.button("Done").click();
    });
    cy.wait("@dataset");
    assertLineChart();

    // Go back to the original model
    cy.findByTestId("qb-header").findByText("Orders Model").click();
    H.openNotebook();

    cy.button("Summarize").click();
    H.popover().findByText("Count of rows").click();
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover().findByText("Created At").click();
    H.visualize();
    assertLineChart();
  });
});

describe("issues 35039 and 37009", () => {
  // We only need to ensure there is a comment. Any comment.
  const query = "select * from products limit 1 -- foo";

  const cardDetails: NativeQuestionDetails = {
    name: "35039",
    type: "model",
    native: { query },
    visualization_settings: {},
  };

  beforeEach(() => {
    H.restore();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.signInAsNormalUser();

    H.createNativeQuestion(cardDetails).then(({ body: { id } }) => {
      // It is crucial for this repro to go directly to the "edit query definition" page!
      // When the repro was created back in v47-v48, it was still possible to save a new model
      // without running the query first. This resulted in the missing `result_metadata`.
      // It's not possible to replicate that using UI anymore, so our best bet is to create a model
      // using API, and then to visit this page directly.
      cy.visit(`/model/${id}/query`);
    });
    assertResultsLoaded();
  });

  // This test follows #37009 repro steps because they are simpler than #35039 but still equivalent
  it("should show columns available in the model (metabase#35039) (metabase#37009)", () => {
    // The repro requires that we update the query in a minor, non-impactful way.
    cy.log("Update the query and save");
    H.NativeEditor.focus().type("{backspace}");
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");

    cy.findByTestId("dataset-edit-bar").within(() => {
      cy.button("Save changes").click();
      cy.button("Saving…").should("not.exist");
    });

    assertResultsLoaded();

    cy.log("Start new ad-hoc question and make sure all columns are there");
    H.openNotebook();
    cy.findByTestId("fields-picker").click();
    H.popover().within(() => {
      cy.findByText("ID").should("exist");
      cy.findByText("EAN").should("exist");
      cy.findByText("TITLE").should("exist");
      cy.findByText("CATEGORY").should("exist");
      cy.findByText("VENDOR").should("exist");
      cy.findByText("PRICE").should("exist");
      cy.findByText("RATING").should("exist");
      cy.findByText("CREATED_AT").should("exist");
    });
  });

  function assertResultsLoaded() {
    cy.findAllByTestId("cell-data").should("contain", "Rustic Paper Wallet");
  }
});

describe("issue 37009", () => {
  beforeEach(() => {
    H.restore();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("saveCard");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.signInAsNormalUser();
  });

  it("should prevent saving new and updating existing models without result_metadata (metabase#37009)", () => {
    H.startNewNativeModel({ query: "select * from products" });

    cy.findByTestId("dataset-edit-bar")
      .button("Save")
      .should("be.disabled")
      .trigger("mousemove", { force: true });
    cy.findByRole("tooltip").should(
      "have.text",
      "You must run the query before you can save this model",
    );
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");
    cy.findByRole("tooltip").should("not.exist");
    cy.findByTestId("dataset-edit-bar")
      .button("Save")
      .should("be.enabled")
      .click();
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.modal()
      .last()
      .within(() => {
        cy.findByLabelText("Name").type("Model");
        cy.button("Save").click();
      });
    cy.wait("@saveCard")
      .its("request.body")
      .its("result_metadata")
      .should("not.be.null");

    H.openQuestionActions();
    H.popover().findByText("Edit query definition").click();
    H.NativeEditor.focus().type(" WHERE CATEGORY = 'Gadget'");
    cy.findByTestId("dataset-edit-bar")
      .button("Save changes")
      .should("be.disabled")
      .trigger("mousemove", { force: true });
    cy.findByRole("tooltip").should(
      "have.text",
      "You must run the query before you can save this model",
    );
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");
    cy.findByRole("tooltip").should("not.exist");
    cy.findByTestId("dataset-edit-bar")
      .button("Save changes")
      .should("be.enabled")
      .click();
    cy.wait("@updateCard")
      .its("request.body")
      .its("result_metadata")
      .should("not.be.null");
  });
});

describe("issue 45926", () => {
  const questionDetails: StructuredQuestionDetails = {
    name: "33330",
    type: "model",
    query: {
      "source-table": ORDERS_ID,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should restore model correctly without refresh (metabase#45926)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    cy.wait("@dataset");
    H.openQuestionActions("Edit metadata");
    H.sidebar().within(() => {
      cy.findByDisplayValue("ID").type(" updated");
    });

    cy.button("Save changes").click();
    cy.wait("@dataset");

    cy.findByRole("columnheader", { name: "ID updated" }).should("be.visible");
    H.openQuestionActions("Edit query definition");
    cy.button("Sort").click();
    H.popover().findByText("ID").click();
    cy.button("Save changes").click();
    cy.wait("@dataset");

    H.questionInfoButton().click();
    H.sidesheet().within(() => {
      cy.findByRole("tab", { name: "History" }).click();
      cy.findByText(
        "changed the visualization settings and edited the metadata.",
      )
        .closest("li")
        .findByTestId("question-revert-button")
        .click();
    });

    cy.wait("@dataset");

    H.sidesheet().button("Close").click();

    cy.findByRole("columnheader", { name: "ID updated" }).should("be.visible");
  });
});
