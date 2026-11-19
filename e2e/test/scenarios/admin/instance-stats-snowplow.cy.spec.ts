const { H } = cy;

function triggerStatsPingAndExpectEvent() {
  cy.request("POST", "api/testing/stats");
  H.expectSnowplowEvent({
    event: { event_name: "instance_stats" },
  });
}

describe("scenarios > stats > snowplow", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  it(
    "should send a snowplow event when the stats ping is triggered on OSS",
    { tags: "@OSS" },
    triggerStatsPingAndExpectEvent,
  );

  it(
    "should send a snowplow event when the stats ping is triggered on EE",
    triggerStatsPingAndExpectEvent,
  );

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });
});
