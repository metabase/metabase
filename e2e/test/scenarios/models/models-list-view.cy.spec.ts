import type { Field } from "metabase-types/api";

const { H } = cy;

describe("scenarios > models list view", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("createCard");

    H.createNativeQuestion({
      name: "Native Model",
      type: "model",
      native: {
        query: "SELECT * FROM ORDERS LIMIT 5",
      },
    }).then(({ body: { id: modelId } }) => {
      H.setModelMetadata(modelId, (field: Field) =>
        field.display_name === "SUBTOTAL"
          ? {
              ...field,
              semantic_type: "type/Quantity",
              settings: { show_mini_bar: true },
            }
          : field,
      );
      H.visitModel(modelId);
    });
  });

  it("should save list as the default view and keep it on duplicates", () => {
    H.openQuestionActions();
    H.popover().findByTextEnsureVisible("Edit metadata").click();
    cy.findByTestId("dataset-edit-bar").findByText("Settings").click();
    cy.findByTestId("sidebar-right").findByText("List").click();
    cy.findByTestId("list-view").should("be.visible");

    cy.log("The list layout editor is laid out and visible");
    cy.findByRole("button", { name: "Customize the List layout" }).click();
    cy.findByTestId("list-view-left-columns")
      .should("be.visible")
      .findByText("ID")
      .should("be.visible");
    cy.findByTestId("list-view-right-columns")
      .findByText("USER_ID")
      .should("be.visible");
    cy.findByTestId("list-view-preview").findByText("14").should("be.visible");

    cy.findByTestId("dataset-edit-bar").button("Save changes").click();
    cy.wait("@dataset");
    cy.findByTestId("dataset-edit-bar").should("not.exist");

    cy.log("The backend sends the column settings of the model metadata");
    cy.findByTestId("list-view")
      .findAllByTestId("mini-bar-container")
      .should("have.length.at.least", 1);

    cy.reload();
    cy.findByTestId("list-view").should("be.visible");

    H.openQuestionActions();
    H.popover().findByTextEnsureVisible("Duplicate").click();
    H.modal().findByTextEnsureVisible("Duplicate").click();
    cy.wait("@dataset");

    cy.findByTestId("qb-header")
      .findByText("Native Model - Duplicate")
      .should("be.visible");
    cy.findByTestId("list-view").should("be.visible");

    cy.log("The URL moves to the duplicate after it renders; reload only then");
    cy.wait("@createCard").then(({ response }) => {
      cy.location("pathname").should(
        "match",
        new RegExp(`^/model/${response?.body.id}-`),
      );
    });
    cy.reload();
    cy.findByTestId("qb-header")
      .findByText("Native Model - Duplicate")
      .should("be.visible");
    cy.findByTestId("list-view").should("be.visible");
  });
});
