import {
  commandPalette,
  commandPaletteSearch,
  describeEE,
  describeWithSnowplow,
  enableTracking,
  entityPickerModal,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  modal,
  popover,
  resetSnowplow,
  restore,
  setTokenFeatures,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";

describeWithSnowplow("scenarios > search > snowplow", () => {
  const NEW_SEARCH_QUERY_EVENT_NAME = "new_search_query";
  const SEARCH_CLICK = "search_click";

  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
    enableTracking();
    cy.intercept("GET", "/api/search**").as("search");
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  describe("command palette", () => {
    it("should send snowplow events search queries", () => {
      cy.visit("/");
      commandPaletteSearch("Orders", false);
      expectGoodSnowplowEvent(
        {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "command-palette",
          filters: { q: "Orders" },
        },
        1,
      );

      commandPalette().findByRole("option", { name: "Orders Model" }).click();
      expectGoodSnowplowEvent(
        {
          event: SEARCH_CLICK,
          context: "command-palette",
          position: 2,
        },
        1,
      );
    });
  });

  describe("entity picker", () => {
    it("should send snowplow events search queries", () => {
      cy.visit("/");
      cy.button("New").click();
      popover().findByText("Dashboard").click();
      modal().findByTestId("collection-picker-button").click();

      entityPickerModal().findByPlaceholderText("Search…").type("second");

      expectGoodSnowplowEvent({
        event: NEW_SEARCH_QUERY_EVENT_NAME,
        context: "entity-picker",
        filters: { q: "second", models: ["collection"] },
      });

      entityPickerModal()
        .findByRole("button", { name: /Second/ })
        .click();

      expectGoodSnowplowEvent({
        event: SEARCH_CLICK,
        context: "entity-picker",
        position: 0,
      });
    });
  });

  describe("search bar - embedding only", () => {
    it("should send snowplow events search queries", () => {
      visitFullAppEmbeddingUrl({
        url: "/",
        qs: { top_nav: true, search: true },
      });
      cy.findByPlaceholderText("Search…").type("coun");
      cy.findByTestId("loading-spinner").should("not.exist");

      expectGoodSnowplowEvent({
        event: NEW_SEARCH_QUERY_EVENT_NAME,
        context: "search-bar",
        filters: { q: "coun" },
      });

      cy.findByTestId("search-bar-results-container")
        .findByRole("heading", { name: "PEOPLE" })
        .click();

      expectGoodSnowplowEvent({
        event: SEARCH_CLICK,
        context: "search-bar",
        position: 2,
      });
    });
  });

  describe("should send snowplow events for each filter when it is applied and removed", () => {
    describe("no filters", () => {
      it("should send a new_search_query snowplow event", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: { q: "orders" },
        });

        cy.findByRole("heading", { name: "Orders in a dashboard" }).click();
        expectGoodSnowplowEvent({
          event: SEARCH_CLICK,
          context: "search-app",
          position: 3,
        });
      });
    });

    describe("type filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&type=card");
        cy.wait("@search");

        expectGoodSnowplowEvent(
          {
            event: NEW_SEARCH_QUERY_EVENT_NAME,

            context: "search-app",
            filters: { q: "orders", models: ["card"] },
          },
          1,
        );
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          filters: { q: "orders" },
          context: "search-app",
        });

        cy.findByTestId("type-search-filter").click();
        popover().within(() => {
          cy.findAllByTestId("type-filter-checkbox").each($el => {
            cy.wrap($el).click();
          });
          cy.findByText("Apply").click();
        });

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,

          context: "search-app",
          filters: {
            models: [
              "dashboard",
              "card",
              "dataset",
              "collection",
              "database",
              "table",
            ],
            q: "orders",
          },
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&type=card");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            models: ["card"],
          },
        });

        cy.findByTestId("type-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            models: [],
          },
        });
      });
    });

    describe("created_by filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&created_by=1");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            created_by: "1",
          },
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
          },
        });

        cy.findByTestId("created_by-search-filter").click();
        popover().within(() => {
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            created_by: "1",
          },
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&created_by=1");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            created_by: "1",
          },
        });

        cy.findByTestId("created_by-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            created_by: undefined,
          },
        });
      });
    });

    describe("last_edited_by filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&last_edited_by=1");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            last_edited_by: "1",
          },
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
          },
        });

        cy.findByTestId("last_edited_by-search-filter").click();
        popover().within(() => {
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            last_edited_by: "1",
          },
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&last_edited_by=1");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            last_edited_by: "1",
          },
        });

        cy.findByTestId("last_edited_by-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            last_edited_by: undefined,
          },
        });
      });
    });

    describe("created_at filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&created_at=thisday");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            created_at: "thisday",
          },
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
          },
        });

        cy.findByTestId("created_at-search-filter").click();
        popover().within(() => {
          cy.findByText("Today").click();
        });

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            created_at: "thisday",
          },
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&created_at=thisday");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            created_at: "thisday",
          },
        });

        cy.findByTestId("created_at-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            created_at: undefined,
          },
        });
      });
    });

    describe("last_edited_at filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&last_edited_at=thisday");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            last_edited_at: "thisday",
          },
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
          },
        });

        cy.findByTestId("last_edited_at-search-filter").click();
        popover().within(() => {
          cy.findByText("Today").click();
        });

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            last_edited_at: "thisday",
          },
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&last_edited_at=thisday");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            last_edited_at: "thisday",
          },
        });

        cy.findByTestId("last_edited_at-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            last_edited_at: undefined,
          },
        });
      });
    });

    describeEE("verified filter", () => {
      beforeEach(() => {
        setTokenFeatures("all");
      });

      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&verified=true");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            verified: "true",
          },
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
          },
        });

        cy.findByTestId("verified-search-filter")
          .findByText("Verified items only")
          .click();

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            verified: "true",
          },
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&verified=true");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            verified: "true",
          },
        });

        cy.findByTestId("verified-search-filter")
          .findByText("Verified items only")
          .click();

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            verified: undefined,
          },
        });
      });
    });

    describe("search_native_query filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&search_native_query=true");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            search_native_query: "true",
          },
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
          },
        });

        cy.findByTestId("search_native_query-search-filter")
          .findByText("Search the contents of native queries")
          .click();

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            search_native_query: "true",
          },
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&search_native_query=true");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            search_native_query: "true",
          },
        });

        cy.findByTestId("search_native_query-search-filter")
          .findByText("Search the contents of native queries")
          .click();

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            search_native_query: undefined,
          },
        });
      });
    });

    describe("archived filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&archived=true");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            archived: "true",
          },
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
          },
        });

        cy.findByTestId("archived-search-filter")
          .findByText("Search items in trash")
          .click();

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            archived: "true",
          },
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&archived=true");
        cy.wait("@search");
        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            archived: "true",
          },
        });

        cy.findByTestId("archived-search-filter")
          .findByText("Search items in trash")
          .click();

        expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          filters: {
            q: "orders",
            archived: undefined,
          },
        });
      });
    });
  });
});
