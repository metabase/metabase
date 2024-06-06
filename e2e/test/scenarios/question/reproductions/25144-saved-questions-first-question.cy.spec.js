import {
  modal,
  entityPickerModal,
  saveQuestion,
  newButton,
  entityPickerModalTab,
  entityPickerModalItem,
  restore,
  onlyOnOSS,
} from "e2e/support/helpers";

// this is only testable in OSS because EE always has models from auditv2
describe("issue 25144", { tags: "@OSS" }, () => {
  beforeEach(() => {
    onlyOnOSS();
    restore("setup");
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("createCard");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should show Saved Questions tab after creating the first question (metabase#25144)", () => {
    cy.visit("/");

    newButton("Question").click();

    entityPickerModal().within(() => {
      cy.findByText("Saved questions").should("not.exist");
      entityPickerModalItem(2, "Orders").click();
    });

    saveQuestion("Orders question");

    newButton("Question").click();

    entityPickerModal().within(() => {
      entityPickerModalTab("Saved questions").should("be.visible").click();
      entityPickerModalItem(1, "Orders question").should("be.visible");
    });
  });

  it("should show Models tab after creation the first model (metabase#24878)", () => {
    cy.visit("/");

    newButton("Model").click();
    cy.findByTestId("new-model-options")
      .findByText(/use the notebook/i)
      .click();
    entityPickerModal().within(() => {
      entityPickerModalItem(2, "Orders").click();
    });

    cy.findByTestId("dataset-edit-bar").button("Save").click();

    modal().within(() => {
      cy.findByLabelText("Name").clear().type("Orders model");
      cy.button("Save").click();
    });
    cy.wait("@createCard");

    newButton("Question").click();

    entityPickerModal().within(() => {
      entityPickerModalTab("Models").should("be.visible").click();
      entityPickerModalItem(1, "Orders model").should("be.visible");
    });
  });
});
