cy.describeWithSnowplow("scenarios > stats > snowplow", () => {
  beforeEach(() => {
    cy.restore();
    cy.resetSnowplow();
    cy.signInAsAdmin();
    cy.enableTracking();
  });

  it(
    "should send a snowplow event when the stats ping is triggered on OSS",
    { tags: "@OSS" },
    () => {
      cy.request("POST", "api/testing/stats");
      cy.expectGoodSnowplowEvents(1);
    },
  );

  it("should send a snowplow event when the stats ping is triggered on EE", () => {
    cy.request("POST", "api/testing/stats");
    cy.expectGoodSnowplowEvents(1);
  });

  afterEach(() => {
    cy.expectNoBadSnowplowEvents();
  });
});
