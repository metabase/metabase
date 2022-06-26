import {
  restore,
  describeEE,
  mockSessionProperty,
  modal,
  visitDashboard,
} from "__support__/e2e/helpers";

describeEE("scenarios > dashboard > caching", () => {
  beforeEach(() => {
    restore();
    mockSessionProperty("enable-query-caching", true);
    cy.signInAsAdmin();
  });

  it("can set cache ttl for a saved question", () => {
    cy.intercept("PUT", "/api/dashboard/1").as("updateDashboard");
    visitDashboard(1);

    openEditingModalForm();
    modal().within(() => {
      cy.findByText("More options").click();
      cy.findByPlaceholderText("24")
        .clear()
        .type("48")
        .blur();
      cy.button("Update").click();
    });

    cy.wait("@updateDashboard");
    cy.reload();

    openEditingModalForm();
    modal().within(() => {
      cy.findByText("More options").click();
      cy.findByDisplayValue("48")
        .clear()
        .type("0")
        .blur();
      cy.button("Update").click();
    });

    cy.wait("@updateDashboard");
    cy.reload();

    openEditingModalForm();
    modal().within(() => {
      cy.findByText("More options").click();
      cy.findByPlaceholderText("24");
    });
  });
});

function openEditingModalForm() {
  cy.get("main header").within(() => {
    cy.icon("ellipsis").click();
  });
  cy.findByText("Edit dashboard details").click();
}
