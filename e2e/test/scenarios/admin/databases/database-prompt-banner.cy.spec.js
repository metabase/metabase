import {
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  restore,
} from "e2e/support/helpers";

describe("banner", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show a database prompt banner when logged in as an admin, an instance is on a paid plan, and only have a single sample dataset", () => {
    cy.visit("/");
    cy.findByRole("main").findByText("Loading...").should("not.exist");

    cy.findAllByRole("banner")
      .first()
      .within(() => {
        cy.findByText(
          "Connect to your database to get the most from Metabase.",
        ).should("exist");

        cy.findByRole("link", { name: "Get help connecting" })
          .should("have.attr", "href")
          .and("eq", "https://metabase.com/help/connect");

        cy.findByRole("link", { name: "Connect your database" }).click();
        cy.url().should("include", "/admin/databases/create");
      });

    // Assert that database form is rendered
    cy.findByRole("main").within(() => {
      cy.findByText("Add Database").should("exist");
      cy.findByLabelText("Database type").should("exist");
      cy.findByLabelText("Database name").should("exist");
    });
  });

  it("should not show a database prompt banner when logged in as an admin, an instance is on a paid plan, and only have a single sample dataset, but is white labeling", () => {
    cy.request("PUT", "/api/setting/application-name", { value: "Acme Corp." });
    cy.visit("/");
    cy.findByRole("main").findByText("Loading...").should("not.exist");

    cy.findAllByRole("banner")
      .first()
      .within(() => {
        cy.findByText(
          "Connect to your database to get the most from Metabase.",
        ).should("not.exist");
      });
  });
});

describeWithSnowplow(
  "should send snowplow events when clicking on links in the database prompt banner",
  () => {
    const PAGE_VIEW_EVENT = 1;

    beforeEach(() => {
      restore();
      resetSnowplow();
      cy.signInAsAdmin();
      enableTracking();
      cy.visit("/");
      cy.findByRole("main").findByText("Loading...").should("not.exist");
    });

    afterEach(() => {
      expectNoBadSnowplowEvents();
    });

    it("should send snowplow events when disabling auto-apply filters", () => {
      expectNoBadSnowplowEvents();
      expectGoodSnowplowEvents(PAGE_VIEW_EVENT);
      cy.findAllByRole("banner")
        .first()
        .within(() => {
          cy.findByRole("link", { name: "Get help connecting" }).click();
          expectGoodSnowplowEvents(PAGE_VIEW_EVENT + 1);

          cy.findByRole("link", { name: "Connect your database" }).click();
          // clicking this link also brings us to the admin page causing a new page_view event
          expectGoodSnowplowEvents(2 * PAGE_VIEW_EVENT + 2);
        });
    });
  },
);
