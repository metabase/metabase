import { restore, modal } from "e2e/support/helpers";
const embeddingPage = "/admin/settings/embedding-in-other-applications";

describe("scenarios > embedding > standalone embedding", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow you to set and regenerate an embedding token", () => {
    cy.visit(embeddingPage);
    cy.findByTestId("-standalone-embeds-setting")
      .findByText("Standalone embeds")
      .click();
    cy.findByRole("button", { name: "Regenerate key" }).click();

    modal().within(() => {
      cy.findByText("Regenerate embedding key?").should("exist");
      cy.findByText(
        "This will cause existing embeds to stop working until they are updated with the new key.",
      ).should("exist");
    });
  });
});
