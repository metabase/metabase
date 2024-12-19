import { H } from "e2e/support";

H.describeWithSnowplow("scenarios > stats > snowplow", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  H.describeWithSnowplow("instance stats", () => {
    it("should send a snowplow event when the stats ping is triggered on OSS", () => {
      cy.request("POST", "api/testing/stats");
      H.expectGoodSnowplowEvents(1);
    });
  });

  H.describeWithSnowplowEE("instance stats", () => {
    it("should send a snowplow event when the stats ping is triggered on EE", () => {
      cy.request("POST", "api/testing/stats");
      H.expectGoodSnowplowEvents(1);
    });
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });
});
