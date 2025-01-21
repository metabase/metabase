import { commandPaletteInput } from "../../../support/helpers/e2e-command-palette-helpers";

cy.describeWithSnowplow("scenarios > search > snowplow", () => {
  const NEW_SEARCH_QUERY_EVENT_NAME = "search_query";
  const SEARCH_CLICK = "search_click";

  beforeEach(() => {
    cy.restore();
    cy.resetSnowplow();
    cy.signInAsAdmin();
    cy.enableTracking();
    cy.intercept("GET", "/api/search**").as("search");
  });

  afterEach(() => {
    cy.expectNoBadSnowplowEvents();
  });

  describe("command palette", () => {
    it("should send snowplow events search queries on a click", () => {
      cy.visit("/");
      cy.commandPaletteSearch("Orders", false);

      //Passing a function to ensure that runtime_milliseconds is populated as a number
      cy.expectGoodSnowplowEvent(data => {
        if (!data) {
          return false;
        }
        return (
          data.event === NEW_SEARCH_QUERY_EVENT_NAME &&
          data.context === "command-palette" &&
          typeof data.runtime_milliseconds === "number"
        );
      });

      cy.commandPalette()
        .findByRole("option", { name: "Orders Model" })
        .click();
      cy.expectGoodSnowplowEvent(
        {
          event: SEARCH_CLICK,
          context: "command-palette",
          position: 3,
        },
        1,
      );
    });

    it("should send snowplow events search queries on keyboard navigation", () => {
      cy.visit("/");
      cy.commandPaletteSearch("Orders", false);

      //Passing a function to ensure that runtime_milliseconds is populated as a number
      cy.expectGoodSnowplowEvent(data => {
        if (!data) {
          return false;
        }
        return (
          data.event === NEW_SEARCH_QUERY_EVENT_NAME &&
          data.context === "command-palette" &&
          typeof data.runtime_milliseconds === "number"
        );
      });

      // FIX ME: We need to slow cypress down before we start inputting keyboard events.
      // Not clear why though :/.
      cy.wait(500);
      commandPaletteInput().type("{downArrow}{downArrow}{enter}", {
        delay: 200,
      });

      cy.expectGoodSnowplowEvent(
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
      cy.popover().findByText("Dashboard").click();
      cy.modal().findByTestId("collection-picker-button").click();

      cy.entityPickerModal().findByPlaceholderText("Search…").type("second");

      cy.expectGoodSnowplowEvent({
        event: NEW_SEARCH_QUERY_EVENT_NAME,
        context: "entity-picker",
        content_type: ["collection"],
      });

      cy.entityPickerModal()
        .findByRole("button", { name: /Second/ })
        .click();

      cy.expectGoodSnowplowEvent({
        event: SEARCH_CLICK,
        context: "entity-picker",
        position: 0,
      });
    });
  });

  describe("search bar - embedding only", () => {
    it("should send snowplow events search queries", () => {
      cy.visitFullAppEmbeddingUrl({
        url: "/",
        qs: { top_nav: true, search: true },
      });
      cy.findByPlaceholderText("Search…").type("coun");
      cy.findByTestId("loading-indicator").should("not.exist");

      cy.expectGoodSnowplowEvent({
        event: NEW_SEARCH_QUERY_EVENT_NAME,
        context: "search-bar",
      });

      cy.findByTestId("search-bar-results-container")
        .findByRole("heading", { name: "People" })
        .click();

      cy.expectGoodSnowplowEvent({
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
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
        });

        cy.findByRole("heading", { name: "Orders in a dashboard" }).click();
        cy.expectGoodSnowplowEvent({
          event: SEARCH_CLICK,
          context: "search-app",
          position: 0,
        });
      });
    });

    describe("type filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&type=card");
        cy.wait("@search");

        cy.expectGoodSnowplowEvent(
          {
            event: NEW_SEARCH_QUERY_EVENT_NAME,

            context: "search-app",
            content_type: ["card"],
          },
          1,
        );
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
        });

        cy.findByTestId("type-search-filter").click();
        cy.popover().within(() => {
          cy.findAllByTestId("type-filter-checkbox").each($el => {
            cy.wrap($el).click();
          });
          cy.findByText("Apply").click();
        });

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,

          context: "search-app",

          content_type: [
            "dashboard",
            "card",
            "dataset",
            "collection",
            "database",
            "table",
          ],
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&type=card");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          content_type: ["card"],
        });

        cy.findByTestId("type-search-filter")
          .findByLabelText("close icon")
          .click();

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          content_type: [],
        });
      });
    });

    describe("created_by filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&created_by=1");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creator: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          creator: false,
        });

        cy.findByTestId("created_by-search-filter").click();
        cy.popover().within(() => {
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creator: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&created_by=1");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creator: true,
        });

        cy.findByTestId("created_by-search-filter")
          .findByLabelText("close icon")
          .click();

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creator: false,
        });
      });
    });

    describe("last_edited_by filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&last_edited_by=1");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_editor: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_editor: false,
        });

        cy.findByTestId("last_edited_by-search-filter").click();
        cy.popover().within(() => {
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_editor: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&last_edited_by=1");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_editor: true,
        });

        cy.findByTestId("last_edited_by-search-filter")
          .findByLabelText("close icon")
          .click();

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_editor: false,
        });
      });
    });

    describe("created_at filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&created_at=thisday");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creation_date: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creation_date: false,
        });

        cy.findByTestId("created_at-search-filter").click();
        cy.popover().within(() => {
          cy.findByText("Today").click();
        });

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creation_date: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&created_at=thisday");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creation_date: true,
        });

        cy.findByTestId("created_at-search-filter")
          .findByLabelText("close icon")
          .click();

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creation_date: false,
        });
      });
    });

    describe("last_edited_at filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&last_edited_at=thisday");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_edit_date: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_edit_date: false,
        });

        cy.findByTestId("last_edited_at-search-filter").click();
        cy.popover().within(() => {
          cy.findByText("Today").click();
        });

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_edit_date: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&last_edited_at=thisday");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_edit_date: true,
        });

        cy.findByTestId("last_edited_at-search-filter")
          .findByLabelText("close icon")
          .click();

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_edit_date: false,
        });
      });
    });

    cy.describeEE("verified filter", () => {
      beforeEach(() => {
        cy.setTokenFeatures("all");
      });

      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&verified=true");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          verified_items: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          verified_items: false,
        });

        cy.findByTestId("verified-search-filter")
          .findByText("Verified items only")
          .click();

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          verified_items: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&verified=true");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          verified_items: true,
        });

        cy.findByTestId("verified-search-filter")
          .findByText("Verified items only")
          .click();

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          verified_items: false,
        });
      });
    });

    describe("search_native_query filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&search_native_query=true");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_native_queries: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_native_queries: false,
        });

        cy.findByTestId("search_native_query-search-filter")
          .findByText("Search the contents of native queries")
          .click();

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_native_queries: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&search_native_query=true");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_native_queries: true,
        });

        cy.findByTestId("search_native_query-search-filter")
          .findByText("Search the contents of native queries")
          .click();

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_native_queries: false,
        });
      });
    });

    describe("archived filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&archived=true");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_archived: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_archived: false,
        });

        cy.findByTestId("archived-search-filter")
          .findByText("Search items in trash")
          .click();

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_archived: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&archived=true");
        cy.wait("@search");
        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_archived: true,
        });

        cy.findByTestId("archived-search-filter")
          .findByText("Search items in trash")
          .click();

        cy.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_archived: false,
        });
      });
    });
  });
});
