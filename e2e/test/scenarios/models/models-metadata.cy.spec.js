import { H } from "e2e/support";
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

      cy.createQuestion(modelDetails).then(({ body: { id } }) => {
        cy.visit(`/model/${id}`);
        cy.wait("@dataset");
      });
    });

    it("should edit GUI model metadata", () => {
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
      cy.url().should("include", "/metadata");

      H.openColumnOptions("Subtotal");
      H.renameColumn("Subtotal", "Pre-tax");
      H.setColumnType("No special type", "Cost");
      H.saveMetadataChanges();

      cy.log(
        "Ensure that a question created from this model inherits its metadata.",
      );
      startQuestionFromModel("GUI Model");
      H.visualize();

      cy.findAllByTestId("header-cell")
        .should("contain", "Pre-tax ($)")
        .and("not.contain", "Subtotal");
    });

    it("allows for canceling changes", () => {
      H.openQuestionActions();
      H.popover().findByTextEnsureVisible("Edit metadata").click();

      H.openColumnOptions("Subtotal");
      H.renameColumn("Subtotal", "Pre-tax");
      H.setColumnType("No special type", "Cost");

      cy.findByTestId("dataset-edit-bar").button("Cancel").click();
      H.modal().button("Discard changes").click();

      cy.findAllByTestId("header-cell")
        .should("contain", "Subtotal")
        .and("not.contain", "Pre-tax");
    });

    it(
      "clears custom metadata when a model is turned back into a question",
      { tags: "@flaky" },
      () => {
        H.openQuestionActions();
        H.popover().findByTextEnsureVisible("Edit metadata").click();

        H.openColumnOptions("Subtotal");
        H.renameColumn("Subtotal", "Pre-tax");
        H.setColumnType("No special type", "Cost");
        H.saveMetadataChanges();

        cy.findAllByTestId("header-cell")
          .should("contain", "Pre-tax ($)")
          .and("not.contain", "Subtotal");

        H.openQuestionActions();
        H.popover()
          .findByTextEnsureVisible("Turn back to saved question")
          .click();
        cy.wait("@cardQuery");

        cy.findAllByTestId("header-cell")
          .should("contain", "Subtotal")
          .and("not.contain", "Pre-tax ($)");
      },
    );
  });

  it("should edit native model metadata", () => {
    cy.createNativeQuestion(
      {
        name: "Native Model",
        type: "model",
        native: {
          query: "SELECT * FROM ORDERS LIMIT 5",
        },
      },
      { visitQuestion: true },
    );

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
    cy.url().should("include", "/metadata");

    H.openColumnOptions("SUBTOTAL");

    H.mapColumnTo({ table: "Orders", column: "Subtotal" });
    H.renameColumn("Subtotal", "Pre-tax");
    H.setColumnType("No special type", "Cost");
    H.saveMetadataChanges();

    cy.findAllByTestId("header-cell")
      .should("contain", "Pre-tax ($)")
      .and("not.contain", "Subtotal");

    cy.log(
      "Ensure that a question created from this model inherits its metadata.",
    );
    startQuestionFromModel("Native Model");
    H.visualize();

    cy.findAllByTestId("header-cell")
      .should("contain", "Pre-tax ($)")
      .and("not.contain", "Subtotal");
  });

  it("should allow setting column relations (metabase#29318)", () => {
    cy.createNativeQuestion(
      {
        name: "Native Model",
        type: "model",
        native: {
          query: "SELECT * FROM ORDERS LIMIT 5",
        },
      },
      { visitQuestion: true },
    );
    H.openQuestionActions();
    H.popover().findByTextEnsureVisible("Edit metadata").click();
    H.openColumnOptions("USER_ID");
    H.setColumnType("No special type", "Foreign Key");
    H.sidebar().findByText("Select a target").click();
    H.popover().findByText("People → ID").click();
    H.saveMetadataChanges();
    // TODO: Not much to do with it at the moment beyond saving it.
    // Check that the relation is automatically suggested in the notebook once it is implemented.
  });

  it("should keep metadata in sync with the query", () => {
    cy.createNativeQuestion(
      {
        name: "Native Model",
        type: "model",
        native: {
          query: "SELECT * FROM ORDERS LIMIT 5",
        },
      },
      { visitQuestion: true },
    );

    H.openQuestionActions();
    H.popover().findByTextEnsureVisible("Edit query definition").click();

    H.main().within(() => {
      cy.get("textarea")
        .focus()
        .invoke("val", "")
        .type("SELECT TOTAL FROM ORDERS LIMIT 5");
    });

    cy.findByTestId("editor-tabs-metadata-name").click();
    cy.wait("@dataset");

    cy.findAllByTestId("header-cell")
      .should("have.length", 1)
      .and("have.text", "TOTAL");
    cy.findByLabelText("Display name").should("have.value", "TOTAL");
  });

  it("should allow reverting to a specific metadata revision", () => {
    cy.intercept("POST", "/api/revision/revert").as("revert");

    cy.createNativeQuestion({
      name: "Native Model",
      type: "model",
      native: {
        query: "SELECT * FROM ORDERS LIMIT 5",
      },
    }).then(({ body: { id: nativeModelId } }) => {
      cy.visit(`/model/${nativeModelId}/metadata`);
      cy.wait("@cardQuery");
    });

    H.openColumnOptions("SUBTOTAL");
    H.mapColumnTo({ table: "Orders", column: "Subtotal" });
    H.setColumnType("No special type", "Cost");
    H.saveMetadataChanges();

    cy.log("Revision 1");
    cy.findByTestId("TableInteractive-root").within(() => {
      cy.findByText("Subtotal ($)").should("be.visible");
      cy.findByText("SUBTOTAL").should("not.exist");
    });

    H.openQuestionActions();
    H.popover().findByTextEnsureVisible("Edit metadata").click();

    cy.log("Revision 2");
    H.openColumnOptions("TAX");
    H.mapColumnTo({ table: "Orders", column: "Tax" });
    H.setColumnType("No special type", "Cost");
    H.saveMetadataChanges();

    cy.findAllByTestId("header-cell")
      .should("contain", "Subtotal ($)")
      .and("contain", "Tax ($)")
      .and("not.contain", "TAX");

    cy.reload();
    H.questionInfoButton().click();

    cy.findByTestId("sidesheet").within(() => {
      cy.findByRole("tab", { name: "History" }).click();
      cy.findAllByTestId("question-revert-button").first().click();
    });

    cy.wait("@revert");
    cy.findAllByTestId("header-cell")
      .should("contain", "Subtotal ($)")
      .and("not.contain", "Tax ($)")
      .and("contain", "TAX");
  });

  describe("native models metadata overwrites", { viewportWidth: 1400 }, () => {
    beforeEach(() => {
      cy.createNativeQuestion(
        {
          name: "Native Model",
          type: "model",
          native: {
            query: "select * from orders limit 100",
          },
        },
        { wrapId: true, idAlias: "modelId" },
      );

      cy.get("@modelId").then(modelId => {
        H.setModelMetadata(modelId, field => {
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

    it("should allow drills on FK columns", () => {
      cy.get("@modelId").then(modelId => {
        cy.visit(`/model/${modelId}`);
        cy.wait("@dataset");

        // Drill to People table
        // FK column is mapped to real DB column
        drillFK({ id: 1 });
        cy.wait("@dataset");
        cy.findByTestId("object-detail").within(() => {
          cy.findByText("68883"); // zip
          cy.findAllByText("Hudson Borer");
          cy.icon("close").click();
        });

        cy.go("back"); // navigate away from drilled table
        cy.wait("@dataset");

        cy.findByText("Native Model"); // we are back on the original model

        // Drill to Reviews table
        // FK column has a FK semantic type, no mapping to real DB columns
        drillFK({ id: 7 });
        cy.wait("@dataset");
        cy.findByTestId("object-detail").within(() => {
          cy.findAllByText("7");
          cy.findAllByText("perry.ruecker");
        });
      });
    });

    it("should show implicit joins on FK columns with real DB columns (#37067)", () => {
      cy.get("@modelId").then(modelId => {
        cy.visit(`/model/${modelId}`);
        cy.wait("@dataset");

        // Drill to People table
        // FK column is mapped to real DB column
        H.queryBuilderHeader()
          .button(/Filter/)
          .click();

        H.modal().within(() => {
          cy.findByRole("tablist").within(() => {
            cy.get("button").should("have.length", 2); // Just the two we're expecting and not the other fake FK.
            cy.findByText("Native Model").should("exist");

            const userTab = cy.findByText("User");
            userTab.should("exist");
            userTab.click();
          });

          cy.findByTestId("filter-column-Source").findByText("Twitter").click();
          cy.findByTestId("apply-filters").click();
        });

        cy.wait("@dataset");
        cy.findByTestId("question-row-count")
          .invoke("text")
          .should("match", /Showing \d+ rows/);
        cy.findByTestId("question-row-count").should(
          "not.contain",
          "Showing 100 rows",
        );
      });
    });

    it("should allow drills on FK columns from dashboards (metabase#42130)", () => {
      cy.get("@modelId").then(modelId => {
        cy.createDashboard().then(response => {
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

    it("models metadata tab should show columns with details-only visibility (metabase#22521)", () => {
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

      cy.createQuestion(questionDetails, { visitQuestion: true });
      cy.findAllByTestId("header-cell").should("not.contain", "Vendor");

      H.openQuestionActions();
      H.popover().findByTextEnsureVisible("Edit metadata").click();

      cy.findAllByTestId("header-cell")
        .contains(/^Vendor$/)
        .should("be.visible");
    });
  });

  it("does not confuse the names of various native model columns mapped to the same database field", () => {
    H.createNativeQuestion(
      {
        type: "model",
        native: {
          query: "select 1 as A, 2 as B, 3 as C",
        },
      },
      { idAlias: "modelId", wrapId: true },
    );

    cy.get("@modelId").then(modelId => {
      H.setModelMetadata(modelId, (field, index) => ({
        ...field,
        id: ORDERS.ID,
        display_name: `ID${index + 1}`,
        semantic_type: "type/PK",
      }));

      H.visitModel(modelId);
    });

    H.openNotebook();
    cy.findByTestId("fields-picker").click();
    H.popover().within(() => {
      cy.findByText("ID1").should("be.visible");
      cy.findByText("ID2").should("be.visible");
      cy.findByText("ID3").should("be.visible");
    });
  });
});

function drillFK({ id }) {
  cy.get(".test-Table-FK").contains(id).first().click();
  H.popover().findByTextEnsureVisible("View details").click();
}

function drillDashboardFK({ id }) {
  cy.get(".test-Table-FK").contains(id).first().click();
}
