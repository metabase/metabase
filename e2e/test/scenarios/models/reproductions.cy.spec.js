import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  entityPickerModal,
  entityPickerModalLevel,
  navigationSidebar,
  openNavigationSidebar,
  popover,
  restore,
  modal,
  openNativeEditor,
  saveQuestion,
  openQuestionActions,
  sidebar,
  summarize,
  filter,
  addOrUpdateDashboardCard,
  editDashboard,
  visitDashboard,
  setModelMetadata,
  getDashboardCard,
  setFilter,
  visitQuestion,
  createNativeQuestion,
  startNewQuestion,
  createQuestion,
  entityPickerModalTab,
  enterCustomColumnDetails,
  filterField,
  filterFieldPopover,
  commandPaletteSearch,
  commandPalette,
  closeCommandPalette,
  createAction,
  setActionsEnabledForDB,
  cartesianChartCircle,
  assertQueryBuilderRowCount,
  saveMetadataChanges,
  getNotebookStep,
  appBar,
  main,
  filterWidget,
  rightSidebar,
  leftSidebar,
  openNotebook,
  visualize,
  focusNativeEditor,
  onlyOnOSS,
  visitModel,
  startNewNativeModel,
} from "e2e/support/helpers";
import {
  createMockActionParameter,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import {
  openDetailsSidebar,
  turnIntoModel,
} from "./helpers/e2e-models-helpers";

const {
  ORDERS_ID,
  ORDERS,
  REVIEWS,
  REVIEWS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATABASE;

describe("issue 19180", () => {
  const QUESTION = {
    native: { query: "select * from products" },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("/api/card/*/query").as("cardQuery");
  });

  it("shouldn't drop native model query results after leaving the query editor", () => {
    cy.createNativeQuestion(QUESTION).then(({ body: { id: QUESTION_ID } }) => {
      cy.request("PUT", `/api/card/${QUESTION_ID}`, { type: "model" }).then(
        () => {
          cy.visit(`/model/${QUESTION_ID}/query`);
          cy.wait("@cardQuery");
          cy.button("Cancel").click();
          cy.get(".test-TableInteractive");
          cy.findByText("Here's where your results will appear").should(
            "not.exist",
          );
        },
      );
    });
  });
});

describe("issue 19737", () => {
  const modelName = "Orders Model";
  const personalCollectionName = "Bobby Tables's Personal Collection";

  function moveModel(modelName, collectionName) {
    openEllipsisMenuFor(modelName);
    popover().findByText("Move").click();

    entityPickerModal().within(() => {
      cy.findByRole("tab", { name: /Collections/ }).click();
      cy.findByText(collectionName).click();
      cy.button("Move").click();
    });
  }

  function openEllipsisMenuFor(item) {
    cy.findByText(item).closest("tr").find(".Icon-ellipsis").click();
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show moved model in the data picker without refreshing (metabase#19737)", () => {
    cy.visit("/collection/root");

    moveModel(modelName, personalCollectionName);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Moved model");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("be.visible").click();

    entityPickerModal().within(() => {
      cy.findByText(personalCollectionName).click();
      cy.findByText(modelName);
    });
  });

  it("should not show duplicate models in the data picker after it's moved from a custom collection without refreshing (metabase#19737)", () => {
    // move "Orders Model" to "First collection"
    cy.visit("/collection/root");

    moveModel(modelName, "First collection");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Moved model");
    // Close the modal so the next time we move the model another model will always be shown
    cy.icon("close:visible").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("be.visible").click();

    // Open question picker (this is crucial) so the collection list are loaded.
    entityPickerModal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText(modelName);
    });

    // Use back button to so the state is kept
    cy.go("back");

    // move "Orders Model" from a custom collection ("First collection") to another collection
    openNavigationSidebar();
    navigationSidebar().findByText("First collection").click();

    moveModel(modelName, personalCollectionName);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Moved model");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("be.visible").click();

    entityPickerModal().within(() => {
      cy.findByText("First collection").should("not.exist");
      entityPickerModalLevel(1).should("not.exist");
      entityPickerModalLevel(2).should("not.exist");
    });
  });
});

// this is only testable in OSS because EE always has models from auditv2
describe("issue 19776", { tags: "@OSS" }, () => {
  const modelName = "Orders Model";
  function openEllipsisMenuFor(item) {
    cy.findByText(item).closest("tr").find(".Icon-ellipsis").click();
  }
  beforeEach(() => {
    onlyOnOSS();
    restore();
    cy.signInAsAdmin();
  });

  it("should reflect archived model in the data picker without refreshing (metabase#19776)", () => {
    cy.visit("/");

    cy.findByTestId("app-bar").button("New").click();
    popover().findByText("Question").click();
    entityPickerModalTab("Models").should("be.visible"); // now you see it
    entityPickerModal().findByLabelText("Close").click();

    // navigate without a page load
    cy.findByTestId("sidebar-toggle").click();
    navigationSidebar().findByText("Our analytics").click();

    // archive the only model
    cy.findByTestId("collection-table").within(() => {
      openEllipsisMenuFor(modelName);
    });
    popover().contains("Archive").click();
    cy.findByTestId("undo-list").findByText("Archived model");

    cy.findByTestId("app-bar").button("New").click();
    popover().findByText("Question").click();
    entityPickerModalTab("Models").should("not.exist"); // now you don't
  });
});

describe("issue 20042", () => {
  beforeEach(() => {
    cy.intercept("POST", `/api/card/${ORDERS_QUESTION_ID}/query`).as("query");

    restore();
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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders Model");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });
});

describe("issue 20045", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
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

describe("issue 20517", () => {
  const modelDetails = {
    name: "20517",
    query: {
      "source-table": ORDERS_ID,
      limit: 5,
    },
    type: "model",
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(modelDetails).then(({ body: { id } }) => {
      cy.intercept("POST", `/api/card/${id}/query`).as("modelQuery");
      cy.intercept("PUT", `/api/card/${id}`).as("updateModel");
      cy.visit(`/model/${id}/metadata`);
      cy.wait("@modelQuery");
    });
  });

  it("should be able to save metadata changes with empty description (metabase#20517)", () => {
    cy.findByTestId("dataset-edit-bar")
      .button("Save changes")
      .should("be.disabled");
    cy.findByDisplayValue(/^This is a unique ID/).clear();
    cy.findByDisplayValue(/^This is a unique ID/).should("not.exist");
    cy.findByTestId("dataset-edit-bar")
      .button("Save changes")
      .should("not.be.disabled")
      .click();
    cy.wait("@updateModel").then(({ response: { body, statusCode } }) => {
      expect(statusCode).not.to.eq(400);
      expect(body.errors).not.to.exist;
      expect(body.description).to.be.null;
    });
    cy.button("Save failed").should("not.exist");
  });
});

describe.skip("issue 20624", () => {
  const renamedColumn = "TITLE renamed";

  const questionDetails = {
    name: "20624",
    type: "model",
    native: { query: "select * from PRODUCTS limit 2" },
    visualization_settings: {
      column_settings: { '["name","TITLE"]': { column_title: renamedColumn } },
    },
  };
  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("models metadata should override previously defined column settings (metabase#20624)", () => {
    openDetailsSidebar();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Customize metadata").click();

    // Open settings for this column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
    restore();
    cy.signInAsAdmin();
  });

  it("should allow converting questions with static snippets to models (metabase#20963)", () => {
    cy.visit("/");

    openNativeEditor();

    // Creat a snippet
    cy.icon("snippet").click();
    cy.findByTestId("sidebar-content").findByText("Create a snippet").click();

    modal().within(() => {
      cy.findByLabelText("Enter some SQL here so you can reuse it later").type(
        "'test'",
      );
      cy.findByLabelText("Give your snippet a name").type(snippetName);
      cy.findByText("Save").click();
    });

    cy.get("@editor").type("{moveToStart}select ");

    saveQuestion(questionName, { wrapId: true });

    // Convert into to a model
    openQuestionActions();
    popover().within(() => {
      cy.icon("model").click();
    });

    modal().within(() => {
      cy.findByText("Turn this into a model").click();
    });
  });
});

describe("issue 22517", () => {
  function renameColumn(column, newName) {
    cy.findByDisplayValue(column).clear().type(newName).blur();
  }
  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("PUT", "/api/card/*").as("updateMetadata");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(
      {
        name: "22517",
        native: { query: "select * from orders" },
        type: "model",
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit metadata").click();

    renameColumn("ID", "Foo");

    cy.button("Save changes").click();
    cy.wait("@updateMetadata");
  });

  it.skip("adding or removing a column should not drop previously edited metadata (metabase#22517)", () => {
    openQuestionActions();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit query definition").click();

    // Make sure previous metadata changes are reflected in the UI
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Foo");

    // This will edit the original query and add the `SIZE` column
    // Updated query: `select *, case when quantity > 4 then 'large' else 'small' end size from orders`
    cy.get(".ace_content").type(
      "{leftarrow}".repeat(" from orders".length) +
        ", case when quantity > 4 then 'large' else 'small' end size ",
    );

    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Foo");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Foo");
  });
});

describe("issue 22518", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.createNativeQuestion(
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
    openQuestionActions();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit query definition").click();

    cy.get(".ace_content").type(", 'b' bar");
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");

    cy.findByTestId("dataset-edit-bar").button("Save changes").click();

    cy.findAllByTestId("header-cell")
      .should("have.length", 3)
      .and("contain", "BAR");

    summarize();

    sidebar()
      .should("contain", "ID")
      .and("contain", "FOO")
      .and("contain", "BAR");
  });
});

describe.skip("issue 22519", () => {
  const ratingDataModelUrl = `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${REVIEWS_ID}/field/${REVIEWS.RATING}/general`;

  const questionDetails = {
    query: {
      "source-table": REVIEWS_ID,
    },
  };
  beforeEach(() => {
    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.visit(ratingDataModelUrl);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Don't cast").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("UNIX seconds → Datetime").click();
    cy.wait("@updateField");
  });

  it("model query should not fail when data model is using casting (metabase#22519)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("xavier");

    turnIntoModel();

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("xavier");
  });
});

describe("filtering based on the remapped column name should result in a correct query (metabase#22715)", () => {
  function mapColumnTo({ table, column } = {}) {
    cy.findByText("Database column this maps to")
      .parent()
      .contains("None")
      .click();

    popover().findByText(table).click();
    popover().findByText(column).click();
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/card/*").as("updateModel");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion({
      native: {
        query:
          'select 1 as "ID", current_timestamp::datetime as "ALIAS_CREATED_AT"',
      },
    }).then(({ body: { id } }) => {
      // Visit the question to first load metadata
      visitQuestion(id);

      // Turn the question into a model
      cy.request("PUT", `/api/card/${id}`, { type: "model" });

      // Let's go straight to the model metadata editor
      cy.visit(`/model/${id}/metadata`);
      // Without this Cypress fails to remap the column because an element becomes detached from the DOM.
      // This is caused by the DatasetFieldMetadataSidebar component rerendering mulitple times.
      cy.findByText("Database column this maps to");
      cy.wait(5000);

      // The first column `ID` is automatically selected
      mapColumnTo({ table: "Orders", column: "ID" });

      cy.findByText("ALIAS_CREATED_AT").click();

      // Without this Cypress fails to remap the column because an element becomes detached from the DOM.
      // This is caused by the DatasetFieldMetadataSidebar component rerendering mulitple times.
      cy.wait(5000);
      mapColumnTo({ table: "Orders", column: "Created At" });

      // Make sure the column name updated before saving
      cy.findByDisplayValue("Created At");

      cy.button("Save changes").click();
      cy.wait("@updateModel");

      cy.visit(`/model/${id}`);
      cy.wait("@dataset");
    });
  });

  it("when done through the column header action (metabase#22715-1)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Today").click();

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Today").should("not.exist");

    cy.get("[data-testid=cell-data]")
      .should("have.length", 4)
      .and("contain", "Created At");
  });

  it("when done through the filter trigger (metabase#22715-2)", () => {
    filter();

    modal().within(() => {
      cy.findByText("Today").click();
      cy.findByText("Apply filters").click();
    });

    cy.wait("@dataset");

    cy.get("[data-testid=cell-data]")
      .should("have.length", 4)
      .and("contain", "Created At");
  });
});

describe("issue 23024", () => {
  function addModelToDashboardAndVisit() {
    cy.createDashboard().then(({ body: { id } }) => {
      cy.get("@modelId").then(cardId => {
        addOrUpdateDashboardCard({
          dashboard_id: id,
          card_id: cardId,
        });
      });

      visitDashboard(id);
    });
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("PUT", "/api/card/*").as("updateMetadata");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(
      {
        native: {
          query: `select *
                  from products limit 5`,
        },
        type: "model",
      },
      { wrapId: true, idAlias: "modelId" },
    );

    cy.get("@modelId").then(modelId => {
      setModelMetadata(modelId, field => {
        if (field.display_name === "CATEGORY") {
          return {
            ...field,
            id: PRODUCTS.CATEGORY,
            display_name: "Category",
            semantic_type: "type/Category",
          };
        }

        return field;
      });
    });

    addModelToDashboardAndVisit();
  });

  it("should not be possible to apply the dashboard filter to the native model (metabase#23024)", () => {
    editDashboard();

    setFilter("Text or Category", "Is");

    getDashboardCard().within(() => {
      cy.findByText(/Models are data sources/).should("be.visible");
      cy.findByText("Select…").should("not.exist");
    });
  });
});

describe("issue 23421", () => {
  const query =
    'SELECT 1 AS "id", current_timestamp::timestamp AS "created_at"';

  const emptyColumnsQuestionDetails = {
    native: {
      query,
    },
    displayIsLocked: true,
    visualization_settings: {
      "table.columns": [],
      "table.pivot_column": "orphaned1",
      "table.cell_column": "orphaned2",
    },
    type: "model",
  };

  const hiddenColumnsQuestionDetails = {
    native: {
      query,
    },
    displayIsLocked: true,
    visualization_settings: {
      "table.columns": [
        {
          name: "id",
          key: '["name","id"]',
          enabled: false,
          fieldRef: ["field", "id", { "base-type": "type/Integer" }],
        },
        {
          name: "created_at",
          key: '["name","created_at"]',
          enabled: false,
          fieldRef: ["field", "created_at", { "base-type": "type/DateTime" }],
        },
      ],
      "table.pivot_column": "orphaned1",
      "table.cell_column": "orphaned2",
    },
    type: "model",
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("`visualization_settings` should not break UI (metabase#23421)", () => {
    cy.createNativeQuestion(emptyColumnsQuestionDetails, {
      visitQuestion: true,
    });
    openQuestionActions();
    popover().findByText("Edit query definition").click();

    cy.get(".ace_content").should("contain", query);
    cy.findByRole("columnheader", { name: "id" }).should("be.visible");
    cy.findByRole("columnheader", { name: "created_at" }).should("be.visible");
    cy.button("Save changes").should("be.visible");
  });

  it("`visualization_settings` with hidden columns should not break UI (metabase#23421)", () => {
    cy.createNativeQuestion(hiddenColumnsQuestionDetails, {
      visitQuestion: true,
    });
    openQuestionActions();
    popover().findByText("Edit query definition").click();

    cy.get(".ace_content").should("contain", query);
    cy.findByTestId("visualization-root")
      .findByText("Every field is hidden right now")
      .should("be.visible");
    cy.button("Save changes").should("be.disabled");
  });
});

describe("issue 23449", () => {
  const questionDetails = { query: { "source-table": REVIEWS_ID, limit: 2 } };
  function turnIntoModel() {
    cy.intercept("PUT", "/api/card/*").as("cardUpdate");

    openQuestionActions();
    cy.findByText("Turn into a model").click();
    cy.findByText("Turn this into a model").click();

    cy.wait("@cardUpdate").then(({ response }) => {
      expect(response.body.error).to.not.exist;
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("POST", `/api/field/${REVIEWS.RATING}/dimension`, {
      type: "internal",
      name: "Rating",
    });

    cy.request("POST", `/api/field/${REVIEWS.RATING}/values`, {
      values: [
        [1, "Awful"],
        [2, "Unpleasant"],
        [3, "Meh"],
        [4, "Enjoyable"],
        [5, "Perfecto"],
      ],
    });
  });

  it("should work with the remapped custom values from data model (metabase#23449)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    cy.findByTextEnsureVisible("Perfecto");

    turnIntoModel();
    cy.findByTextEnsureVisible("Perfecto");
  });
});

describe("issue 25537", () => {
  const questionDetails = {
    name: "Orders model",
    query: { "source-table": ORDERS_ID },
    type: "model",
  };
  const setLocale = locale => {
    cy.request("GET", "/api/user/current").then(({ body: { id: user_id } }) => {
      cy.request("PUT", `/api/user/${user_id}`, { locale });
    });
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/collection/*/items?*").as("getCollectionContent");
  });

  it("should be able to pick a saved model when using a non-english locale (metabase#25537)", () => {
    setLocale("de");
    cy.createQuestion(questionDetails);

    startNewQuestion();
    entityPickerModal().within(() => {
      cy.findByText(/Modelle/i).click();
      cy.wait("@getCollectionContent");
      cy.findByText(questionDetails.name).should("exist");
    });
  });
});

describe("issue 26091", () => {
  const modelDetails = {
    name: "Old model",
    query: { "source-table": PRODUCTS_ID },
    type: "model",
  };

  const startNewQuestion = () => {
    cy.findByText("New").click();
    popover().within(() => cy.findByText("Question").click());
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("saveQuestion");
  });

  it("should allow to choose a newly created model in the data picker (metabase#26091)", () => {
    cy.createQuestion(modelDetails);
    cy.visit("/");

    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText("Name").clear().type("New model");
      cy.findByText("Save").click();
      cy.wait("@saveQuestion");
    });
    cy.get("#QuestionSavedModal").within(() => {
      cy.button("Not now").click();
    });
    turnIntoModel();

    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Recents").should(
        "have.attr",
        "aria-selected",
        "true",
      );
      cy.findByText("New model").should("be.visible");
      cy.findByText("Old model").should("not.exist");
      cy.findByText("Orders Model").should("not.exist");

      entityPickerModalTab("Models").click();
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
    cy.findAllByTestId("header-cell")
      .should("be.visible")
      .last()
      .should("have.text", ccName);
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    // Turn the question into a model
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
  });

  it("should be able to use custom column in a model query (metabase#28193)", () => {
    // Go directly to model's query definition
    cy.visit(`/model/${ORDERS_QUESTION_ID}/query`);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    enterCustomColumnDetails({
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
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/card").as("createCard");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to filter a newly created model (metabase#28971)", () => {
    cy.visit("/");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Model").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Use the notebook editor").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });
    cy.button("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    cy.wait("@createCard");

    filter();
    filterField("Quantity", { operator: "equal to" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    filterFieldPopover("Quantity").within(() => cy.findByText("20").click());
    cy.button("Apply filters").click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is equal to 20").should("exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 4 rows").should("exist");
  });
});

describe("issue 28971", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/card").as("createCard");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to filter a newly created model (metabase#28971)", () => {
    cy.visit("/");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Model").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Use the notebook editor").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });
    cy.button("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    cy.wait("@createCard");

    filter();
    filterField("Quantity", { operator: "equal to" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    filterFieldPopover("Quantity").within(() => cy.findByText("20").click());
    cy.button("Apply filters").click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is equal to 20").should("exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 4 rows").should("exist");
  });
});
describe("issue 29378", () => {
  const ACTION_DETAILS = {
    name: "Update orders quantity",
    description: "Set orders quantity to the same value",
    type: "query",
    model_id: ORDERS_QUESTION_ID,
    database_id: SAMPLE_DB_ID,
    dataset_query: {
      database: SAMPLE_DB_ID,
      native: {
        query: "UPDATE orders SET quantity = quantity",
      },
      type: "native",
    },
    parameters: [],
    visualization_settings: {
      type: "button",
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setActionsEnabledForDB(SAMPLE_DB_ID);
  });

  it("should not crash the model detail page after searching for an action (metabase#29378)", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    createAction(ACTION_DETAILS);

    cy.visit(`/model/${ORDERS_QUESTION_ID}/detail`);
    cy.findByRole("tab", { name: "Actions" }).click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(ACTION_DETAILS.name).should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(ACTION_DETAILS.dataset_query.native.query).should(
      "be.visible",
    );

    cy.findByRole("tab", { name: "Used by" }).click();
    commandPaletteSearch(ACTION_DETAILS.name, false);
    commandPalette()
      .findByRole("option", { name: ACTION_DETAILS.name })
      .should("exist");
    closeCommandPalette();

    cy.findByRole("tab", { name: "Actions" }).click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(ACTION_DETAILS.name).should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(ACTION_DETAILS.dataset_query.native.query).should(
      "be.visible",
    );
  });
});

describe("issue 29517 - nested question based on native model with remapped values", () => {
  const questionDetails = {
    name: "29517",
    type: "model",
    native: {
      query:
        'Select Orders."ID" AS "ID",\nOrders."CREATED_AT" AS "CREATED_AT"\nFrom Orders',
      "template-tags": {},
    },
  };
  function mapModelColumnToDatabase({ table, field }) {
    cy.findByText("Database column this maps to")
      .parent()
      .findByTestId("select-button")
      .click();
    popover().findByRole("option", { name: table }).click();
    popover().findByRole("option", { name: field }).click();
    cy.contains(`${table} → ${field}`).should("be.visible");
    cy.findByDisplayValue(field);
    cy.findByLabelText("Description").should("not.be.empty");
  }

  function selectModelColumn(column) {
    cy.findAllByTestId("header-cell").contains(column).click();
  }
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC`).as(
        "schema",
      );
      cy.visit(`/model/${id}/metadata`);
      cy.wait("@schema");

      mapModelColumnToDatabase({ table: "Orders", field: "ID" });
      selectModelColumn("CREATED_AT");
      mapModelColumnToDatabase({ table: "Orders", field: "Created At" });

      cy.intercept("PUT", "/api/card/*").as("updateModel");
      cy.button("Save changes").click();
      cy.wait("@updateModel");

      const nestedQuestionDetails = {
        query: {
          "source-table": `card__${id}`,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              "CREATED_AT",
              { "temporal-unit": "month", "base-type": "type/DateTime" },
            ],
          ],
        },
        display: "line",
      };

      cy.createQuestionAndDashboard({
        questionDetails: nestedQuestionDetails,
      }).then(({ body: card }) => {
        const { card_id, dashboard_id } = card;

        cy.editDashboardCard(card, {
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "dashboard",
              targetId: ORDERS_DASHBOARD_ID,
              parameterMapping: {},
            },
          },
        });

        cy.wrap(card_id).as("nestedQuestionId");
        cy.wrap(dashboard_id).as("dashboardId");
      });
    });
  });

  it("drill-through should work (metabase#29517-1)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    visitQuestion("@nestedQuestionId");

    // We can click on any circle; this index was chosen randomly
    cartesianChartCircle().eq(25).click({ force: true });
    popover()
      .findByText(/^See these/)
      .click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").findByText(
      "Created At is May 1–31, 2024",
    );

    assertQueryBuilderRowCount(520);
  });

  it("click behavior to custom destination should work (metabase#29517-2)", () => {
    cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    visitDashboard("@dashboardId");

    cy.intercept("GET", `/api/dashboard/${ORDERS_DASHBOARD_ID}*`).as(
      "loadTargetDashboard",
    );
    cartesianChartCircle().eq(25).click({ force: true });
    cy.wait("@loadTargetDashboard");

    cy.location("pathname").should("eq", `/dashboard/${ORDERS_DASHBOARD_ID}`);

    cy.wait("@dashcardQuery");

    cy.get("[data-testid=cell-data]").contains("37.65");
  });
});

describe("issue 29951", { requestTimeout: 10000, viewportWidth: 1600 }, () => {
  const questionDetails = {
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
  const removeExpression = name => {
    getNotebookStep("expression")
      .findByText(name)
      .findByLabelText("close icon")
      .click();
  };

  const dragColumn = (index, distance) => {
    cy.get(".react-draggable")
      .should("have.length", 20) // 10 columns X 2 draggable elements
      .eq(index)
      .trigger("mousedown", 0, 0, { force: true })
      .trigger("mousemove", distance, 0, { force: true })
      .trigger("mouseup", distance, 0, { force: true });
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should allow to run the model query after changing custom columns (metabase#29951)", () => {
    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      cy.visit(`/model/${id}/query`);
    });

    removeExpression("CC2");
    // The UI shows us the "play" icon, indicating we should refresh the query,
    // but the point of this repro is to save without refreshing
    cy.button("Get Answer").should("be.visible");
    saveMetadataChanges();

    cy.findAllByTestId("header-cell").last().should("have.text", "CC1");

    dragColumn(0, 100);
    cy.findByTestId("qb-header").button("Refresh").click();
    cy.wait("@dataset");
    cy.get("[data-testid=cell-data]").should("contain", "37.65");
    cy.findByTestId("view-footer").should("contain", "Showing 2 rows");
  });
});

describe("issue 31309", () => {
  const TEST_QUERY = {
    "order-by": [["asc", ["field", "sum", { "base-type": "type/Float" }]]],
    limit: 10,
    filter: ["<", ["field", "sum", { "base-type": "type/Float" }], 100],
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      breakout: [
        [
          "field",
          PEOPLE.NAME,
          { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
        ],
      ],
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should duplicate a model with its original aggregation and breakout", () => {
    cy.createQuestion(
      {
        name: "model",
        query: TEST_QUERY,
        database: SAMPLE_DB_ID,
        type: "model",
      },
      {
        visitQuestion: true,
      },
    );

    openQuestionActions();
    popover().findByText("Duplicate").click();

    modal().within(() => {
      cy.findByText("Duplicate").click();
    });

    modal().within(() => {
      cy.findByText("Not now").click();
    });

    openQuestionActions();
    popover().within(() => {
      cy.findByText("Edit query definition").click();
    });

    cy.findByTestId("data-step-cell").findByText("Orders").should("exist");

    cy.findByTestId("aggregate-step")
      .findByText("Sum of Total")
      .should("exist");

    cy.findByTestId("breakout-step").findByText("User → Name").should("exist");

    getNotebookStep("filter", { stage: 1, index: 0 })
      .findByText("Sum of Total is less than 100")
      .should("exist");

    getNotebookStep("sort", { stage: 1, index: 0 })
      .findByText("Sum of Total")
      .should("exist");

    getNotebookStep("limit", { stage: 1, index: 0 })
      .findByDisplayValue("10")
      .should("exist");
  });
});

// Should be removed once proper model FK support is implemented
describe("issue 31663", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/idfields`).as(
      "idFields",
    );

    cy.createQuestion(
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
    appBar().findByText("Our analytics").click();

    main().findByText("Orders Model").click();
    cy.wait("@dataset");
    cy.findByLabelText("Move, archive, and more...").click();
    popover().findByText("Edit metadata").click();

    cy.findByTestId("TableInteractive-root").findByText("Product ID").click();
    cy.wait("@idFields");
    cy.findByLabelText("Foreign key target").click();
    popover().within(() => {
      cy.findByText("Orders Model → ID").should("not.exist");
      cy.findByText("Products Model → ID").should("not.exist");

      cy.findByText("Orders → ID").should("exist");
      cy.findByText("People → ID").should("exist");
      cy.findByText("Products → ID").should("exist");
      cy.findByText("Reviews → ID").should("exist");
    });
  });
});

describe("issue 31905", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/card/*").as("card");

    cy.createQuestion(
      {
        name: "Orders Model",
        type: "model",
        query: { "source-table": ORDERS_ID, limit: 2 },
      },
      { visitQuestion: true },
    );
  });

  it("should not send more than one same api requests to load a model (metabase#31905)", () => {
    cy.get("@card.all").should("have.length", 1);
  });
});

describe("issue 32483", () => {
  const createTextFilterMapping = ({ card_id, fieldRef }) => {
    return {
      card_id,
      parameter_id: DASHBOARD_FILTER_TEXT.id,
      target: ["dimension", fieldRef],
    };
  };
  const DASHBOARD_FILTER_TEXT = createMockActionParameter({
    id: "1",
    name: "Text filter",
    slug: "filter-text",
    type: "string/=",
    sectionId: "string",
  });
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("dashboard filter should be applied to the saved model with source containing custom column (metabase#32483)", () => {
    const questionDetails = {
      query: {
        "source-table": PEOPLE_ID,
        expressions: {
          "source state": [
            "concat",
            [
              "field",
              PEOPLE.SOURCE,
              {
                "base-type": "type/Text",
              },
            ],
            " ",
            [
              "field",
              PEOPLE.STATE,
              {
                "base-type": "type/Text",
              },
            ],
          ],
        },
      },
    };

    createQuestion(questionDetails, { wrapId: true });

    cy.get("@questionId").then(questionId => {
      const modelDetails = {
        type: "model",
        name: "Orders + People Question Model",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              alias: "People - User",
              condition: [
                "=",
                [
                  "field",
                  ORDERS.USER_ID,
                  {
                    "base-type": "type/Integer",
                  },
                ],
                [
                  "field",
                  "ID",
                  {
                    "base-type": "type/BigInteger",
                    "join-alias": "People - User",
                  },
                ],
              ],
              "source-table": `card__${questionId}`,
            },
          ],
        },
      };

      createQuestion(modelDetails).then(({ body: { id: modelId } }) => {
        const dashboardDetails = {
          name: "32483 Dashboard",
          parameters: [DASHBOARD_FILTER_TEXT],
          dashcards: [
            createMockDashboardCard({
              id: 1,
              size_x: 8,
              size_y: 8,
              card_id: questionId,
              parameter_mappings: [
                createTextFilterMapping({
                  card_id: questionId,
                  fieldRef: [
                    "expression",
                    "source state",
                    {
                      "base-type": "type/Text",
                    },
                  ],
                }),
              ],
            }),
            createMockDashboardCard({
              id: 2,
              size_x: 8,
              size_y: 8,
              card_id: modelId,
              parameter_mappings: [
                createTextFilterMapping({
                  card_id: modelId,
                  fieldRef: [
                    "field",
                    "source state",
                    {
                      "base-type": "type/Text",
                      "join-alias": "People - User",
                    },
                  ],
                }),
              ],
            }),
          ],
        };

        cy.createDashboard(dashboardDetails).then(
          ({ body: { id: dashboardId } }) => {
            visitDashboard(dashboardId);
          },
        );
      });
    });

    filterWidget().click();
    addWidgetStringFilter("Facebook MN");

    getDashboardCard(1).should("contain", "Orders + People Question Model");
  });
});

describe("issue 32963", () => {
  function assertLineChart() {
    cy.findByTestId("viz-type-button").click();
    leftSidebar().within(() => {
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
    restore();
    cy.signInAsAdmin();
    cy.createQuestion(
      {
        name: "Orders Model",
        type: "model",
        query: { "source-table": ORDERS_ID },
      },
      { visitQuestion: true },
    );
  });

  it("should pick sensible display for model based questions (metabase#32963)", () => {
    cy.findByTestId("qb-header").button("Summarize").click();

    rightSidebar().within(() => {
      cy.findAllByText("Created At").eq(0).click();
      cy.button("Done").click();
    });
    cy.wait("@dataset");
    assertLineChart();

    // Go back to the original model
    cy.findByTestId("qb-header").findByText("Orders Model").click();
    openNotebook();

    cy.button("Summarize").click();
    popover().findByText("Count of rows").click();
    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    popover().findByText("Created At").click();
    visualize();
    assertLineChart();
  });
});

describe("issues 35039 and 37009", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.signInAsNormalUser();
  });

  // This test follows #37009 repro steps because they are simpler than #35039 but still equivalent
  it("should show columns available in the model (metabase#35039) (metabase#37009)", () => {
    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use a native query")
      .click();

    focusNativeEditor().type("select * from products -- where true=false");
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");

    cy.findByTestId("dataset-edit-bar").button("Save").click();
    modal()
      .last()
      .within(() => {
        cy.findByLabelText("Name").type("Model").realPress("Tab");
        cy.findByText("Save").click();
      });

    openQuestionActions();
    popover().findByText("Edit query definition").click();

    focusNativeEditor().type(
      "{backspace}{backspace}{backspace}{backspace}{backspace}",
    );
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");

    cy.findByTestId("dataset-edit-bar").within(() => {
      cy.findByText("Save changes").click();
      cy.findByText("Saving…").should("not.exist");
    });

    cy.findByTestId("query-builder-main").within(() => {
      cy.findByText("Doing science...").should("be.visible");
      cy.findByText("Doing science...").should("not.exist");
    });

    cy.icon("notebook").click();
    cy.findByTestId("fields-picker").click();
    popover().within(() => {
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
});

describe("issue 37009", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("saveCard");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.signInAsNormalUser();
  });

  it("should prevent saving new and updating existing models without result_metadata (metabase#37009)", () => {
    startNewNativeModel({ query: "select * from products" });

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
    modal()
      .last()
      .within(() => {
        cy.findByLabelText("Name").type("Model");
        cy.button("Save").click();
      });
    cy.wait("@saveCard")
      .its("request.body")
      .its("result_metadata")
      .should("not.be.null");

    openQuestionActions();
    popover().findByText("Edit query definition").click();
    focusNativeEditor().type(" WHERE CATEGORY = 'Gadget'");
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

describe("issue 40252", () => {
  const modelA = {
    name: "Model A",
    native: { query: "select 1 as a1, 2 as a2" },
    type: "model",
  };

  const modelB = {
    name: "Model B",
    native: { query: "select 1 as b1, 2 as b2" },
    type: "model",
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shouldn't crash during save of metadata (metabase#40252)", () => {
    createNativeQuestion(modelA, { wrapId: true, idAlias: "modelA" });
    createNativeQuestion(modelB, { wrapId: true, idAlias: "modelB" });

    cy.get("@modelA").then(modelAId => {
      cy.get("@modelB").then(modelBId => {
        const questionDetails = {
          name: "40252",
          type: "model",
          query: {
            joins: [
              {
                fields: "all",
                alias: "Model B - A1",
                strategy: "inner-join",
                condition: [
                  "=",
                  [
                    "field",
                    "A1",
                    {
                      "base-type": "type/Integer",
                    },
                  ],
                  [
                    "field",
                    "B1",
                    {
                      "base-type": "type/Integer",
                      "join-alias": "Model B - A1",
                    },
                  ],
                ],
                "source-table": `card__${modelBId}`,
              },
            ],
            "source-table": `card__${modelAId}`,
          },
        };

        createQuestion(questionDetails, { visitQuestion: true });
      });
    });

    openQuestionActions();

    popover().findByText("Edit metadata").click();

    cy.findAllByTestId("header-cell").contains("Model B - A1 → B1").click();
    cy.findByLabelText("Display name").type("Upd");

    //Because the field is debounced, we wait to see it in the metadata editor table before saving
    cy.findAllByTestId("header-cell").contains("Model B - A1 → B1Upd");
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.findByTestId("dataset-edit-bar")
      .findByRole("button", { name: "Save changes" })
      .should("be.enabled")
      .click();

    cy.url().should("not.contain", "/metadata");

    cy.wait("@dataset");

    cy.findAllByTestId("header-cell").contains("Model B - A1 → B1Upd");
  });
});

describe("issue 42355", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should allow overriding database fields for models with manually ordered columns (metabase#42355)", () => {
    createNativeQuestion({
      type: "model",
      native: { query: "SELECT ID, PRODUCT_ID FROM ORDERS" },
      visualization_settings: {
        "table.columns": [
          {
            name: "PRODUCT_ID",
            key: '["name","PRODUCT_ID"]',
            enabled: true,
            fieldRef: ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
          },
          {
            name: "ID",
            key: '["name","ID"]',
            enabled: true,
            fieldRef: ["field", "ID", { "base-type": "type/BigInteger" }],
          },
        ],
        "table.cell_column": "ID",
      },
    }).then(({ body: card }) => visitModel(card.id));

    cy.log("update metadata");
    openQuestionActions();
    popover().findByText("Edit metadata").click();
    rightSidebar()
      .findByText("Database column this maps to")
      .next()
      .findByText("None")
      .click();
    popover().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("ID").click();
    });
    cy.button("Save changes").click();

    cy.log("check metadata changes are visible");
    openQuestionActions();
    popover().findByText("Edit metadata").click();
    rightSidebar()
      .findByText("Database column this maps to")
      .next()
      .findByText("Orders → ID")
      .should("be.visible");
  });
});

describe("cumulative count - issue 33330", () => {
  const questionDetails = {
    name: "33330",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["cum-count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createQuestion(questionDetails, { visitQuestion: true });
    cy.findAllByTestId("header-cell")
      .should("contain", "Created At: Month")
      .and("contain", "Cumulative count");
    cy.findAllByTestId("cell-data").should("contain", "June 2022");
  });

  it("should still work after turning a question into model (metabase#33330-1)", () => {
    turnIntoModel();
    cy.findAllByTestId("header-cell")
      .should("contain", "Created At: Month")
      .and("contain", "Cumulative count");
    cy.findAllByTestId("cell-data").should("contain", "June 2022");
  });

  it("should still work after applying a post-aggregation filter (metabase#33330-2)", () => {
    filter();
    cy.findByRole("dialog").within(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.findByTestId("filter-column-Created At").findByText("Today").click();
      cy.button("Apply filters").click();
      cy.wait("@dataset");
    });

    cy.findByTestId("filter-pill").should("have.text", "Created At is today");
    cy.findAllByTestId("header-cell")
      .should("contain", "Created At: Month")
      .and("contain", "Cumulative count");
    cy.findAllByTestId("cell-data")
      .should("have.length", "4")
      .and("not.be.empty");
    cy.findByTestId("question-row-count").should("have.text", "Showing 1 row");
  });
});
