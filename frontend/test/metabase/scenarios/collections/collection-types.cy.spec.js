import { restore, modal, describeWithToken } from "__support__/e2e/cypress";

describeWithToken("collections types", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to manage collection authority level", () => {
    cy.visit("/collection/root");

    // Test can create official collection
    cy.icon("new_folder").click();
    modal().within(() => {
      cy.findByLabelText("Name").type("Official Collection Test");
      setOfficial();
      cy.button("Create").click();
    });
    cy.findByText("Official Collection Test").click();
    cy.findByTestId("official-collection-marker");

    // Test can change regular collection to official
    cy.icon("pencil").click();
    cy.findByText("Edit this collection").click();
    modal().within(() => {
      setOfficial(false);
      cy.button("Update").click();
    });
    cy.findByTestId("official-collection-marker").should("not.exist");

    // Test can change regular collection to official
    cy.icon("pencil").click();
    cy.findByText("Edit this collection").click();
    modal().within(() => {
      setOfficial();
      cy.button("Update").click();
    });
    cy.findByTestId("official-collection-marker");
  });
});

function setOfficial(official = true) {
  const isOfficialNow = !official;
  cy.findByLabelText("Regular").should(
    isOfficialNow ? "not.be.checked" : "be.checked",
  );
  cy.findByLabelText("Official").should(
    isOfficialNow ? "be.checked" : "not.be.checked",
  );
  cy.findByText(official ? "Official" : "Regular").click();
}
