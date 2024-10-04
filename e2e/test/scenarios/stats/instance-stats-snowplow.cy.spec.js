import {
  describeEE,
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  restore,
} from "e2e/support/helpers";

describeWithSnowplow("scenarios > stats > snowplow", () => {
  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
    enableTracking();
  });

  describe("instance stats", () => {
    it("should send a snowplow event when the stats ping is triggered on OSS", () => {
      cy.request("POST", "api/testing/stats");
      expectGoodSnowplowEvent();
    });
  });

  describeEE("instance stats", () => {
    it("should send a snowplow event when the stats ping is triggered on EE", () => {
      cy.request("POST", "api/testing/stats");
      expectGoodSnowplowEvent();
    });
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });
});
