const { H } = cy;

/**
 * End-to-end coverage that Metabase Track events actually leave the instance and arrive somewhere.
 *
 * `metaplow/sink.js` stands in for the collector and records what it is posted; `-Dmb.metaplow.url`
 * in the `:e2e` alias points both legs at it. The two legs are tested separately because they are
 * genuinely separate: the browser tracker posts from the page, the backend sender posts from the
 * JVM, and neither one can stand in for the other.
 */
describe("scenarios > analytics > Metabase Track", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // Last, so that whatever the restore and the sign-in emit is cleared rather than recorded.
    H.enableTracking();
    H.resetMetaplow();
  });

  it("delivers a browser-originated event to the collector", () => {
    cy.visit("/");
    cy.findByTestId("home-page").should("be.visible");

    H.expectMetaplowRequest({
      // The setting holds the collector's full `/send` endpoint; the frontend strips that suffix and
      // the tracker library appends it again. Pinning the path proves the round trip survives.
      path: "/api/send",
      body: {
        type: "event",
        payload: {
          name: "pageview",
          // Anonymized before it leaves the browser: no real hostname, no slugs, no real URL.
          url: "http://anonymous.metabase.com/",
          hostname: "anonymous.metabase.com",
          tag: "metabase-instance",
        },
      },
    });
  });

  it("delivers a backend-originated event to the collector", () => {
    H.createDashboard({ name: "Tracked dashboard" }).then(({ body }) => {
      H.expectMetaplowEvent({
        // The backend sends a schema-qualified event name where the browser sends a bare one.
        name: "dashboard.dashboard_created",
        hostname: "anonymous.metabase.com",
        tag: "metabase-instance",
        data: { dashboard_id: body.id },
      });
    });
  });
});
