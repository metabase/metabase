import {
  restore,
  visualize,
  popover,
  openOrdersTable,
} from "e2e/support/helpers";

describe("issue 29795", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it.skip("should allow join based on native query (metabase#29795)", () => {
    const NATIVE_QUESTION = "native question";
    cy.createNativeQuestion({
      name: NATIVE_QUESTION,
      native: { query: `Select * FROM "PUBLIC"."ORDERS"` },
    });

    openOrdersTable({ mode: "notebook" });

    cy.findByTestId("action-buttons").findByText("Join data").click();

    popover().within(() => {
      cy.icon("chevronleft").click();
      cy.findByText("Saved Questions").click();
      cy.findByText(NATIVE_QUESTION).click();
    });

    popover().within(() => {
      cy.findByText("ID").click();
    });

    popover().within(() => {
      cy.findByText("USER_ID").click();
    });

    visualize(response => {
      expect(response.body.error).not.to.exist;
    });
  });
});
