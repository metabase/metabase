import { H } from "e2e/support";

import { commandPaletteInput } from "../../../support/helpers/e2e-command-palette-helpers";

H.describeWithSnowplow("scenarios > search > snowplow", () => {
  const NEW_SEARCH_QUERY_EVENT_NAME = "search_query";
  const SEARCH_CLICK = "search_click";

  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.enableTracking();
    cy.intercept("GET", "/api/search**").as("search");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("command palette", () => {
    it("should send snowplow events search queries on a click", () => {
      cy.visit("/");
      H.commandPaletteSearch("Orders", false);

      //Passing a function to ensure that runtime_milliseconds is populated as a number
      H.expectGoodSnowplowEvent(data => {
        if (!data) {
          return false;
        }
        return (
          data.event === NEW_SEARCH_QUERY_EVENT_NAME &&
          data.context === "command-palette" &&
          typeof data.runtime_milliseconds === "number"
        );
      });

      H.commandPalette().findByRole("option", { name: "Orders Model" }).click();
      H.expectGoodSnowplowEvent(
        {
          event: SEARCH_CLICK,
          context: "command-palette",
          position: 2,
        },
        1,
      );
    });

    it("should send snowplow events search queries on keyboard navigation", () => {
      cy.visit("/");
      H.commandPaletteSearch("Orders", false);

      //Passing a function to ensure that runtime_milliseconds is populated as a number
      H.expectGoodSnowplowEvent(data => {
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

      H.expectGoodSnowplowEvent(
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
      H.popover().findByText("Dashboard").click();
      H.modal().findByTestId("collection-picker-button").click();

      H.entityPickerModal().findByPlaceholderText("Search…").type("second");

      H.expectGoodSnowplowEvent({
        event: NEW_SEARCH_QUERY_EVENT_NAME,
        context: "entity-picker",
        content_type: ["collection"],
      });

      H.entityPickerModal()
        .findByRole("button", { name: /Second/ })
        .click();

      H.expectGoodSnowplowEvent({
        event: SEARCH_CLICK,
        context: "entity-picker",
        position: 0,
      });
    });
  });

  describe("search bar - embedding only", () => {
    it("should send snowplow events search queries", () => {
      H.visitFullAppEmbeddingUrl({
        url: "/",
        qs: { top_nav: true, search: true },
      });
      cy.findByPlaceholderText("Search…").type("coun");
      cy.findByTestId("loading-indicator").should("not.exist");

      H.expectGoodSnowplowEvent({
        event: NEW_SEARCH_QUERY_EVENT_NAME,
        context: "search-bar",
      });

      cy.findByTestId("search-bar-results-container")
        .findByRole("heading", { name: "PEOPLE" })
        .click();

      H.expectGoodSnowplowEvent({
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
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
        });

        cy.findByRole("heading", { name: "Orders in a dashboard" }).click();
        H.expectGoodSnowplowEvent({
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

        H.expectGoodSnowplowEvent(
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
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
        });

        cy.findByTestId("type-search-filter").click();
        H.popover().within(() => {
          cy.findAllByTestId("type-filter-checkbox").each($el => {
            cy.wrap($el).click();
          });
          cy.findByText("Apply").click();
        });

        H.expectGoodSnowplowEvent({
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
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          content_type: ["card"],
        });

        cy.findByTestId("type-search-filter")
          .findByLabelText("close icon")
          .click();

        H.expectGoodSnowplowEvent({
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
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creator: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          creator: false,
        });

        cy.findByTestId("created_by-search-filter").click();
        H.popover().within(() => {
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });

        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creator: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&created_by=1");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creator: true,
        });

        cy.findByTestId("created_by-search-filter")
          .findByLabelText("close icon")
          .click();

        H.expectGoodSnowplowEvent({
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
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_editor: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_editor: false,
        });

        cy.findByTestId("last_edited_by-search-filter").click();
        H.popover().within(() => {
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });

        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_editor: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&last_edited_by=1");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_editor: true,
        });

        cy.findByTestId("last_edited_by-search-filter")
          .findByLabelText("close icon")
          .click();

        H.expectGoodSnowplowEvent({
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
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creation_date: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creation_date: false,
        });

        cy.findByTestId("created_at-search-filter").click();
        H.popover().within(() => {
          cy.findByText("Today").click();
        });

        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creation_date: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&created_at=thisday");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          creation_date: true,
        });

        cy.findByTestId("created_at-search-filter")
          .findByLabelText("close icon")
          .click();

        H.expectGoodSnowplowEvent({
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
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_edit_date: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_edit_date: false,
        });

        cy.findByTestId("last_edited_at-search-filter").click();
        H.popover().within(() => {
          cy.findByText("Today").click();
        });

        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_edit_date: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&last_edited_at=thisday");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_edit_date: true,
        });

        cy.findByTestId("last_edited_at-search-filter")
          .findByLabelText("close icon")
          .click();

        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          last_edit_date: false,
        });
      });
    });

    H.describeEE("verified filter", () => {
      beforeEach(() => {
        H.setTokenFeatures("all");
      });

      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&verified=true");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          verified_items: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          verified_items: false,
        });

        cy.findByTestId("verified-search-filter")
          .findByText("Verified items only")
          .click();

        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          verified_items: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&verified=true");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          verified_items: true,
        });

        cy.findByTestId("verified-search-filter")
          .findByText("Verified items only")
          .click();

        H.expectGoodSnowplowEvent({
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
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_native_queries: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_native_queries: false,
        });

        cy.findByTestId("search_native_query-search-filter")
          .findByText("Search the contents of native queries")
          .click();

        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_native_queries: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&search_native_query=true");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_native_queries: true,
        });

        cy.findByTestId("search_native_query-search-filter")
          .findByText("Search the contents of native queries")
          .click();

        H.expectGoodSnowplowEvent({
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
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_archived: true,
        });
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_archived: false,
        });

        cy.findByTestId("archived-search-filter")
          .findByText("Search items in trash")
          .click();

        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_archived: true,
        });
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&archived=true");
        cy.wait("@search");
        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_archived: true,
        });

        cy.findByTestId("archived-search-filter")
          .findByText("Search items in trash")
          .click();

        H.expectGoodSnowplowEvent({
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",

          search_archived: false,
        });
      });
    });
  });
});
