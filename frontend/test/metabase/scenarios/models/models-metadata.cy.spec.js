import {
  restore,
  rightSidebar,
  visualize,
  visitDashboard,
  popover,
  openQuestionActions,
  questionInfoButton,
} from "__support__/e2e/helpers";
import { startQuestionFromModel } from "./helpers/e2e-models-helpers";
import {
  openColumnOptions,
  renameColumn,
  setColumnType,
  mapColumnTo,
  setModelMetadata,
} from "./helpers/e2e-models-metadata-helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PEOPLE, PRODUCTS, PRODUCTS_ID, REVIEWS } = SAMPLE_DATABASE;

describe("scenarios > models metadata", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should edit GUI model metadata", () => {
    // Convert saved question "Orders" into a model
    cy.request("PUT", "/api/card/1", {
      name: "GUI Model",
      dataset: true,
    });

    cy.visit("/model/1");

    openQuestionActions();

    popover().within(() => {
      cy.findByTextEnsureVisible("89%").trigger("mouseenter");
    });

    cy.findByText(
      "Some columns are missing a column type, description, or friendly name.",
    );
    cy.findByText(
      "Adding metadata makes it easier for your team to explore this data.",
    );

    cy.findByText("Edit metadata").click();

    cy.wait(["@cardQuery", "@cardQuery"]);
    cy.url().should("include", "/metadata");
    cy.findByTextEnsureVisible("Product ID");

    openColumnOptions("Subtotal");

    renameColumn("Subtotal", "Pre-tax");
    setColumnType("No special type", "Cost");
    cy.button("Save changes").click();

    startQuestionFromModel("GUI Model");

    visualize();
    cy.findByText("Pre-tax ($)");
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

    cy.findByText(
      "Most columns are missing a column type, description, or friendly name.",
    );
    cy.findByText(
      "Adding metadata makes it easier for your team to explore this data.",
    );

    cy.findByText("Edit metadata").click();

    cy.wait(["@cardQuery", "@cardQuery"]);
    cy.url().should("include", "/metadata");
    cy.findByTextEnsureVisible("PRODUCT_ID");

    openColumnOptions("SUBTOTAL");

    mapColumnTo({ table: "Orders", column: "Subtotal" });

    renameColumn("Subtotal", "Pre-tax");

    setColumnType("No special type", "Cost");

    cy.button("Save changes").click();

    startQuestionFromModel("Native Model");

    visualize();
    cy.findByText("Pre-tax ($)");
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
    cy.findByText("Subtotal ($)");
    cy.findByText("Tax ($)").should("not.exist");

    openQuestionActions();
    cy.findByText("Edit metadata").click();

    cy.wait(["@cardQuery", "@cardQuery"]);
    cy.findByTextEnsureVisible("TAX");

    // Revision 2
    openColumnOptions("TAX");
    mapColumnTo({ table: "Orders", column: "Tax" });
    setColumnType("No special type", "Cost");
    cy.button("Save changes").click();

    cy.findByText("Subtotal ($)");
    cy.findByText("Tax ($)");

    cy.reload();
    questionInfoButton().click();

    rightSidebar().within(() => {
      cy.findByText("History");
      cy.findAllByTestId("question-revert-button").first().click();
    });

    cy.wait("@revert");
    cy.findByText("Subtotal ($)");
    cy.findByText("Tax ($)").should("not.exist");
    cy.findByText("TAX");
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
          cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
            cardId: modelId,
            size_x: 18,
            size_y: 9,
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
          cy.wait("@dataset");

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
      cy.findByText("Vendor").should("not.exist");
      cy.findByText("Edit metadata").click();
      cy.wait(["@cardQuery", "@cardQuery"]);
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
