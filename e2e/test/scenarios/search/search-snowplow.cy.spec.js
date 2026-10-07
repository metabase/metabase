import { P, isMatching } from "ts-pattern";

const { H } = cy;

import { commandPaletteInput } from "../../../support/helpers/e2e-command-palette-helpers";

describe("scenarios > search > snowplow", () => {
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
      H.expectUnstructuredSnowplowEvent((event) =>
        isMatching(
          {
            event: NEW_SEARCH_QUERY_EVENT_NAME,
            context: "command-palette",
            runtime_milliseconds: P.number,
            search_engine: P.string,
            request_id: P.string,
            offset: null,
            search_term_hash: P.string,
            search_term: null,
          },
          event,
        ),
      );

      H.commandPalette().findByRole("option", { name: "Orders Model" }).click();
      H.expectUnstructuredSnowplowEvent(
        (event) =>
          isMatching(
            {
              event: SEARCH_CLICK,
              target_type: "item",
              context: "command-palette",
              position: 3,
              search_engine: P.string,
              request_id: P.string,
              entity_model: P.string,
              entity_id: P.number,
              search_term_hash: P.string,
              search_term: null,
            },
            event,
          ),
        1,
      );
    });

    it("should send snowplow events search queries on keyboard navigation", () => {
      cy.visit("/");
      H.commandPaletteSearch("Orders", false);

      // Match the full event shape (notably a non-null search_term_hash) so this pins the user's "Orders"
      // search specifically, and stays a count-of-1 even as more search surfaces start emitting events.
      // Passing a function also asserts runtime_milliseconds is a number.
      H.expectUnstructuredSnowplowEvent((event) =>
        isMatching(
          {
            event: NEW_SEARCH_QUERY_EVENT_NAME,
            context: "command-palette",
            runtime_milliseconds: P.number,
            search_engine: P.string,
            request_id: P.string,
            offset: null,
            search_term_hash: P.string,
            // The raw term is redacted to null on every instance except Metabase's own stats instance
            // (shouldReportSearchTerm); the salted search_term_hash above is what identifies the query.
            search_term: null,
          },
          event,
        ),
      );

      // FIX ME: We need to slow cypress down before we start inputting keyboard events.
      // Not clear why though :/.
      cy.wait(500);
      commandPaletteInput().type("{downArrow}{downArrow}{enter}", {
        delay: 200,
      });

      H.expectUnstructuredSnowplowEvent(
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

      H.expectUnstructuredSnowplowEvent({
        event: NEW_SEARCH_QUERY_EVENT_NAME,
        context: "entity-picker",
        content_type: ["collection"],
      });

      H.entityPickerModal()
        .findByRole("link", { name: /Second collection/ })
        .click();

      H.expectUnstructuredSnowplowEvent({
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

      H.expectUnstructuredSnowplowEvent({
        event: NEW_SEARCH_QUERY_EVENT_NAME,
        context: "search-bar",
      });

      cy.findByTestId("search-bar-results-container")
        .findByRole("heading", { name: "People" })
        .click();

      H.expectUnstructuredSnowplowEvent({
        event: SEARCH_CLICK,
        context: "search-bar",
        position: 2,
      });
    });
  });

  describe("should send snowplow events for each filter when it is applied and removed", () => {
    [
      {
        name: "type",
        urlParam: "type=card",
        eventKey: "content_type",
        onValue: [
          "dashboard",
          "card",
          "dataset",
          "collection",
          "database",
          "table",
        ],
        hydratedValue: ["card"],
        offValue: null,
        apply: () => {
          cy.findByTestId("type-search-filter").click();
          H.popover().within(() => {
            cy.findAllByTestId("type-filter-checkbox").each(($el) => {
              cy.wrap($el).click();
            });
            cy.findByText("Apply").click();
          });
        },
      },
      {
        name: "created_by",
        urlParam: "created_by=1",
        eventKey: "creator",
        onValue: true,
        hydratedValue: true,
        offValue: false,
        apply: () => {
          cy.findByTestId("created_by-search-filter").click();
          H.popover().within(() => {
            cy.findByText("Bobby Tables").click();
            cy.findByText("Apply").click();
          });
        },
      },
      {
        name: "last_edited_by",
        urlParam: "last_edited_by=1",
        eventKey: "last_editor",
        onValue: true,
        hydratedValue: true,
        offValue: false,
        apply: () => {
          cy.findByTestId("last_edited_by-search-filter").click();
          H.popover().within(() => {
            cy.findByText("Bobby Tables").click();
            cy.findByText("Apply").click();
          });
        },
      },
      {
        name: "created_at",
        urlParam: "created_at=thisday",
        eventKey: "creation_date",
        onValue: true,
        hydratedValue: true,
        offValue: false,
        apply: () => {
          cy.findByTestId("created_at-search-filter").click();
          H.popover().within(() => {
            cy.findByText("Today").click();
          });
        },
      },
      {
        name: "last_edited_at",
        urlParam: "last_edited_at=thisday",
        eventKey: "last_edit_date",
        onValue: true,
        hydratedValue: true,
        offValue: false,
        apply: () => {
          cy.findByTestId("last_edited_at-search-filter").click();
          H.popover().within(() => {
            cy.findByText("Today").click();
          });
        },
      },
      {
        name: "verified",
        urlParam: "verified=true",
        eventKey: "verified_items",
        onValue: true,
        hydratedValue: true,
        offValue: false,
        toggleLabel: "Verified items only",
        apply: () => {
          cy.findByTestId("verified-search-filter")
            .findByLabelText("Verified items only")
            .click();
        },
      },
      {
        name: "search_native_query",
        urlParam: "search_native_query=true",
        eventKey: "search_native_queries",
        onValue: true,
        hydratedValue: true,
        offValue: false,
        toggleLabel: "Search the contents of native queries",
        apply: () => {
          cy.findByTestId("search_native_query-search-filter")
            .findByLabelText("Search the contents of native queries")
            .click();
        },
      },
      {
        name: "archived",
        urlParam: "archived=true",
        eventKey: "search_archived",
        onValue: true,
        hydratedValue: true,
        offValue: false,
        toggleLabel: "Search items in trash",
        apply: () => {
          cy.findByTestId("archived-search-filter")
            .findByLabelText("Search items in trash")
            .click();
        },
      },
    ].forEach(
      ({
        name,
        urlParam,
        eventKey,
        onValue,
        hydratedValue,
        offValue,
        toggleLabel,
        apply,
      }) => {
        describe(`${name} filter`, () => {
          beforeEach(() => {
            if (name === "verified") {
              H.activateToken("pro-self-hosted");
            }
          });

          it("should send snowplow events when a filter is applied, hydrated from the URL, and removed", () => {
            cy.visit("/search?q=orders");
            cy.wait("@search");
            H.expectUnstructuredSnowplowEvent({
              event: NEW_SEARCH_QUERY_EVENT_NAME,
              context: "search-app",
              ...(name === "type" ? {} : { [eventKey]: offValue }),
            });

            apply();
            H.expectUnstructuredSnowplowEvent({
              event: NEW_SEARCH_QUERY_EVENT_NAME,
              context: "search-app",
              [eventKey]: onValue,
            });
            H.expectNoBadSnowplowEvents();
            H.resetSnowplow();
            cy.intercept("GET", "/api/search**").as("hydratedSearch");
            cy.visit(`/search?q=orders&${urlParam}`);
            cy.wait("@hydratedSearch");
            H.expectUnstructuredSnowplowEvent({
              event: NEW_SEARCH_QUERY_EVENT_NAME,
              context: "search-app",
              [eventKey]: hydratedValue,
            });

            cy.findByTestId(`${name}-search-filter`)
              .findByLabelText(toggleLabel ?? "close icon")
              .click();
            H.expectUnstructuredSnowplowEvent({
              event: NEW_SEARCH_QUERY_EVENT_NAME,
              context: "search-app",
              [eventKey]: offValue,
            });

            if (name === "type") {
              H.expectNoBadSnowplowEvents();
              H.resetSnowplow();
              cy.intercept("GET", "/api/search**").as("unfilteredSearch");
              cy.visit("/search?q=orders");
              cy.wait("@unfilteredSearch");
              H.expectUnstructuredSnowplowEvent({
                event: NEW_SEARCH_QUERY_EVENT_NAME,
                context: "search-app",
              });
              cy.findAllByTestId("search-result-item").then(($items) => {
                const position = $items
                  .toArray()
                  .findIndex((el) =>
                    el.textContent?.includes("Orders in a dashboard"),
                  );
                expect(
                  position,
                  "Orders in a dashboard is in the results",
                ).to.be.gte(0);
                cy.wrap($items.eq(position)).click();
                H.expectUnstructuredSnowplowEvent({
                  event: SEARCH_CLICK,
                  context: "search-app",
                  position,
                });
              });
            }
          });
        });
      },
    );
  });
});
