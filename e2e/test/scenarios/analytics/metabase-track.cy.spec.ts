const { H } = cy;

describe("scenarios > analytics > Metabase Track", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
    H.resetMetaplow();
  });

  it("delivers a browser-originated event to the collector", () => {
    cy.visit("/");
    cy.findByTestId("home-page").should("be.visible");

    H.expectMetaplowRequest({
      path: "/api/send",
      body: {
        type: "event",
        payload: {
          name: "pageview",
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
        name: "dashboard.dashboard_created",
        hostname: "anonymous.metabase.com",
        tag: "metabase-instance",
        data: { dashboard_id: body.id },
      });
    });
  });
});
