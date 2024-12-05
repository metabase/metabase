import { H } from "e2e/support";

H.describeWithSnowplow(
  "scenarios > embedding-homepage > snowplow events",
  () => {
    beforeEach(() => {
      H.restore("default");
      H.resetSnowplow();

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
      H.expectNoBadSnowplowEvents();
    });

    it("clicking on the quickstart button should send the 'embedding_homepage_quickstart_click' event", () => {
      cy.visit("/");
      H.main().findByText("Interactive").click();

      H.main()
        .findByText("Build it with the quick start")
        // we don't want to actually visit the page and spam the analytics of the website
        .closest("a")
        .invoke("removeAttr", "href")
        .click();

      H.expectGoodSnowplowEvent({
        event: "embedding_homepage_quickstart_click",
        initial_tab: H.isEE ? "interactive" : "static",
      });

      // check that we didn't actually navigate to the page
      cy.url().should("eq", Cypress.config().baseUrl + "/");
    });

    it("opening the example dashboard from the button should send the 'embedding_homepage_example_dashboard_click' event", () => {
      cy.visit("/");

      H.main().findByText("Static").click();

      // the example-dashboard-id is mocked, it's normal that we'll get to a permision error page
      H.main().findByText("Embed this example dashboard").click();

      H.expectGoodSnowplowEvent({
        event: "embedding_homepage_example_dashboard_click",
        initial_tab: H.isEE ? "interactive" : "static",
      });
    });

    it("dismissing the homepage should send the 'embedding_homepage_dismissed' event", () => {
      cy.visit("/");

      H.main().findByText("Hide these").click();
      H.popover().findByText("Embedding done, all good").click();

      H.expectGoodSnowplowEvent({
        event: "embedding_homepage_dismissed",
        dismiss_reason: "dismissed-done",
      });
    });
  },
);
