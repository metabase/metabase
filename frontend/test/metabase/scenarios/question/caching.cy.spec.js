import {
  restore,
  describeEE,
  mockSessionProperty,
  visitQuestion,
  questionInfoButton,
  rightSidebar,
  popover,
} from "__support__/e2e/helpers";

describeEE("scenarios > question > caching", () => {
  beforeEach(() => {
    restore();
    mockSessionProperty("enable-query-caching", true);
    cy.signInAsAdmin();
  });

  it("can set cache ttl for a saved question", () => {
    cy.intercept("PUT", "/api/card/1").as("updateQuestion");
    visitQuestion(1);

    questionInfoButton().click();

    rightSidebar().within(() => {
      cy.findByText("Cache Configuration").click();
    });

    popover().within(() => {
      cy.findByPlaceholderText("24").clear().type("48").blur();
      cy.button("Save changes").click();
    });

    cy.wait("@updateQuestion");
    cy.button(/Saved/);
    cy.reload();

    questionInfoButton().click();

    rightSidebar().within(() => {
      cy.findByText("Cache Configuration").click();
    });

    popover().within(() => {
      cy.findByDisplayValue("48").clear().type("0").blur();
      cy.button("Save changes").click();
    });

    cy.wait("@updateQuestion");
    cy.button(/Saved/);
    cy.reload();

    questionInfoButton().click();

    rightSidebar().within(() => {
      cy.findByText("Cache Configuration").click();
    });

    popover().within(() => {
      cy.findByPlaceholderText("24");
    });
  });
});
