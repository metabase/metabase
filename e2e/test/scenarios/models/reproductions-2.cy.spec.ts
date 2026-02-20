const { H } = cy;

import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import { DataPermissionValue } from "metabase/admin/permissions/types";
import type { GroupPermissions, NativePermissions } from "metabase-types/api";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
} = SAMPLE_DATABASE;

describe("issue 47988", () => {
  const model1Details: StructuredQuestionDetails = {
    name: "M1",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          "source-table": PRODUCTS_ID,
          alias: "Products",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          fields: "all",
        },
      ],
    },
  };

  const model2Details: StructuredQuestionDetails = {
    name: "M2",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          "source-table": PRODUCTS_ID,
          alias: "Products",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          fields: "all",
        },
        {
          "source-table": REVIEWS_ID,
          alias: "Reviews",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", REVIEWS.PRODUCT_ID, { "join-alias": "Reviews" }],
          ],
          fields: "all",
        },
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to execute a query with joins to the same table in base queries (metabase#47988)", () => {
    H.createQuestion(model1Details);
    H.createQuestion(model2Details);
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("M1").click();
    });
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("M2").click();
    });
    H.visualize();
    H.tableInteractive().should("be.visible");
  });
});

describe("issue 46221", () => {
  const modelDetails: NativeQuestionDetails = {
    name: "46221",
    native: { query: "select 42" },
    type: "model",
    collection_id: FIRST_COLLECTION_ID as number,
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(modelDetails, { visitQuestion: true });
  });

  it("should retain the same collection name between ad-hoc question based on a model and a model itself (metabase#46221)", () => {
    cy.location("pathname").should("match", /^\/model\/\d+/);
    cy.findByTestId("head-crumbs-container")
      .should("contain", "First collection")
      .and("contain", modelDetails.name);

    cy.log("Change the viz type");
    H.openVizTypeSidebar();
    cy.findByTestId("sidebar-left").within(() => {
      cy.findByTestId("more-charts-toggle").click();
      cy.findByTestId("Table-button").click();
    });

    cy.log("Make sure we're now in an ad-hoc question mode");
    cy.location("pathname").should("eq", "/question");

    cy.findByTestId("head-crumbs-container")
      .should("contain", "First collection")
      .and("contain", modelDetails.name);
  });
});

describe("issue 20624", () => {
  const questionDetails: StructuredQuestionDetails = {
    name: "Question",
    type: "question",
    query: {
      "source-table": PRODUCTS_ID,
    },
    visualization_settings: {
      column_settings: {
        '["name","VENDOR"]': { column_title: "Retailer" },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should reset the question's viz settings when converting to a model (metabase#20624)", () => {
    cy.log("check that a column is renamed via the viz settings");
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.tableInteractive().within(() => {
      cy.findByText("Retailer").should("be.visible");
      cy.findByText("Vendor").should("not.exist");
    });

    cy.log("check that the viz settings are reset when converting to a model");
    H.openQuestionActions();
    H.popover().findByText("Turn into a model").click();
    H.modal().findByText("Turn this into a model").click();
    cy.wait("@updateCard");
    H.tableInteractive().within(() => {
      cy.findByText("Vendor").should("be.visible");
      cy.findByText("Retailer").should("not.exist");
    });

    cy.log("rename the column using the model's metadata");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();
    H.tableHeaderClick("Vendor");
    cy.findByLabelText("Display name").clear().type("Retailer");
    cy.button("Save changes").should("be.enabled").click();
    cy.wait("@updateCard");
    H.tableInteractive().within(() => {
      cy.findByText("Retailer").should("be.visible");
      cy.findByText("Vendor").should("not.exist");
    });
  });
});

describe("issue 37300", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestion(
      {
        type: "model",
        query: {
          "source-table": PRODUCTS_ID,
          filter: ["=", ["field", PRODUCTS.ID, null], "999991"],
        },
      },
      { visitQuestion: true },
    );
  });

  it("should show the table headers even when there are no results (metabase/metabase#37300)", () => {
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();

    H.main().within(() => {
      cy.findByText("ID").should("be.visible");
      cy.findByText("Ean").should("be.visible");

      cy.findByText("No results!").should("be.visible");
    });
  });
});

describe("issue 32037", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    cy.visit("/browse/models");
    cy.findByLabelText("Orders Model").click();
    H.tableInteractive().should("be.visible");
    cy.location("pathname").as("modelPathname");
  });

  it("should show unsaved changes modal and allow to discard changes when editing model's query (metabase#32037)", () => {
    H.openQuestionActions("Edit query definition");
    cy.button("Save changes").should("be.disabled");
    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("ID").click();
      cy.findByPlaceholderText("Enter an ID").type("1").blur();
      cy.button("Add filter").click();
    });
    cy.button("Save changes").should("be.enabled");
    cy.go("back");

    verifyDiscardingChanges();
  });

  it("should show unsaved changes modal and allow to discard changes when editing model's metadata (metabase#32037)", () => {
    H.openQuestionActions("Edit metadata");
    H.waitForLoaderToBeRemoved();
    cy.button("Save changes").should("be.disabled");
    cy.findByLabelText("Description").type("123").blur();
    cy.button("Save changes").should("be.enabled");
    cy.go("back");

    verifyDiscardingChanges();
  });

  function verifyDiscardingChanges() {
    H.modal().within(() => {
      cy.findByText("Discard your changes?").should("be.visible");
      cy.findByText("Discard changes").click();
    });

    H.tableInteractive().should("be.visible");
    cy.button("Save changes").should("not.exist");
    cy.get("@modelPathname").then((modelPathname) => {
      cy.location("pathname").should("eq", modelPathname);
    });
  }
});

describe("issue 51925", () => {
  function setLinkDisplayType() {
    cy.findByTestId("chart-settings-widget-view_as").findByText("Link").click();
  }

  function linkTextInput() {
    return cy
      .findByTestId("chart-settings-widget-link_text")
      .findByRole("combobox");
  }

  function linkUrlInput() {
    return cy
      .findByTestId("chart-settings-widget-link_url")
      .findByRole("combobox");
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it('should allow to set "Display as Link" options independently for each column (metabase#51925)', () => {
    H.visitModel(ORDERS_MODEL_ID);
    H.openQuestionActions("Edit metadata");
    H.waitForLoaderToBeRemoved();
    H.tableInteractive().findByText("User ID").click();
    H.rightSidebar().within(() => {
      setLinkDisplayType();
      linkTextInput().type("User {{USER_ID}}", {
        parseSpecialCharSequences: false,
      });
      linkUrlInput().type("https://example.com/{{USER_ID}}", {
        parseSpecialCharSequences: false,
      });
    });
    H.tableInteractive().findByText("Product ID").click();
    H.rightSidebar().within(() => {
      setLinkDisplayType();
      linkTextInput().type("Product {{PRODUCT_ID}}", {
        parseSpecialCharSequences: false,
      });
      linkUrlInput().type("https://example.com/{{PRODUCT_ID}}", {
        parseSpecialCharSequences: false,
      });
    });
    H.tableInteractive().findByText("User ID").click();
    H.rightSidebar().within(() => {
      linkTextInput().should("have.value", "User {{USER_ID}}");
      linkUrlInput().should("have.value", "https://example.com/{{USER_ID}}");
    });
    H.saveMetadataChanges();
    H.tableInteractive().within(() => {
      cy.findAllByRole("link", { name: "User 1" })
        .first()
        .should("have.attr", "href", "https://example.com/1");
      cy.findAllByRole("link", { name: "Product 6" })
        .first()
        .should("have.attr", "href", "https://example.com/6");
    });
  });
});

describe("issue 53649", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not get caught in an infinite loop when opening the native editor (metabase#53649)", () => {
    H.startNewNativeModel();

    // If the app freezes, this won't work
    H.NativeEditor.type("select 1");
    H.NativeEditor.get().should("contain", "select 1");
  });
});

describe("issue 56698", () => {
  beforeEach(() => {
    H.restore();
  });

  it("should create an editable ad-hoc query based on a read-only native model (metabase#56698)", () => {
    cy.log("create a native model");
    cy.signInAsNormalUser();
    H.createNativeQuestion(
      {
        name: "Native model",
        native: { query: "select 1 union all select 2" },
        type: "model",
      },
      { wrapId: true, idAlias: "modelId" },
    );

    cy.log("verify that we create an editable ad-hoc query");
    cy.signIn("readonlynosql");
    cy.get("@modelId").then((modelId) => H.visitModel(Number(modelId)));
    H.assertQueryBuilderRowCount(2);
    H.summarize();
    H.rightSidebar().button("Done").click();
    H.assertQueryBuilderRowCount(1);
  });
});

describe("issue 57557", () => {
  beforeEach(() => {
    H.restore();
  });

  it("should not allow to see the query definition for a user without data permissions (metabase#57557)", () => {
    cy.log("create a native model");
    cy.signInAsNormalUser();
    H.createNativeQuestion(
      {
        name: "Native model",
        native: { query: "select 1 union all select 2" },
        type: "model",
      },
      { wrapId: true, idAlias: "modelId" },
    );

    cy.log("verify that query editing functionality is hidden");
    cy.signIn("nodata");
    cy.get("@modelId").then((modelId) =>
      H.visitModel(Number(modelId), { hasDataAccess: false }),
    );
    H.openQuestionActions();
    H.popover().within(() => {
      cy.findByText("Edit metadata").should("be.visible");
      cy.findByText("Edit query definition").should("not.exist");
      cy.findByText("Edit metadata").click();
    });
    H.waitForLoaderToBeRemoved();
    cy.findByTestId("editor-tabs-query").should("be.disabled");
    cy.findByTestId("editor-tabs-columns").should("be.checked");
  });
});

describe("issue 56775", () => {
  const MODEL_NAME = "Model 56775";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
        type: "model",
        name: MODEL_NAME,
        query: {
          "source-table": PRODUCTS_ID,
        },
      },
      { visitQuestion: true },
    );
  });

  it("should render the correct query after using the back button in a model (metabase#56775)", () => {
    H.openNotebook();
    cy.button("Visualize").click();

    cy.go("back");
    H.openQuestionActions("Edit query definition");

    cy.log("verify that the model definition is visible");
    H.getNotebookStep("data").findByText(MODEL_NAME).should("not.exist");
    H.getNotebookStep("data").findByText("Products").should("be.visible");
  });
});

describe("issue 57359", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should not break the model when editing metadata (metabase#57359)", () => {
    cy.log("create a question with two joins without running the query");
    H.openOrdersTable({ mode: "notebook" });
    cy.wrap([1, 2]).each(() => {
      H.join();
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Products").click();
      });
    });
    H.saveQuestion("Q1");

    cy.log("turn the question into a model");
    H.openQuestionActions("Turn into a model");
    H.modal().button("Turn this into a model").click();
    cy.wait("@updateCard");

    cy.log("edit query metadata");
    H.openQuestionActions("Edit metadata");
    H.waitForLoaderToBeRemoved();
    H.openColumnOptions("Product ID");
    H.renameColumn("Product ID", "Product ID2");
    H.saveMetadataChanges();

    cy.log("make sure the query is run successfully");
    H.tableInteractive().should("be.visible");
  });
});

describe("issue 55486", () => {
  const MODEL_NAME = "Model 55486";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
        type: "model",
        name: MODEL_NAME,
        query: {
          "source-table": PRODUCTS_ID,
          limit: 5,
        },
      },
      { visitQuestion: true },
    );
  });

  function checkIsShowingMetadataEditorTab() {
    cy.findByTestId("editor-tabs-columns").should("be.checked");
    cy.findByTestId("visualization-root").should("be.visible");
  }

  function checkIsShowingQueryEditorTab() {
    cy.findByTestId("editor-tabs-query").should("be.checked");
    H.getNotebookStep("data").should("be.visible");
  }

  it("should render the correct query after using the back button in a model (metabase#56775)", () => {
    H.openQuestionActions("Edit query definition");

    H.datasetEditBar().findByText("Columns").click();
    checkIsShowingMetadataEditorTab();

    H.datasetEditBar().findByText("Query").click();
    checkIsShowingQueryEditorTab();

    cy.log("Back button should show the metadata editor");
    cy.go("back");
    checkIsShowingMetadataEditorTab();

    cy.log("Back button should show the query editor");
    cy.go("back");
    checkIsShowingQueryEditorTab();

    cy.log("Forward button should show the query editor");
    cy.go("forward");
    checkIsShowingMetadataEditorTab();

    cy.log("Forward button should show the query editor");
    cy.go("forward");
    checkIsShowingQueryEditorTab();
  });
});

describe("Issue 30712", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.startNewModel();

    H.miniPicker().findByText("Sample Database").click();
    H.miniPicker().findByText("Orders").click();
    H.join();
    H.joinTable("Products");

    H.join();
    H.joinTable("People");
  });

  it("should not crash the editor when ordering by columns on joined tables (metabase#30712)", () => {
    H.getNotebookStep("summarize").findByLabelText("Sort").click();
    H.popover().findByText("Total").click();

    cy.log("no error should be thrown");
    cy.get("main").findByText("Something's gone wrong").should("not.exist");
    cy.findByTestId("run-button").should("be.visible");
  });
});

describe("issue 60930", { tags: "@skip" }, () => {
  const modelDetails: StructuredQuestionDetails = {
    name: "Model",
    type: "model",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          "source-table": PRODUCTS_ID,
          alias: "Products",
          strategy: "left-join",
          fields: "all",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
            [
              "field",
              PRODUCTS.ID,
              { "base-type": "type/BigInteger", "join-alias": "Products" },
            ],
          ],
        },
        {
          "source-table": REVIEWS_ID,
          alias: "Reviews",
          strategy: "left-join",
          fields: "all",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
            [
              "field",
              REVIEWS.PRODUCT_ID,
              { "base-type": "type/Integer", "join-alias": "Reviews" },
            ],
          ],
        },
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not apply model metadata overrides to incorrect columns after changes in the query (metabase#60930)", () => {
    cy.log("create a model");
    H.createQuestion(modelDetails).then(({ body: card }) =>
      H.visitModel(card.id),
    );

    cy.log("override the column name");
    H.openQuestionActions("Edit metadata");
    H.waitForLoaderToBeRemoved();
    H.openColumnOptions("Products → ID");
    H.renameColumn("Products → ID", "ID2");
    H.saveMetadataChanges();
    H.tableInteractive().findByText("ID2").should("exist");

    cy.log("remove the ID2 column from the query");
    H.openQuestionActions("Edit query definition");
    H.getNotebookStep("join", { index: 0 })
      .findByLabelText("Pick columns")
      .click();
    H.popover().findByLabelText("Select all").click();
    H.saveMetadataChanges();
    H.tableInteractive().findByText("ID2").should("not.exist");
  });
});

describe("Issue 56913", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
        },
      },
      { visitQuestion: true },
    );

    H.openQuestionActions();
    H.popover().findByText("Turn into a model").click();
    H.modal().button("Turn this into a model").click();

    H.createNativeQuestion(
      {
        native: {
          query: "select {{ x }}",
          "template-tags": {
            x: {
              id: "d7f1fb15-c7b8-6051-443d-604b6ed5457b",
              name: "x",
              "display-name": "X",
              type: "text",
              default: null,
            },
          },
        },
      },
      { visitQuestion: true },
    );
  });

  it("should show the error modal when converting a native question with variables into a model, even when the 'turn into a model' modal was previously acknowledged (metabase#56913)", () => {
    H.openQuestionActions();
    H.popover().findByText("Turn into a model").click();
    H.modal()
      .findByText("Variables in models aren't supported yet")
      .should("be.visible");
  });
});

describe("issue 45919", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow to query a model with a hidden column", () => {
    cy.log("create a new model with result_metadata");
    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use the notebook editor")
      .click();
    H.popover().findByText("Sample Database").click();
    H.popover().findByText("People").click();
    H.runButtonOverlay().click();
    H.tableInteractive().should("be.visible");
    cy.findByTestId("dataset-edit-bar").button("Save").click();
    cy.findByTestId("save-question-modal").button("Save").click();
    H.queryBuilderHeader().should("be.visible");
    H.tableInteractiveHeader().findByText("Password").should("be.visible");

    cy.log("hide the Password field");
    cy.request("PUT", `/api/field/${PEOPLE.PASSWORD}`, {
      visibility_type: "sensitive",
    });

    cy.log("the query should succeed, and the Password field should be hidden");
    H.queryBuilderHeader().button("Refresh").click();
    H.tableInteractive().should("be.visible");
    H.tableInteractiveHeader().findByText("Password").should("not.exist");
    H.tableInteractiveHeader().findByText("Email").should("be.visible");
  });
});

describe("issue 50915", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should use the model for the data source for drills after the model is created (metabase#50915)", () => {
    cy.log("create a model via the UI");
    cy.visit("/model/new");
    H.main().findByText("Use the notebook editor").click();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("People").click();
    });
    cy.findByTestId("dataset-edit-bar").button("Save").click();
    cy.findByTestId("save-question-modal").button("Save").click();
    H.queryBuilderHeader().should("be.visible");
    H.queryBuilderMain()
      .findByText("37.65", { timeout: 10000 })
      .should("be.visible");

    cy.log("immediately after saving, drill-thru");
    H.tableHeaderClick("Discount ($)");
    H.popover().findByText("Distinct values").click();
    H.queryBuilderMain()
      .findByText("1,115", { timeout: 10000 })
      .should("be.visible");
    H.assertTableData({ columns: ["Distinct values of Discount"] });

    cy.log("assert that the model is used for the data source");
    H.openNotebook();
    H.getNotebookStep("data")
      .findByText("Orders + People")
      .should("be.visible");
  });
});

describe("issue 38747", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow you to drill through with entity qualified ids", () => {
    cy.visit("/model/new");
    cy.findByRole("link", { name: /notebook editor/ }).click();

    H.miniPickerBrowseAll().click();
    H.pickEntity({ path: ["Databases", "Sample Database", "Products"] });
    H.runButtonInOverlay().click();

    // Wait for the query to run so we can click the columns "button"
    // ... It's actually a list item, so we can't check to see if it's
    // actually disabled in any sane way
    H.tableInteractive().should("exist");

    H.datasetEditBar().findByText("Columns").click();
    cy.findAllByTestId("model-column-header-content")
      .contains("Vendor")
      .click();

    cy.findByPlaceholderText("Select a semantic type").click();
    H.popover().findByText("Entity Key").click();
    H.datasetEditBar().button("Save").click();

    H.modal().button("Save").click();

    cy.findByRole("gridcell", { name: "Nolan-Wolff" }).click({
      waitForAnimations: false,
    });

    // Assert that we're at an adhoc question with aproprate filters
    cy.location("pathname").should("equal", "/question");
    cy.findByTestId("filter-pill").should(
      "contain.text",
      "Vendor is Nolan-Wolff",
    );
    H.tableInteractive().should("have.attr", "data-rows-count", "1");
  });
});

describe("issue 67680", () => {
  function setTablePermissions(createQueriesPermission: NativePermissions) {
    const permissions: GroupPermissions = {
      [SAMPLE_DB_ID]: {
        "view-data": {
          public: {
            [ORDERS_ID]: DataPermissionValue.BLOCKED,
            [PRODUCTS_ID]: DataPermissionValue.UNRESTRICTED,
          },
        },
        "create-queries": createQueriesPermission,
      },
    };
    cy.updatePermissionsGraph({
      [USER_GROUPS.ALL_USERS_GROUP]: permissions,
      [USER_GROUPS.DATA_GROUP]: permissions,
      [USER_GROUPS.COLLECTION_GROUP]: permissions,
    });
  }

  function setTablePermissionsWithCreateQueries() {
    setTablePermissions(DataPermissionValue.QUERY_BUILDER);
  }

  function setTablePermissionsWithoutCreateQueries() {
    setTablePermissions(DataPermissionValue.NO);
  }

  function updateModelSourceTableWithResultMetadata() {
    H.visitModel(ORDERS_MODEL_ID);
    H.openQuestionActions("Edit query definition");
    H.getNotebookStep("data").findByText("Orders").click();
    H.popover().findByText("Products").click();
    H.runButtonInOverlay().click();
    H.tableInteractiveHeader().findByText("Category").should("be.visible");
    H.saveMetadataChanges();
  }

  function updateModelSourceTableWithoutResultMetadata() {
    H.visitModel(ORDERS_MODEL_ID);
    H.openQuestionActions("Edit query definition");
    H.getNotebookStep("data").findByText("Orders").click();
    H.popover().findByText("Products").click();
    H.saveMetadataChanges();
  }

  function verifyNormalUserCanAccessModel() {
    cy.signInAsNormalUser();
    H.visitModel(ORDERS_MODEL_ID);
    H.assertQueryBuilderRowCount(200);
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  describe("when the user has create queries permission", () => {
    beforeEach(() => {
      setTablePermissionsWithCreateQueries();
    });

    it("should not override column ids for a mbql model when it is saved with result_metadata (metabase#67680)", () => {
      updateModelSourceTableWithResultMetadata();
      verifyNormalUserCanAccessModel();
    });

    it("should not override column ids for a mbql model when it is saved without result_metadata (metabase#67680)", () => {
      updateModelSourceTableWithoutResultMetadata();
      verifyNormalUserCanAccessModel();
    });
  });

  describe("when the user does not have create queries permission", () => {
    beforeEach(() => {
      setTablePermissionsWithoutCreateQueries();
    });

    it("should not override column ids for a mbql model when it is saved with result_metadata (metabase#67680)", () => {
      updateModelSourceTableWithResultMetadata();
      verifyNormalUserCanAccessModel();
    });

    it("should not override column ids for a mbql model when it is saved without result_metadata (metabase#67680)", () => {
      updateModelSourceTableWithoutResultMetadata();
      verifyNormalUserCanAccessModel();
    });
  });
});

describe("issue 69722", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.visit("/model/new");
    cy.findByRole("link", { name: /native query/ }).click();
  });

  it("should not be possible to overflow the native query editor (metabase#69722)", () => {
    H.NativeEditor.type("{enter}".repeat(20));

    cy.findByTestId("native-query-editor-container")
      .findByTestId("run-button")
      .should("be.visible");
  });
});
