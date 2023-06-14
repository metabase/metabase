import {
  restore,
  rightSidebar,
  visualize,
  visitDashboard,
  popover,
  openQuestionActions,
  questionInfoButton,
  addOrUpdateDashboardCard,
  openColumnOptions,
  renameColumn,
  setColumnType,
  mapColumnTo,
  setModelMetadata,
} from "e2e/support/helpers";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { startQuestionFromModel } from "./helpers/e2e-models-helpers";

const { PEOPLE, PRODUCTS, PRODUCTS_ID, REVIEWS } = SAMPLE_DATABASE;

describe("scenarios > models metadata", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("GUI model", () => {
    beforeEach(() => {
      // Convert saved question "Orders" into a model
      cy.request("PUT", `/api/card${ORDERS_QUESTION_ID}`, {
        name: "GUI Model",
        dataset: true,
      });

      cy.visit(`/model/${ORDERS_QUESTION_ID}`);
    });

    it("should edit GUI model metadata", () => {
      openQuestionActions();

      popover().within(() => {
        cy.findByTextEnsureVisible("89%").trigger("mouseenter");
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "Some columns are missing a column type, description, or friendly name.",
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "Adding metadata makes it easier for your team to explore this data.",
      );

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit metadata").click();

      cy.url().should("include", "/metadata");
      cy.findByTextEnsureVisible("Product ID");

      openColumnOptions("Subtotal");

      renameColumn("Subtotal", "Pre-tax");
      setColumnType("No special type", "Cost");
      cy.button("Save changes").click();

      startQuestionFromModel("GUI Model");

      visualize();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pre-tax ($)");
    });

    it("allows for canceling changes", () => {
      openQuestionActions();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit metadata").click();

      openColumnOptions("Subtotal");

      renameColumn("Subtotal", "Pre-tax");
      setColumnType("No special type", "Cost");

      cy.button("Cancel").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Subtotal");
    });

    it("clears custom metadata when a model is turned back into a question", () => {
      openQuestionActions();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit metadata").click();

      openColumnOptions("Subtotal");

      renameColumn("Subtotal", "Pre-tax");
      setColumnType("No special type", "Cost");
      cy.button("Save changes").click();

      openQuestionActions();
      popover().within(() => {
        cy.findByText("Turn back to saved question").click();
      });

      cy.wait("@dataset");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Subtotal");
    });
  });

  it("should edit native model metadata", () => {
    cy.createNativeQuestion(
      {
        name: "Native Model",
        dataset: true,
        native: {
          query: "SELECT * FROM ORDERS",
        },
      },
      { visitQuestion: true },
    );

    openQuestionActions();

    popover().within(() => {
      cy.findByTextEnsureVisible("37%").trigger("mouseenter");
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "Most columns are missing a column type, description, or friendly name.",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "Adding metadata makes it easier for your team to explore this data.",
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit metadata").click();

    cy.url().should("include", "/metadata");
    cy.findByTextEnsureVisible("PRODUCT_ID");

    openColumnOptions("SUBTOTAL");

    mapColumnTo({ table: "Orders", column: "Subtotal" });

    renameColumn("Subtotal", "Pre-tax");

    setColumnType("No special type", "Cost");

    cy.button("Save changes").click();

    startQuestionFromModel("Native Model");

    visualize();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pre-tax ($)");
  });

  it("should allow setting column relations (metabase#29318)", () => {
    cy.createNativeQuestion(
      {
        name: "Native Model",
        dataset: true,
        native: {
          query: "SELECT * FROM ORDERS",
        },
      },
      { visitQuestion: true },
    );
    openQuestionActions();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit metadata").click();
    openColumnOptions("USER_ID");
    setColumnType("No special type", "Foreign Key");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select a target").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("People → ID").click();
    cy.button("Save changes").click();
    // TODO: Not much to do with it at the moment beyond saving it.
    // Check that the relation is automatically suggested in the notebook once it is implemented.
  });

  it("should keep metadata in sync with the query", () => {
    cy.createNativeQuestion(
      {
        name: "Native Model",
        dataset: true,
        native: {
          query: "SELECT * FROM ORDERS",
        },
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    popover().within(() => {
      cy.findByText("Edit query definition").click();
    });

    cy.get(".ace_content").type(
      "{selectAll}{backspace}SELECT TOTAL FROM ORDERS",
    );

    cy.findByTestId("editor-tabs-metadata-name").click();
    cy.wait("@dataset");

    cy.findByTestId("header-cell").should("have.length", 1);
    cy.findByLabelText("Display name").should("have.value", "TOTAL");
  });

  it("should allow reverting to a specific metadata revision", () => {
    cy.intercept("POST", "/api/revision/revert").as("revert");

    cy.createNativeQuestion({
      name: "Native Model",
      dataset: true,
      native: {
        query: "SELECT * FROM ORDERS",
      },
    }).then(({ body: { id: nativeModelId } }) => {
      cy.visit(`/model/${nativeModelId}/metadata`);
      cy.wait("@cardQuery");
      cy.findByTextEnsureVisible("PRODUCT_ID");
    });

    openColumnOptions("SUBTOTAL");
    mapColumnTo({ table: "Orders", column: "Subtotal" });
    setColumnType("No special type", "Cost");
    cy.button("Save changes").click();

    // Revision 1
    cy.findAllByTestId("header-cell")
      .should("contain", "Subtotal ($)")
      .and("not.contain", "SUBTOTAL");

    openQuestionActions();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit metadata").click();

    cy.findByTextEnsureVisible("TAX");

    // Revision 2
    openColumnOptions("TAX");
    mapColumnTo({ table: "Orders", column: "Tax" });
    setColumnType("No special type", "Cost");
    cy.button("Save changes").click();

    cy.findAllByTestId("header-cell")
      .should("contain", "Subtotal ($)")
      .and("contain", "Tax ($)")
      .and("not.contain", "TAX");

    cy.reload();
    questionInfoButton().click();

    rightSidebar().within(() => {
      cy.findByText("History");
      cy.findAllByTestId("question-revert-button").first().click();
    });

    cy.wait("@revert");
    cy.findAllByTestId("header-cell")
      .should("contain", "Subtotal ($)")
      .and("not.contain", "Tax ($)")
      .and("contain", "TAX");
  });

  describe("native models metadata overwrites", () => {
    beforeEach(() => {
      cy.createNativeQuestion(
        {
          name: "Native Model",
          dataset: true,
          native: {
            query: "select * from orders",
          },
        },
        { wrapId: true, idAlias: "modelId" },
      );

      cy.get("@modelId").then(modelId => {
        setModelMetadata(modelId, field => {
          if (field.display_name === "USER_ID") {
            return {
              ...field,
              id: 11,
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

      cy.intercept("POST", "/api/dataset").as("dataset");
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
        });

        cy.go("back"); // close modal
        cy.wait("@dataset");
        cy.go("back"); // navigate away from drilled table
        cy.wait("@dataset");

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

    it("should allow drills on FK columns from dashboards", () => {
      cy.get("@modelId").then(modelId => {
        cy.createDashboard().then(response => {
          const dashboardId = response.body.id;
          addOrUpdateDashboardCard({
            dashboard_id: dashboardId,
            card_id: modelId,
            card: { size_x: 24, size_y: 9 },
          });

          visitDashboard(dashboardId);

          // Drill to People table
          // FK column is mapped to real DB column
          drillDashboardFK({ id: 1 });
          cy.wait("@dataset");
          cy.findByTestId("object-detail").within(() => {
            cy.findAllByText("1");
            cy.findAllByText("Hudson Borer");
          });

          cy.go("back");

          // Drill to Reviews table
          // FK column has a FK semantic type, no mapping to real DB columns
          drillDashboardFK({ id: 7 });
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
        dataset: true,
        query: {
          "source-table": PRODUCTS_ID,
        },
      };

      cy.createQuestion(questionDetails, { visitQuestion: true });
      openQuestionActions();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Vendor").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit metadata").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Vendor").should("be.visible");
    });
  });
});

function drillFK({ id }) {
  cy.get(".Table-FK").contains(id).first().click();
  popover().findByText("View details").click();
}

function drillDashboardFK({ id }) {
  cy.get(".Table-FK").contains(id).first().click();
}
