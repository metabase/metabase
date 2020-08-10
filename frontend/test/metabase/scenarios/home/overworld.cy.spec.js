import {
  signInAsAdmin,
  signInAsNormalUser,
  restore,
} from "__support__/cypress";

describe("scenarios > home > overworld", () => {
  before(restore);

  describe("content management", () => {
    describe("as admin", () => {
      beforeEach(() => {
        signInAsAdmin();
        cy.request("PUT", "api/setting/show-homepage-data", { value: true });
        cy.request("PUT", "api/setting/show-homepage-xrays", { value: true });
      });
      afterEach(() => {
        cy.request("PUT", "api/setting/show-homepage-data", { value: true });
        cy.request("PUT", "api/setting/show-homepage-xrays", { value: true });
      });
      it('should be possible for an admin to hide the "Our data" section', () => {
        cy.server();
        cy.route("PUT", "**/show-homepage-data").as("hideData");
        cy.visit("/");
        cy.contains("Sample Dataset");
        cy.contains("Our data")
          .find(".Icon-close")
          .click({ force: true });
        cy.get(".Button--danger").click();
        cy.wait("@hideData");
        cy.contains("Sample Dataset").should("have.length", 0);
        // cleanup
      });
      it('should be possible for an admin to hide the "xrays" section', () => {
        cy.server();
        cy.route("PUT", "**/show-homepage-xrays").as("hideXrays");
        cy.visit("/");
        cy.contains("based on")
          .find(".Icon-close")
          .click({ force: true });
        cy.get(".Button--danger").click();
        cy.wait("@hideXrays");
      });
    });
    describe("as regular folk", () => {
      beforeEach(signInAsNormalUser);
      it("should not be possible for them to see the controls", () => {
        cy.visit("/");
        cy.contains("Our data")
          .find(".Icon-close")
          .should("have.length", 0);
        cy.contains("x-ray")
          .find(".Icon-close")
          .should("have.length", 0);
      });
    });
  });
});
