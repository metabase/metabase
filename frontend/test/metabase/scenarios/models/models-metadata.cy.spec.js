import {
  restore,
  sidebar,
  visualize,
  visitDashboard,
  popover,
} from "__support__/e2e/helpers";

import {
  openDetailsSidebar,
  startQuestionFromModel,
} from "./helpers/e2e-models-helpers";

import {
  openColumnOptions,
  renameColumn,
  setColumnType,
  mapColumnTo,
  setModelMetadata,
} from "./helpers/e2e-models-metadata-helpers";

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

    openDetailsSidebar();

    sidebar().within(() => {
      cy.findByTestId("tooltip-component-wrapper").realHover();
      cy.findByText("89%");
    });

    cy.findByText(
      "Some columns are missing a column type, description, or friendly name.",
    );
    cy.findByText(
      "Adding metadata makes it easier for your team to explore this data.",
    );

    cy.findByText("Customize metadata").click();

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

    openDetailsSidebar();

    sidebar().within(() => {
      cy.findByTestId("tooltip-component-wrapper").realHover();
      cy.findByText("37%");
    });

    cy.findByText(
      "Most columns are missing a column type, description, or friendly name.",
    );
    cy.findByText(
      "Adding metadata makes it easier for your team to explore this data.",
    );

    cy.findByText("Customize metadata").click();

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
    openDetailsSidebar();
    cy.findByText("Customize metadata").click();

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
    openDetailsSidebar();

    sidebar().within(() => {
      cy.findByText("History").click();
      cy.findAllByText("Revert")
        .first()
        .click();
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
              fk_target_field_id: 30,
            };
          }
          if (field.display_name !== "QUANTITY") {
            return field;
          }
          return {
            ...field,
            display_name: "Review ID",
            semantic_type: "type/FK",
            fk_target_field_id: 36,
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
          cy.findByRole("heading", { name: "1" });
          cy.findByText("Hudson Borer");
        });

        cy.go("back");
        cy.wait("@dataset");

        // Drill to Reviews table
        // FK column has a FK semantic type, no mapping to real DB columns
        drillFK({ id: 7 });
        cy.wait("@dataset");
        cy.findByTestId("object-detail").within(() => {
          cy.findByRole("heading", { name: "7" });
          cy.findByText("perry.ruecker");
        });
      });
    });

    it("should allow drills on FK columns from dashboards", () => {
      cy.get("@modelId").then(modelId => {
        cy.createDashboard().then(response => {
          const dashboardId = response.body.id;
          cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
            cardId: modelId,
            sizeX: 18,
            sizeY: 9,
          });

          visitDashboard(dashboardId);

          // Drill to People table
          // FK column is mapped to real DB column
          drillDashboardFK({ id: 1 });
          cy.wait("@dataset");
          cy.findByTestId("object-detail").within(() => {
            cy.findByRole("heading", { name: "1" });
            cy.findByText("Hudson Borer");
          });

          cy.go("back");
          cy.wait("@dataset");

          // Drill to Reviews table
          // FK column has a FK semantic type, no mapping to real DB columns
          drillDashboardFK({ id: 7 });
          cy.wait("@dataset");
          cy.findByTestId("object-detail").within(() => {
            cy.findByRole("heading", { name: "7" });
            cy.findByText("perry.ruecker");
          });
        });
      });
    });
  });
});

function drillFK({ id }) {
  cy.get(".Table-FK")
    .contains(id)
    .first()
    .click();
  popover()
    .findByText("View details")
    .click();
}

function drillDashboardFK({ id }) {
  cy.get(".Table-FK")
    .contains(id)
    .first()
    .click();
}
