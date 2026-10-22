const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;
describe("issue 46221", () => {
  const modelDetails: NativeQuestionDetails = {
    name: "46221",
    native: { query: "select 42" },
    type: "model",
    collection_id: FIRST_COLLECTION_ID,
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

  it("should show the table headers even when there are no results (metabase#37300)", () => {
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();

    H.main().within(() => {
      cy.findByText("ID").should("be.visible");
      cy.findByText("Ean").should("be.visible");

      cy.findByText("No results").should("be.visible");
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

  it("should show unsaved changes modal and allow to discard changes when editing model's query and metadata (metabase#32037)", () => {
    cy.log("query");
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

    cy.log("metadata");
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

describe("issues 56698 and 57557", () => {
  beforeEach(() => {
    H.restore();
  });

  it("should create an editable ad-hoc query based on a read-only native model, and hide the query definition without data permissions (metabase#56698, metabase#57557)", () => {
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

    cy.log("verify that we create an editable ad-hoc query (metabase#56698)");
    cy.signIn("readonlynosql");
    cy.get("@modelId").then((modelId) => H.visitModel(Number(modelId)));
    H.assertQueryBuilderRowCount(2);
    H.summarize();
    H.rightSidebar().button("Done").click();
    H.assertQueryBuilderRowCount(1);

    cy.log(
      "verify that query editing functionality is hidden (metabase#57557)",
    );
    cy.signIn("nodata");
    cy.get("@modelId").then((modelId) =>
      H.visitModel(Number(modelId), { hasDataAccess: false }),
    );
    cy.findByTestId("qb-header")
      .findByText("Native model")
      .should("be.visible");
    cy.findByTestId("query-builder-root")
      .findByText(/This question is written in SQL/i)
      .should("not.exist");
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

describe("issues 56775 and 55486", () => {
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

  function checkIsShowingMetadataEditorTab() {
    cy.findByTestId("editor-tabs-columns").should("be.checked");
    cy.findByTestId("visualization-root").should("be.visible");
  }

  function checkIsShowingQueryEditorTab() {
    cy.findByTestId("editor-tabs-query").should("be.checked");
    H.getNotebookStep("data").should("be.visible");
  }

  it("should render the correct query and editor tabs after using the back and forward buttons in a model (metabase#56775, metabase#55486)", () => {
    H.openNotebook();
    cy.button("Visualize").click();

    cy.go("back");
    H.openQuestionActions("Edit query definition");

    cy.log("verify that the model definition is visible (metabase#56775)");
    H.getNotebookStep("data").findByText(MODEL_NAME).should("not.exist");
    H.getNotebookStep("data").findByText("Products").should("be.visible");

    cy.log("navigate between the editor tabs (metabase#55486)");
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

    cy.log("Forward button should show the metadata editor");
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
    cy.intercept("POST", "/api/dataset").as("dataset");

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
    H.getNotebookStep("sort").findByText("Total").should("be.visible");

    cy.log("no error should be thrown");
    cy.get("main").findByText("Something's gone wrong").should("not.exist");
    cy.findByTestId("run-button").should("be.visible").click();
    cy.wait("@dataset");
    H.tableInteractive().should("be.visible");
    H.tableInteractiveHeader().findByText("Total").should("be.visible");
  });
});
describe("Issue 56913", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    const ackUrl =
      "/api/user-key-value/namespace/user_acknowledgement/key/turn_into_model_modal";
    cy.request("PUT", ackUrl, { value: true });
    cy.intercept("GET", ackUrl).as("modelModalAck");

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
    cy.wait("@modelModalAck").its("response.body").should("eq", true);
    H.popover().findByText("Turn into a model").click();
    H.modal()
      .findByText("Variables in models aren't supported yet")
      .should("be.visible");
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

  it("should allow you to drill through with entity qualified ids (metabase#38747)", () => {
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

    cy.intercept("POST", "/api/card").as("createModel");
    cy.intercept("POST", "/api/dataset").as("modelQuery");
    H.modal().button("Save").click();

    // Wait for the model to be created and its query to resolve before
    // interacting with the table, otherwise the click can race the table
    // rendering/animating in after the redirect to the model view.
    cy.wait("@createModel");
    cy.wait("@modelQuery");
    H.tableInteractive().should("be.visible");

    cy.findByRole("gridcell", { name: "Nolan-Wolff" })
      .should("be.visible")
      .click({ waitForAnimations: false });

    // Assert that we're at an adhoc question with appropriate filters
    cy.location("pathname").should("equal", "/question");
    cy.findByTestId("filter-pill").should(
      "contain.text",
      "Vendor is Nolan-Wolff",
    );
    H.tableInteractive().should("have.attr", "data-rows-count", "1");
  });
});
