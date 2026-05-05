import { restore } from "e2e/support/helpers";

describe("internal analytics", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should POST batched internal analytics events to the backend", () => {
    cy.intercept("POST", "/api/analytics/internal").as("internalAnalytics");

    cy.visit("/");

    cy.window().then((win: any) => {
      // Send more than flush-buffer-size (50) events to trigger an immediate flush.
      // See metabase.analytics.impl/flush-buffer-size.
      for (let i = 0; i < 51; i++) {
        win.__internalAnalytics.inc("e2e-test/counter", { test: "true" }, 1);
      }
    });

    cy.wait("@internalAnalytics").then((interception) => {
      expect(interception.response?.statusCode).to.equal(204);
      expect(interception.request.body.events).to.be.an("array");
      expect(interception.request.body.events.length).to.be.greaterThan(0);
      expect(interception.request.body.events[0]).to.have.property("op");
      expect(interception.request.body.events[0]).to.have.property("metric");
    });
  });
});
