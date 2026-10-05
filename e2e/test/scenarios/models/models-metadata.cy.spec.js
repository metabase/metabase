const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import { startQuestionFromModel } from "./helpers/e2e-models-helpers";

const { PEOPLE, PRODUCTS, PRODUCTS_ID, REVIEWS, ORDERS_ID, ORDERS } =
  SAMPLE_DATABASE;

describe("scenarios > models metadata", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("GUI model", () => {
    beforeEach(() => {
      const modelDetails = {
        name: "GUI Model",
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
        },
        type: "model",
      };

      H.createQuestion(modelDetails, { visitQuestion: true, wrapId: true });
    });

    it("should edit GUI model metadata, cancel changes, and clear it when turned back into a question", () => {
      cy.log("cancel metadata changes");
      H.openQuestionActions("Edit metadata");
      H.waitForLoaderToBeRemoved();

      H.openColumnOptions("Subtotal");
      H.renameColumn("Subtotal", "Pre-tax");
      H.setColumnType("No semantic type", "Currency");

      H.datasetEditBar().button("Cancel").click();
      H.modal().button("Discard changes").click();
      H.datasetEditBar().should("not.exist");

      cy.findAllByTestId("header-cell")
        .filter(":contains(Subtotal)")
        .should("not.contain", "$");
      cy.findAllByTestId("header-cell").should("not.contain", "Pre-tax");

      cy.log("edit metadata");
      H.openQuestionActions();

      H.popover().findByTextEnsureVisible("89%").realHover();

      cy.findByTestId("tooltip-content").within(() => {
        cy.findByText(
          "Some columns are missing a column type, description, or friendly name.",
        );
        cy.findByText(
          "Adding metadata makes it easier for your team to explore this data.",
        );
      });

      H.popover().findByTextEnsureVisible("Edit metadata").click();
      cy.url().should("include", "/columns");
      H.waitForLoaderToBeRemoved();

      H.openColumnOptions("Subtotal");
      H.renameColumn("Subtotal", "Pre-tax");
      H.setColumnType("No semantic type", "Currency");
      H.saveMetadataChanges();

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
      cy.get("@questionId").then((id) => H.visitModel(id));
      cy.findAllByTestId("header-cell").should("contain", "Pre-tax ($)");

      H.openQuestionActions();
      H.popover()
        .findByTextEnsureVisible("Turn back to saved question")
        .click();
      cy.wait("@cardQuery");

      cy.findAllByTestId("header-cell")
        .should("contain", "Subtotal")
        .and("not.contain", "Pre-tax ($)");
    });
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
    H.openQuestionActions();

    H.popover().findByTextEnsureVisible("37%").realHover();

    cy.findByTestId("tooltip-content").within(() => {
      cy.findByText(
        "Most columns are missing a column type, description, or friendly name.",
      );
      cy.findByText(
        "Adding metadata makes it easier for your team to explore this data.",
      );
    });

    H.popover().findByTextEnsureVisible("Edit metadata").click();
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
    const ordersJoinProductsQuery = {
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

  it("models columns tab should show columns with details-only visibility (metabase#22521)", () => {
    cy.request("PUT", `/api/field/${PRODUCTS.VENDOR}`, {
      visibility_type: "details-only",
    });

    const questionDetails = {
      name: "22521",
      type: "model",
      query: {
        "source-table": PRODUCTS_ID,
        limit: 5,
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });
    cy.findAllByTestId("header-cell")
      .should("contain", "Title")
      .and("not.contain", "Vendor");

    H.openQuestionActions();
    H.popover().findByTextEnsureVisible("Edit metadata").click();
    H.waitForLoaderToBeRemoved();

    cy.findAllByTestId("header-cell")
      .contains(/^Vendor$/)
      .should("be.visible");
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

      cy.get("@modelId").then((modelId) => {
        H.setModelMetadata(modelId, (field) => {
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
      cy.get("@modelId").then((modelId) => {
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

function drillDashboardFK({ id }) {
  cy.get(".test-Table-FK").contains(id).first().click();
}
