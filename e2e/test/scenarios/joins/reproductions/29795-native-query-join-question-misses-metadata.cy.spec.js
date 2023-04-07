import {
  restore,
  visualize,
  popover,
  openOrdersTable,
} from "e2e/support/helpers";

describe.skip("issue 29795", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow join based on native query (metabase#29795)", () => {
    const NATIVE_QUESTION = "native question";
    const LIMIT = 5;
    cy.createNativeQuestion(
      {
        name: NATIVE_QUESTION,
        native: { query: `SELECT * FROM "PUBLIC"."ORDERS" LIMIT ${LIMIT}` },
      },
      { loadMetadata: true },
    );

    openOrdersTable({ mode: "notebook" });

    cy.button("Join data").click();

    popover().within(() => {
      cy.icon("chevronleft").click();
      cy.findByText("Saved Questions").click();
      cy.findByRole("menuitem", { name: NATIVE_QUESTION }).click();
    });

    popover().within(() => {
      cy.findByRole("option", { name: "ID" }).click();
    });

    popover().within(() => {
      cy.findByRole("option", { name: "USER_ID" }).click();
    });

    visualize(() => {
      cy.findByText(/USER ID/i);
    });
  });
});
