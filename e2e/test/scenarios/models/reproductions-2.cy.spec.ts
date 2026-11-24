const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_MODEL_ID } from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

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

  it('should render the "Display as Link" options of each column after saving the model metadata (metabase#51925)', () => {
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
    H.saveMetadataChanges();
    cy.reload();
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
