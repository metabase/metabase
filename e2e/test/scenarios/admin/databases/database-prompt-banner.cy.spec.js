import {
  appBar,
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  restore,
  rightSidebar,
  visitDashboard,
  describeEE,
  setTokenFeatures,
} from "e2e/support/helpers";

describeEE("database prompt banner", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should show a database prompt banner when logged in as an admin, an instance is on a paid plan, only have a single sample dataset, and is not white labelled", () => {
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

  it("should not show a database prompt banner when logged in as an admin, an instance is on a paid plan, and only have a single sample dataset, but is white labelled", () => {
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

  // Until we enable multi-browser support, this repro will be skipped by Cypress in CI
  // Issue was specific to Firefox only - it is still possible to test it locally
  it(
    "should show info sidebar correctly on Firefox",
    { browser: "firefox" },
    function () {
      visitDashboard(1);
      cy.findByRole("main").findByText("Loading...").should("not.exist");
      cy.findByRole("main").icon("info").click();

      rightSidebar().within(() => {
        cy.findByRole("heading", { name: "About" }).should("be.visible");
        cy.findByRole("heading", { name: "History" }).should("be.visible");
      });
    },
  );

  describe("embeddings", () => {
    // Public and signed embeds are tested in `PublicQuestion.unit.spec.tsx`

    describe("full-app embeddings", () => {
      it("should render database prompt banner when logged in as an admin, an instance is on a paid plan, only have a single sample dataset, and is not white labeling", () => {
        visitFullAppEmbeddingUrl({
          url: "/",
          qs: { side_nav: false, logo: false },
        });

        cy.findByRole("link", { name: "Metabase tips" }).should("exist");

        // Test that we're in full-app embedding since parameters are working.
        appBar().should("not.exist");

        cy.findAllByRole("banner")
          .first()
          .within(() => {
            cy.findByText(
              "Connect to your database to get the most from Metabase.",
            ).should("exist");
          });
      });

      it("should not render for any other condition", () => {
        // Adding a second database should prevent the database prompt
        cy.addSQLiteDatabase();

        visitFullAppEmbeddingUrl({
          url: "/",
          qs: { side_nav: false, logo: false },
        });

        cy.findByRole("link", { name: "Metabase tips" }).should("exist");

        // Test that we're in full-app embedding since parameters are working.
        appBar().should("not.exist");

        // Since there wouldn't be a database prompt banner, we can assert that there is no banner at all
        cy.findAllByRole("banner").should("not.exist");
      });
    });
  });
});

describeWithSnowplow("database prompt banner", () => {
  const PAGE_VIEW_EVENT = 1;

  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    enableTracking();
    cy.visit("/");
    cy.findByRole("main").findByText("Loading...").should("not.exist");
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should send snowplow events when clicking on links in the database prompt banner", () => {
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
});

const visitFullAppEmbeddingUrl = ({ url, qs }) => {
  cy.visit({
    url,
    qs,
    onBeforeLoad(window) {
      // cypress runs all tests in an iframe and the app uses this property to avoid embedding mode for all tests
      // by removing the property the app would work in embedding mode
      window.Cypress = undefined;
    },
  });
};
