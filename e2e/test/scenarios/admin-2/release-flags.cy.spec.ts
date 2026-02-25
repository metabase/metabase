const { H } = cy;

describe("Admin - Release Flags", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/session/properties").as("getSessionProperties");
  });

  it("should display the release flags page only for admins", () => {
    cy.visit("/release-flags");
    cy.findByTestId("release-flags-page").contains("Release Flags");

    cy.findByTestId("release-flags-page").contains("joke-of-the-day");

    cy.signInAsNormalUser();
    cy.visit("/release-flags");
    cy.wait("@getSessionProperties");
    cy.get("main").findByText("Sorry, you don’t have permission to see that.");

    H.setReleaseFlag("joke-of-the-day", true).then(({ status }) => {
      // normal users should not be able to toggle release flags by api
      expect(status).to.equal(403);
    });
  });

  it("should allow toggling a release flag", () => {
    cy.visit("/");
    cy.wait("@getSessionProperties");
    cy.findByTestId("home-page").should("be.visible");
    cy.findByTestId("joke-of-the-day").should("not.exist");
    cy.request({
      method: "GET",
      url: "/api/joke-of-the-day",
      failOnStatusCode: false,
    }).then(({ status }) => {
      expect(status).to.equal(404);
    });

    H.setReleaseFlag("joke-of-the-day", true);
    cy.visit("/");
    cy.wait("@getSessionProperties");
    cy.findByTestId("home-page").should("be.visible");
    cy.findByTestId("joke-of-the-day").should("be.visible");
    cy.request({
      method: "GET",
      url: "/api/joke-of-the-day",
      failOnStatusCode: false,
    }).then(({ status }) => {
      expect(status).to.equal(200);
    });
  });
});
