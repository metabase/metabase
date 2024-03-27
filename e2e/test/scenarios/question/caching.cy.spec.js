import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  describeEE,
  visitQuestion,
  questionInfoButton,
  rightSidebar,
  popover,
  setTokenFeatures,
} from "e2e/support/helpers";

describeEE("scenarios > question > caching", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    cy.request("PUT", "/api/setting/enable-query-caching", { value: true });
  });

  it("can set cache ttl for a saved question", { tags: "@flaky" }, () => {
    cy.intercept("PUT", `/api/card/${ORDERS_QUESTION_ID}`).as("updateQuestion");
    visitQuestion(ORDERS_QUESTION_ID);

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
