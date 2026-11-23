const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type { CardId, DatasetColumn, FieldReference } from "metabase-types/api";

import { startQuestionFromModel } from "./helpers/e2e-models-helpers";

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS, PRODUCTS_ID, REVIEWS } =
  SAMPLE_DATABASE;

// The brand color the model editor gives the header of the selected column
const SELECTED_HEADER_COLOR = "rgb(80, 158, 226)";

describe("scenarios > models editor > metadata", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should edit and save GUI model metadata, and clear it when the model is turned back into a question", () => {
    H.createQuestion(
      {
        name: "GUI Model",
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
        },
        type: "model",
      },
      { visitQuestion: true, wrapId: true },
    );

    H.openQuestionActions("Edit metadata");
    cy.url().should("include", "/columns");
    H.waitForLoaderToBeRemoved();

    H.openColumnOptions("Subtotal");
    H.renameColumn("Subtotal", "Pre-tax");
    H.setColumnType("No semantic type", "Currency");
    H.saveMetadataChanges();

    cy.findAllByTestId("header-cell")
      .should("contain", "Pre-tax ($)")
      .and("not.contain", "Subtotal");

    cy.log("the saved metadata is still there after a reload");
    cy.reload();
    cy.findAllByTestId("header-cell")
      .should("contain", "Pre-tax ($)")
      .and("not.contain", "Subtotal");

    cy.log(
      "Ensure that a question created from this model inherits its metadata.",
    );
    startQuestionFromModel("GUI Model");
    H.visualize();

    cy.findAllByTestId("header-cell")
      .should("contain", "Pre-tax ($)")
      .and("not.contain", "Subtotal");

    cy.log(
      "clear custom metadata when the model is turned back into a question",
    );
    cy.get<CardId>("@questionId").then((id) => H.visitModel(id));
    cy.findAllByTestId("header-cell").should("contain", "Pre-tax ($)");

    H.openQuestionActions();
    H.popover().findByTextEnsureVisible("Turn back to saved question").click();
    cy.wait("@cardQuery");

    cy.findAllByTestId("header-cell")
      .should("contain", "Subtotal")
      .and("not.contain", "Pre-tax ($)");
  });

  it("should keep native model metadata in sync with the query, edit it, and revert to a specific metadata revision", () => {
    cy.intercept("POST", "/api/revision/revert").as("revert");

    H.createNativeQuestion(
      {
        name: "Native Model",
        type: "model",
        native: {
          query: "SELECT * FROM ORDERS LIMIT 5",
        },
      },
      { visitQuestion: true },
    );

    cy.log("keep metadata in sync with the query");
    H.openQuestionActions();
    H.popover().findByTextEnsureVisible("Edit query definition").click();

    H.NativeEditor.clear();
    H.NativeEditor.type("SELECT TOTAL FROM ORDERS LIMIT 5");

    cy.findByTestId("editor-tabs-columns-name").click();
    cy.wait("@dataset");

    cy.findAllByTestId("header-cell")
      .should("have.length", 1)
      .and("have.text", "TOTAL");
    cy.findByLabelText("Display name").should("have.value", "TOTAL");

    H.datasetEditBar().button("Cancel").click();
    H.modal().button("Discard changes").click();
    H.datasetEditBar().should("not.exist");
    cy.findAllByTestId("header-cell").should("contain", "SUBTOTAL");

    cy.log("Revision 1: edit metadata");
    H.openQuestionActions("Edit metadata");
    cy.url().should("include", "/columns");
    H.waitForLoaderToBeRemoved();

    H.openColumnOptions("SUBTOTAL");

    H.mapColumnTo({ table: "Orders", column: "Subtotal" });
    H.renameColumn("Subtotal", "Pre-tax");
    H.setColumnType("No semantic type", "Currency");
    H.saveMetadataChanges();

    H.tableInteractive().within(() => {
      cy.findByText("Pre-tax ($)").should("be.visible");
      cy.findByText("SUBTOTAL").should("not.exist");
    });
    cy.findAllByTestId("header-cell").should("not.contain", "Subtotal");

    cy.log("Revision 2");
    H.openQuestionActions();
    H.popover().findByTextEnsureVisible("Edit metadata").click();
    H.waitForLoaderToBeRemoved();

    H.openColumnOptions("TAX");
    H.mapColumnTo({ table: "Orders", column: "Tax" });
    H.setColumnType("No semantic type", "Currency");
    H.saveMetadataChanges();

    cy.findAllByTestId("header-cell")
      .should("contain", "Pre-tax ($)")
      .and("contain", "Tax ($)")
      .and("not.contain", "TAX");

    cy.log("revert to revision 1");
    cy.reload();
    H.questionInfoButton().click();

    cy.findByTestId("sidesheet").within(() => {
      cy.findByRole("tab", { name: "History" }).click();
      cy.findAllByTestId("question-revert-button").first().click();
    });

    cy.wait("@revert");
    cy.findAllByTestId("header-cell")
      .should("contain", "Pre-tax ($)")
      .and("not.contain", "Tax ($)")
      .and("contain", "TAX");
    H.sidesheet().findByLabelText("Close").click();
    H.sidesheet().should("not.exist");

    cy.log(
      "Ensure that a question created from this model inherits its metadata.",
    );
    startQuestionFromModel("Native Model");
    H.visualize();

    cy.findAllByTestId("header-cell")
      .should("contain", "Pre-tax ($)")
      .and("not.contain", "Subtotal");
  });

  it("should allow reordering columns by the edge of column header (metabase#41419)", () => {
    const ordersJoinProductsQuery: StructuredQuestionDetails = {
      type: "model",
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
        fields: [["field", ORDERS.ID, null]],
        limit: 5,
      },
    };

    H.createQuestion(ordersJoinProductsQuery, { visitQuestion: true });

    H.openQuestionActions();
    H.popover().findByTextEnsureVisible("Edit metadata").click();
    cy.url().should("include", "/columns");
    H.waitForLoaderToBeRemoved();

    H.tableInteractiveScrollContainer().scrollTo("right");
    H.tableInteractiveScrollContainer().should(($container) => {
      expect($container[0].scrollLeft).to.be.greaterThan(0);
    });
    cy.findAllByTestId("header-cell").should(($cells) => {
      const names = $cells.toArray().map((cell) => cell.textContent);
      expect(names.indexOf("Products → Vendor")).to.be.greaterThan(-1);
      expect(names.indexOf("Products → Vendor")).to.be.lessThan(
        names.indexOf("Products → Price"),
      );
    });

    cy.log("move Products → Price before Products → Vendor");

    cy.findAllByTestId("header-cell")
      .contains("Products → Price")
      .closest("[data-testid='header-cell']")
      .as("dragHeader");

    H.moveDnDKitElementByAlias("@dragHeader", { horizontal: -250 });

    cy.findAllByTestId("header-cell").should(($cells) => {
      const names = $cells.toArray().map((cell) => cell.textContent);
      expect(names.indexOf("Products → Price")).to.be.greaterThan(-1);
      expect(names.indexOf("Products → Price")).to.be.lessThan(
        names.indexOf("Products → Vendor"),
      );
    });

    cy.log("the table should keep its scroll position");
    H.tableInteractiveScrollContainer().should(($container) => {
      expect($container[0].scrollLeft).to.be.greaterThan(0);
    });
    cy.findAllByTestId("header-cell")
      .contains("Products → Vendor")
      .should("be.visible");
  });

  it("can reorder and save the columns of a model with a custom column (metabase#35711, metabase#29943)", () => {
    const DISCOUNT_FIELD_REF: FieldReference = [
      "field",
      ORDERS.DISCOUNT,
      {
        "base-type": "type/Float",
      },
    ];

    function reorderTaxAndTotalColumns() {
      cy.findAllByTestId("header-cell").eq(4).should("have.text", "Tax");
      cy.findAllByTestId("header-cell").eq(5).should("have.text", "Total");
      H.tableHeaderColumn("Total").as("totalColumn");

      // drag & drop the Total column 80 px to the left to switch it with Tax column
      H.moveDnDKitElementByAlias("@totalColumn", { horizontal: -80 });

      cy.findAllByTestId("header-cell").eq(4).should("have.text", "Total");
      cy.findAllByTestId("header-cell").eq(5).should("have.text", "Tax");
    }

    function getHeaderContent(name: string) {
      return H.tableHeaderColumn(name).closest(
        "[data-testid=model-column-header-content]",
      );
    }

    function assertHeaderSelection({
      selected,
      notSelected,
    }: {
      selected: string;
      notSelected: string;
    }) {
      // A hovered header has the selected color too, so the pointer leaves the table first
      cy.findByLabelText("Display name").realHover();
      getHeaderContent(selected).should(
        "have.css",
        "background-color",
        SELECTED_HEADER_COLOR,
      );
      getHeaderContent(notSelected).should(
        "not.have.css",
        "background-color",
        SELECTED_HEADER_COLOR,
      );
    }

    function assertNoError() {
      cy.button("Get Answer").should("not.exist");
      cy.get("main")
        .findByText("There was a problem with your question")
        .should("not.exist");
      cy.get("[data-testid=cell-data]").should("contain", "37.65");
    }

    cy.intercept("PUT", "/api/card/*").as("updateModel");
    H.createQuestion(
      {
        type: "model",
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            "Custom column": ["-", DISCOUNT_FIELD_REF, 1],
          },
          limit: 5, // optimization
        },
      },
      { visitQuestion: true },
    );

    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();

    reorderTaxAndTotalColumns();
    assertNoError();

    cy.findByTestId("editor-tabs-query-name").click();
    H.getNotebookStep("data").should("be.visible");
    cy.findByTestId("run-button").should("have.attr", "aria-label", "Refresh");
    assertNoError();

    cy.log("the saved column order is kept after a reload");
    H.datasetEditBar().button("Save changes").click();
    cy.wait("@updateModel");
    H.datasetEditBar().should("not.exist");
    cy.reload();
    H.openQuestionActions("Edit metadata");
    H.waitForLoaderToBeRemoved();
    cy.findAllByTestId("header-cell").eq(4).should("have.text", "Total");
    cy.findAllByTestId("header-cell").eq(5).should("have.text", "Tax");
    assertHeaderSelection({ selected: "ID", notSelected: "Total" });

    H.tableHeaderClick("Total");
    cy.findByLabelText("Display name").should("have.value", "Total");
    assertHeaderSelection({ selected: "Total", notSelected: "ID" });
  });

  describe("native models metadata overwrites", { viewportWidth: 1400 }, () => {
    beforeEach(() => {
      H.createNativeQuestion(
        {
          name: "Native Model",
          type: "model",
          native: {
            query: "select * from orders limit 100",
          },
        },
        { wrapId: true, idAlias: "modelId" },
      );

      cy.get<CardId>("@modelId").then((modelId) => {
        H.setModelMetadata(modelId, (field: DatasetColumn) => {
          if (field.display_name === "USER_ID") {
            return {
              ...field,
              id: ORDERS.USER_ID,
              display_name: "User ID",
              semantic_type: "type/FK",
              fk_target_field_id: PEOPLE.ID,
            };
          }
          if (field.display_name !== "QUANTITY") {
            return field;
          }
          return {
            ...field,
            display_name: "Review ID",
            semantic_type: "type/FK",
            fk_target_field_id: REVIEWS.ID,
          };
        });
      });
    });

    it("should allow drills on FK columns from dashboards (metabase#42130)", () => {
      cy.get<CardId>("@modelId").then((modelId) => {
        H.createDashboard().then((response) => {
          const dashboardId = response.body.id;
          H.addOrUpdateDashboardCard({
            dashboard_id: dashboardId,
            card_id: modelId,
            card: { size_x: 24, size_y: 9 },
          });

          H.visitDashboard(dashboardId);

          // Drill to People table
          // FK column is mapped to real DB column
          drillDashboardFK({ id: 1 });
          H.popover().findByText("View details").click();
          cy.wait("@dataset");
          cy.findByTestId("object-detail").within(() => {
            cy.findAllByText("1");
            cy.findAllByText("Hudson Borer");
          });

          cy.go("back");

          // Drill to Reviews table
          // FK column has a FK semantic type, no mapping to real DB columns
          drillDashboardFK({ id: 7 });
          H.popover().findByText("View details").click();
          cy.wait("@dataset");
          cy.findByTestId("object-detail").within(() => {
            cy.findAllByText("7");
            cy.findAllByText("perry.ruecker");
          });
        });
      });
    });
  });
});

describe("scenarios > models editor > query", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      name: "Orders Model",
      type: "model",
    });
  });

  it("should edit and save a GUI model query", () => {
    cy.visit(`/model/${ORDERS_QUESTION_ID}`);
    cy.wait("@dataset");

    cy.get("[data-testid=cell-data]")
      .should("contain", "37.65")
      .and("contain", "109.22");

    H.openQuestionActions();
    H.popover().within(() => {
      cy.findByText("Edit query definition").click();
    });

    cy.findByTestId("data-step-cell").contains("Orders");
    cy.button("Save changes").should("be.disabled");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Row limit").click();
    cy.findByPlaceholderText("Enter a limit").type("2").blur();

    cy.findByTestId("run-button").click();
    cy.wait("@dataset");

    cy.get("[data-testid=cell-data]")
      .should("contain", "37.65")
      .and("not.contain", "109.22");

    cy.button("Save changes").click();
    cy.wait("@updateCard");

    cy.url()
      .should("include", `/model/${ORDERS_QUESTION_ID}`)
      .and("not.include", "/query");
    cy.location("hash").should("eq", "");

    cy.get("[data-testid=cell-data]")
      .should("contain", "37.65")
      .and("not.contain", "109.22");

    cy.log("the saved query is still there after a reload");
    cy.reload();
    cy.wait("@dataset");
    cy.get("[data-testid=cell-data]")
      .should("contain", "37.65")
      .and("not.contain", "109.22");
  });
});

describe("issue 41785, issue 46756", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", "/api/card/*").as("card");
  });

  it("does not break the question when removing column with the same mapping as another column (metabase#41785) (metabase#46756)", () => {
    // it's important to create the model through UI to reproduce this issue
    H.startNewModel();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Products").click();
    });
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Products").click();
    });
    H.popover().findByText("ID").click();
    H.popover().findByText("ID").click();

    cy.findByTestId("run-button").click();
    cy.wait("@dataset");

    cy.button("Save").click();
    H.modal().button("Save").click();

    cy.log(
      "verify that we redirected after saving the model and all card data is loaded",
    );
    cy.url().should("contain", "products-products");
    cy.wait("@card");
    cy.findByTestId("visualization-root").should(
      "contain",
      "Rustic Paper Wallet",
    );

    H.openVizSettingsSidebar();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findAllByText("Ean").should("have.length", 1);
      cy.findAllByText("Products_2 → Ean").should("have.length", 1);

      cy.button("Add or remove columns").click();
      cy.findAllByText("Ean").should("have.length", 1);
      cy.findByLabelText("Ean").should("be.checked");

      cy.findByLabelText("Products_2 → Ean").should("be.checked");
      cy.findAllByText("Products_2 → Ean").should("have.length", 1).click();

      cy.wait("@dataset");

      cy.log("Only the clicked column should be removed (metabase#46756)");
      cy.findByLabelText("Products_2 → Ean").should("not.be.checked");
      cy.findByLabelText("Ean").should("be.checked");
    });

    cy.log(
      "There should be no error in the table visualization (metabase#41785)",
    );
    cy.findAllByTestId("header-cell")
      .filter(":contains(Ean)")
      .should("be.visible");

    H.tableInteractive().should("contain", "Small Marble Shoes");
  });
});

describe("issue 40635", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("correctly displays question's and nested model's column names (metabase#40635)", () => {
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });

    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("Select all").click();

    H.join();

    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Products").click();
    });

    H.getNotebookStep("join", { stage: 0, index: 0 })
      .button("Pick columns")
      .click();
    H.popover().within(() => {
      cy.findByText("Select all").click();
      cy.findByText("ID").click();
    });

    H.join();

    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Products").click();
    });

    H.getNotebookStep("join", { stage: 0, index: 1 })
      .button("Pick columns")
      .click();
    H.popover().within(() => {
      cy.findByText("Select all").click();
      cy.findByText("ID").click();
    });

    H.getNotebookStep("join", { stage: 0, index: 1 })
      .findByText("Product ID")
      .click();
    H.popover().findByText("User ID").click();

    H.visualize();
    assertSettingsSidebar();
    assertVisualizationColumns();

    cy.button("Save").click();
    H.modal().button("Save").click();

    H.undoToast()
      .should("contain", "Add this to a dashboard")
      .icon("close")
      .click();

    assertSettingsSidebar();
    assertVisualizationColumns();

    H.openQuestionActions();
    H.popover().findByTextEnsureVisible("Turn into a model").click();
    H.modal().button("Turn this into a model").click();
    H.undoToast()
      .should("contain", "This is a model now")
      .icon("close")
      .click();

    assertSettingsSidebarNestedQuery();
    assertVisualizationColumns();

    H.openNotebook();
    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().within(() => {
      cy.findAllByText("ID").should("have.length", 1);
      cy.findAllByText("Products → ID").should("have.length", 1);
      cy.findAllByText("Products - User → ID").should("have.length", 1);
    });
  });

  function assertVisualizationColumns() {
    assertTableHeader(0, "ID");
    assertTableHeader(1, "Products → ID");
    assertTableHeader(2, "Products - User → ID");
  }

  function assertTableHeader(index: number, name: string) {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("header-cell").eq(index).should("have.text", name);
  }

  function assertSettingsSidebar() {
    H.openVizSettingsSidebar();

    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findAllByText("ID").should("have.length", 1);
      cy.findAllByText("Products → ID").should("have.length", 1);
      cy.findAllByText("Products - User → ID").should("have.length", 1);

      cy.findByRole("button", { name: "Add or remove columns" }).click();
      cy.findAllByText("ID").should("have.length", 4);
      cy.findAllByText("Products").should("have.length", 1);
      cy.findAllByText("Products - User").should("have.length", 1);
    });

    cy.button("Done").click();
  }

  function assertSettingsSidebarNestedQuery() {
    H.openVizSettingsSidebar();

    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findAllByText("ID").should("have.length", 1);
      cy.findAllByText("Products → ID").should("have.length", 1);
      cy.findAllByText("Products - User → ID").should("have.length", 1);

      cy.findByRole("button", { name: "Add or remove columns" }).click();
      cy.findAllByText("ID").should("have.length", 1);
      cy.findAllByText("Products → ID").should("have.length", 1);
      cy.findAllByText("Products - User → ID").should("have.length", 1);
    });

    cy.button("Done").click();
  }
});

describe("issue 43088", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to create ad-hoc questions based on instance analytics models (metabase#43088)", () => {
    cy.visit("/");
    H.navigationSidebar().findByText("Usage analytics").click();
    H.getPinnedSection().findByText("People").scrollIntoView().click();
    cy.wait("@dataset");
    H.summarize();
    H.rightSidebar().button("Done").click();
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(1);
  });
});

describe("issue 35840", () => {
  const modelName = "M1";
  const questionName = "Q1";

  const modelDetails: StructuredQuestionDetails = {
    type: "model",
    name: modelName,
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        Category: ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
      },
    },
  };

  const getQuestionDetails = (modelId: CardId): StructuredQuestionDetails => ({
    type: "question",
    name: questionName,
    query: {
      "source-table": `card__${modelId}`,
    },
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  function checkColumnMapping(path: string[]) {
    H.pickEntity({ path, select: true });
    H.modal().findByPlaceholderText("Pick a column…").click();
    H.selectDropdown().findAllByText("Category").eq(0).click();
    H.modal().within(() => {
      cy.findByDisplayValue("Category").should("be.visible");
      cy.findByDisplayValue("Category, Category").should("not.exist");
    });
  }

  it("should not confuse a model field with an expression that has the same name in dashboard parameter sources (metabase#35840)", () => {
    cy.log("Setup dashboard");
    H.createQuestion(modelDetails).then(({ body: model }) =>
      H.createQuestion(getQuestionDetails(model.id)),
    );
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.setDropdownFilterType();
    H.sidebar().findByText("Edit").click();

    cy.log("Use model for dropdown source");
    H.modal().within(() => {
      cy.findByText("From another model or question").click();
      cy.findByText("Pick a model or question…").click();
    });
    checkColumnMapping(["Our analytics", modelName]);

    cy.log("Use model-based question for dropdown source");
    H.modal().findByText(modelName).click();
    checkColumnMapping(["Our analytics", questionName]);
  });
});

function drillDashboardFK({ id }: { id: number }) {
  cy.get(".test-Table-FK").contains(id).first().click();
}
