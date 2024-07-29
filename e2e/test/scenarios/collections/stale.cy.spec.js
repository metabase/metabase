import {
  resetSnowplow,
  describeWithSnowplowEE,
  setTokenFeatures,
  enableTracking,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  restore,
} from "e2e/support/helpers";

describeWithSnowplowEE("Can get stale items", () => {
  beforeEach(() => {
    resetSnowplow();
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    enableTracking();
  });
  it("should emit a snowplow event when we get stale items", () => {
    cy.request("GET", "/api/collection/root/stale").then(xhr => {
      expectGoodSnowplowEvent({ event: "stale_items_read" });
    });
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });
});
