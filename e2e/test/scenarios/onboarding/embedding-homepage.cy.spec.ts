const { H } = cy;

describe("scenarios > embedding-homepage > snowplow events", () => {
  beforeEach(() => {
    H.restore("default");
    H.resetSnowplow();

    cy.signInAsAdmin();
    cy.intercept("GET", "/api/session/properties", (req) => {
      req.continue((res) => {
        res.body["embedding-homepage"] = "visible";
        res.body["example-dashboard-id"] = 1;
        res.body["setup-license-active-at-setup"] = true;
        res.send();
      });
    });
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("opening the example dashboard from the button should send the 'embedding_homepage_example_dashboard_click' event", () => {
    cy.visit("/");

    // the example-dashboard-id is mocked, it's normal that we'll get to a permision error page
    H.main().findByText("Embed an example dashboard").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embedding_homepage_example_dashboard_click",
    });
  });

  it("dismissing the homepage should send the 'embedding_homepage_dismissed' event", () => {
    cy.visit("/");

    H.main().findByText("Hide these").click();
    H.popover().findByText("Embedding done, all good").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embedding_homepage_dismissed",
      dismiss_reason: "dismissed-done",
    });
  });
});
