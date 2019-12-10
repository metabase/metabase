import { signInAsAdmin, signInAsNormalUser } from "__support__/cypress";

describe("homepage", () => {
  describe("content management", () => {
    beforeEach(() => {
      signInAsAdmin();
      // Be sure that the relevant app settings are in the right state to start
      cy.request("PUT", "api/setting/show-homepage-data", { value: true });
    });
    it('should be possible for an admin to hide the "Our data" section', () => {
      cy.server();
      cy.route("PUT", "**/show-homepage-data").as("hideData");
      cy.visit("/");
      cy.contains("Sample Dataset");
      cy.contains("Our data")
        .parent()
        .get(".Icon-close")
        .click();
      cy.get(".Button").click();
      cy.wait("@hideData");
      cy.contains("Sample Dataset").should("have.length", 0);
    });
  });
});
