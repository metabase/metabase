import {
  commandPaletteSearch,
  describeEE,
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  popover,
  resetSnowplow,
  restore,
  setTokenFeatures,
} from "e2e/support/helpers";

describeWithSnowplow("scenarios > search > snowplow", () => {
  const SEARCH_RESULTS_FILTERED_NAME = "search_results_filtered";
  const NEW_SEARCH_QUERY_EVENT_NAME = "new_search_query";

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

  it("should send snowplow events for global search queries", () => {
    cy.visit("/");
    commandPaletteSearch("Orders", false);
    expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
  });

  describe("should send snowplow events for each filter when it is applied and removed", () => {
    describe("no filters", () => {
      it("should send a new_search_query snowplow event, but not search_results_filtered when a search with no filters is accessed from the URL", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);
      });
    });

    describe("type filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&type=card");
        cy.wait("@search");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("type-search-filter").click();
        popover().within(() => {
          cy.findAllByTestId("type-filter-checkbox").each($el => {
            cy.wrap($el).click();
          });
          cy.findByText("Apply").click();
        });

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&type=card");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("type-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });

    describe("created_by filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&created_by=1");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("created_by-search-filter").click();
        popover().within(() => {
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&created_by=1");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("created_by-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });

    describe("last_edited_by filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&last_edited_by=1");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("last_edited_by-search-filter").click();
        popover().within(() => {
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&last_edited_by=1");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("last_edited_by-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });

    describe("created_at filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&created_at=thisday");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("created_at-search-filter").click();
        popover().within(() => {
          cy.findByText("Today").click();
        });

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&created_at=thisday");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("created_at-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });

    describe("last_edited_at filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&last_edited_at=thisday");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("last_edited_at-search-filter").click();
        popover().within(() => {
          cy.findByText("Today").click();
        });

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&last_edited_at=thisday");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("last_edited_at-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });

    describeEE("verified filter", () => {
      beforeEach(() => {
        setTokenFeatures("all");
      });

      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&verified=true");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("verified-search-filter")
          .findByText("Verified items only")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&verified=true");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("verified-search-filter")
          .findByText("Verified items only")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });

    describe("search_native_query filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&search_native_query=true");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("search_native_query-search-filter")
          .findByText("Search the contents of native queries")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&search_native_query=true");
        cy.wait("@search");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("search_native_query-search-filter")
          .findByText("Search the contents of native queries")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });
  });
});
