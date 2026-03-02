const { H } = cy;

describe("Admin - Release Flags", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/session/properties").as("getSessionProperties");
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
