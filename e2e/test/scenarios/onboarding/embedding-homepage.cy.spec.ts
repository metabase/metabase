import {
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  isEE,
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
        res.body["setup-embedding-autoenabled"] = true;
        res.body["example-dashboard-id"] = 1;
        res.body["setup-license-active-at-setup"] = true;
        res.send();
      });
    });
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("clicking on the quickstart button should send the 'embedding_homepage_quickstart_click' event", () => {
    cy.visit("/");
    main().findByText("Interactive").click();

    main()
      .findByText("Build it with the quick start")
      // we don't want to actually visit the page and spam the analytics of the website
      .closest("a")
      .invoke("removeAttr", "href")
      .click();

    expectGoodSnowplowEvent({
      event: "embedding_homepage_quickstart_click",
      initial_tab: isEE ? "interactive" : "static",
    });

    // check that we didn't actually navigate to the page
    cy.url().should("eq", Cypress.config().baseUrl + "/");
  });

  it("opening the example dashboard from the button should send the 'embedding_homepage_example_dashboard_click' event", () => {
    cy.visit("/");

    main().findByText("Static").click();

    // the example-dashboard-id is mocked, it's normal that we'll get to a permision error page
    main().findByText("Embed this example dashboard").click();

    expectGoodSnowplowEvent({
      event: "embedding_homepage_example_dashboard_click",
      initial_tab: isEE ? "interactive" : "static",
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
