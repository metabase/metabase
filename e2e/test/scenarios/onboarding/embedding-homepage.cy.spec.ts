import {
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  main,
  popover,
  resetSnowplow,
  restore,
} from "e2e/support/helpers";

describeWithSnowplow("scenarios > embedding-homepage > snowplow events", () => {
  beforeEach(() => {
    restore("default");
    resetSnowplow();

    cy.signInAsAdmin();
    cy.intercept("GET", "/api/session/properties", req => {
      req.continue(res => {
        res.body["embedding-homepage"] = "visible";
        res.body["example-dashboard-id"] = 1;
        res.body["setup-license-active-at-setup"] = true;
        res.send();
      });
    });
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("opening the example dashboard from the button should send the 'embedding_homepage_example_dashboard_click' event", () => {
    cy.visit("/");

    // the example-dashboard-id is mocked, it's normal that we'll get to a permision error page
    main().findByText("Embed an example dashboard").click();

    expectGoodSnowplowEvent({
      event: "embedding_homepage_example_dashboard_click",
    });
  });

  it("dismissing the homepage should send the 'embedding_homepage_dismissed' event", () => {
    cy.visit("/");

    main().findByText("Hide these").click();
    popover().findByText("Embedding done, all good").click();

    expectGoodSnowplowEvent({
      event: "embedding_homepage_dismissed",
      dismiss_reason: "dismissed-done",
    });
  });
});
