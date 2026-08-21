/**
 * Playwright port of e2e/test/scenarios/search/search-snowplow.cy.spec.js
 *
 * Notes:
 * - Snowplow is captured at the browser boundary rather than through a
 *   snowplow-micro container — see the long header in
 *   support/search-snowplow.ts for how and, more importantly, for what that
 *   does NOT verify (Iglu schema validation, i.e. the real content of
 *   `expectNoBadSnowplowEvents`). Every other assertion in this file is the
 *   upstream assertion against the real tracker payload.
 * - The two ts-pattern `isMatching` assertions are ported verbatim; ts-pattern
 *   resolves from the repo-root node_modules, same as upstream.
 * - PORTING rule 2: every `cy.wait("@search")` is a `page.waitForResponse`
 *   registered before the navigation/click that triggers it.
 * - The type-filter "removed from the UI" test asserts `content_type: null`
 *   where upstream asserts `content_type: []`; upstream's array matcher makes
 *   `[]` match any array, so that assertion was satisfied by the *previous*
 *   event and never looked at the post-removal one. See the isDeepMatch
 *   docstring and findings-inbox/search-snowplow.md.
 */
import { P, isMatching } from "ts-pattern";

import { resolveToken } from "../support/api";
import { expect, test } from "../support/fixtures";
import { getSearchBar, visitFullAppEmbeddingUrl } from "../support/search";
import {
  commandPaletteSearch,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import type { SnowplowCapture } from "../support/search-snowplow";
import { commandPalette, commandPaletteInput } from "../support/command-palette";
import { entityPickerModal } from "../support/notebook";
import { modal, newButton, popover } from "../support/ui";

import type { Page, Response } from "@playwright/test";

const NEW_SEARCH_QUERY_EVENT_NAME = "search_query";
const SEARCH_CLICK = "search_click";

/** The `@search` alias: cy.intercept("GET", "/api/search**"). */
function waitForSearch(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/search",
  );
}

test.describe("scenarios > search > snowplow", () => {
  let snowplow: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    snowplow = await installSnowplowCapture(page, mb.baseUrl);
    await mb.signInAsAdmin();
    // H.enableTracking(). The capture forces the client-side settings on too,
    // so this is belt-and-braces rather than the only mechanism.
    await mb.api.updateSetting("anon-tracking-enabled", true);
  });

  test.afterEach(() => {
    expectNoBadSnowplowEvents(snowplow);
  });

  test.describe("command palette", () => {
    test("should send snowplow events search queries on a click", async ({
      page,
    }) => {
      await page.goto("/");
      await commandPaletteSearch(page, "Orders", false);

      // Passing a function to ensure that runtime_milliseconds is populated as a number
      await expectUnstructuredSnowplowEvent(snowplow, (event) =>
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

      await commandPalette(page)
        .getByRole("option", { name: "Orders Model", exact: true })
        .click();
      await expectUnstructuredSnowplowEvent(
        snowplow,
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

    test("should send snowplow events search queries on keyboard navigation", async ({
      page,
    }) => {
      await page.goto("/");
      await commandPaletteSearch(page, "Orders", false);

      // Match the full event shape (notably a non-null search_term_hash) so this pins the user's "Orders"
      // search specifically, and stays a count-of-1 even as more search surfaces start emitting events.
      // Passing a function also asserts runtime_milliseconds is a number.
      await expectUnstructuredSnowplowEvent(snowplow, (event) =>
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

      // Upstream slows Cypress down before the keyboard events (and paces them
      // 200ms apart); the palette's result list is still settling.
      await page.waitForTimeout(500);
      const input = commandPaletteInput(page);
      for (const key of ["ArrowDown", "ArrowDown", "Enter"]) {
        await input.press(key);
        await page.waitForTimeout(200);
      }

      await expectUnstructuredSnowplowEvent(
        snowplow,
        {
          event: SEARCH_CLICK,
          context: "command-palette",
          position: 2,
        },
        1,
      );
    });
  });

  test.describe("entity picker", () => {
    test("should send snowplow events search queries", async ({ page }) => {
      await page.goto("/");
      await newButton(page).click();
      await popover(page).getByText("Dashboard", { exact: true }).click();
      await modal(page).getByTestId("collection-picker-button").click();

      await entityPickerModal(page)
        .getByPlaceholder("Search…", { exact: true })
        .pressSequentially("second");

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: NEW_SEARCH_QUERY_EVENT_NAME,
        context: "entity-picker",
        content_type: ["collection"],
      });

      await entityPickerModal(page)
        .getByRole("link", { name: /Second collection/ })
        .click();

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: SEARCH_CLICK,
        context: "entity-picker",
        position: 0,
      });
    });
  });

  test.describe("search bar - embedding only", () => {
    test("should send snowplow events search queries", async ({ page, mb }) => {
      const embed = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        qs: { top_nav: true, search: true },
        baseUrl: mb.baseUrl,
      });
      // cy.type() clicks before typing; pressSequentially only focuses. The
      // SearchBar renders its results dropdown off `isActive`, which is set by
      // the container's onClick — focus alone leaves it closed and no search
      // ever fires.
      await getSearchBar(embed).click();
      await getSearchBar(embed).pressSequentially("coun");
      await expect(embed.getByTestId("loading-indicator")).toHaveCount(0);

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: NEW_SEARCH_QUERY_EVENT_NAME,
        context: "search-bar",
      });

      await embed
        .getByTestId("search-bar-results-container")
        .getByRole("heading", { name: "People", exact: true })
        .click();

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: SEARCH_CLICK,
        context: "search-bar",
        position: 2,
      });
    });
  });

  test.describe("should send snowplow events for each filter when it is applied and removed", () => {
    test.describe("no filters", () => {
      test("should send a new_search_query snowplow event", async ({ page }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
        });

        // The result's rank depends on ranking weights, so derive its position from the DOM order
        // rather than pinning a specific index.
        const items = page.getByTestId("search-result-item");
        const texts = await items.allTextContents();
        const position = texts.findIndex((text) =>
          text.includes("Orders in a dashboard"),
        );
        expect(
          position,
          "Orders in a dashboard is in the results",
        ).toBeGreaterThanOrEqual(0);
        await items.nth(position).click();
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: SEARCH_CLICK,
          context: "search-app",
          position,
        });
      });
    });

    test.describe("type filter", () => {
      test("should send a snowplow event when a search filter is used in the URL", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&type=card");
        await search;

        await expectUnstructuredSnowplowEvent(
          snowplow,
          {
            event: NEW_SEARCH_QUERY_EVENT_NAME,
            context: "search-app",
            content_type: ["card"],
          },
          1,
        );
      });

      test("should send a snowplow event when a search filter is applied from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
        });

        await page.getByTestId("type-search-filter").click();
        const checkboxes = popover(page).getByTestId("type-filter-checkbox");
        // The popover renders a loader until its own available-models search
        // resolves. `count()` does not retry, so without this gate the loop
        // ticks zero times and Apply is a no-op (cy.findAllByTestId().each()
        // retried until at least one existed).
        await expect(checkboxes.first()).toBeVisible();
        const count = await checkboxes.count();
        for (let index = 0; index < count; index++) {
          await checkboxes.nth(index).click();
        }
        await popover(page).getByText("Apply", { exact: true }).click();

        await expectUnstructuredSnowplowEvent(snowplow, {
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

      test("should send a snowplow event when a search filter is removed from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&type=card");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          content_type: ["card"],
        });

        await page
          .getByTestId("type-search-filter")
          .getByLabel("close icon", { exact: true })
          .click();

        // Upstream asserts `content_type: []`, which its array matcher makes
        // vacuous (it matches the ["card"] event above). The real post-removal
        // value is null — toSnowplowContentTypes(undefined).
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          content_type: null,
        });
      });
    });

    test.describe("created_by filter", () => {
      test("should send a snowplow event when a search filter is used in the URL", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&created_by=1");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          creator: true,
        });
      });

      test("should send a snowplow event when a search filter is applied from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          creator: false,
        });

        await page.getByTestId("created_by-search-filter").click();
        await popover(page).getByText("Bobby Tables", { exact: true }).click();
        await popover(page).getByText("Apply", { exact: true }).click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          creator: true,
        });
      });

      test("should send a snowplow event when a search filter is removed from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&created_by=1");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          creator: true,
        });

        await page
          .getByTestId("created_by-search-filter")
          .getByLabel("close icon", { exact: true })
          .click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          creator: false,
        });
      });
    });

    test.describe("last_edited_by filter", () => {
      test("should send a snowplow event when a search filter is used in the URL", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&last_edited_by=1");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          last_editor: true,
        });
      });

      test("should send a snowplow event when a search filter is applied from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          last_editor: false,
        });

        await page.getByTestId("last_edited_by-search-filter").click();
        await popover(page).getByText("Bobby Tables", { exact: true }).click();
        await popover(page).getByText("Apply", { exact: true }).click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          last_editor: true,
        });
      });

      test("should send a snowplow event when a search filter is removed from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&last_edited_by=1");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          last_editor: true,
        });

        await page
          .getByTestId("last_edited_by-search-filter")
          .getByLabel("close icon", { exact: true })
          .click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          last_editor: false,
        });
      });
    });

    test.describe("created_at filter", () => {
      test("should send a snowplow event when a search filter is used in the URL", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&created_at=thisday");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          creation_date: true,
        });
      });

      test("should send a snowplow event when a search filter is applied from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          creation_date: false,
        });

        await page.getByTestId("created_at-search-filter").click();
        await popover(page).getByText("Today", { exact: true }).click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          creation_date: true,
        });
      });

      test("should send a snowplow event when a search filter is removed from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&created_at=thisday");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          creation_date: true,
        });

        await page
          .getByTestId("created_at-search-filter")
          .getByLabel("close icon", { exact: true })
          .click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          creation_date: false,
        });
      });
    });

    test.describe("last_edited_at filter", () => {
      test("should send a snowplow event when a search filter is used in the URL", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&last_edited_at=thisday");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          last_edit_date: true,
        });
      });

      test("should send a snowplow event when a search filter is applied from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          last_edit_date: false,
        });

        await page.getByTestId("last_edited_at-search-filter").click();
        await popover(page).getByText("Today", { exact: true }).click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          last_edit_date: true,
        });
      });

      test("should send a snowplow event when a search filter is removed from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&last_edited_at=thisday");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          last_edit_date: true,
        });

        await page
          .getByTestId("last_edited_at-search-filter")
          .getByLabel("close icon", { exact: true })
          .click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          last_edit_date: false,
        });
      });
    });

    test.describe("verified filter", () => {
      test.skip(
        !resolveToken("pro-self-hosted"),
        "needs the pro-self-hosted token (verified items are an EE feature)",
      );

      test.beforeEach(async ({ mb }) => {
        await mb.api.activateToken("pro-self-hosted");
      });

      test("should send a snowplow event when a search filter is used in the URL", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&verified=true");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          verified_items: true,
        });
      });

      test("should send a snowplow event when a search filter is applied from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          verified_items: false,
        });

        await page
          .getByTestId("verified-search-filter")
          .getByLabel("Verified items only", { exact: true })
          .click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          verified_items: true,
        });
      });

      test("should send a snowplow event when a search filter is removed from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&verified=true");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          verified_items: true,
        });

        await page
          .getByTestId("verified-search-filter")
          .getByLabel("Verified items only", { exact: true })
          .click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          verified_items: false,
        });
      });
    });

    test.describe("search_native_query filter", () => {
      test("should send a snowplow event when a search filter is used in the URL", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&search_native_query=true");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          search_native_queries: true,
        });
      });

      test("should send a snowplow event when a search filter is applied from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          search_native_queries: false,
        });

        await page
          .getByTestId("search_native_query-search-filter")
          .getByLabel("Search the contents of native queries", { exact: true })
          .click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          search_native_queries: true,
        });
      });

      test("should send a snowplow event when a search filter is removed from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&search_native_query=true");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          search_native_queries: true,
        });

        await page
          .getByTestId("search_native_query-search-filter")
          .getByLabel("Search the contents of native queries", { exact: true })
          .click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          search_native_queries: false,
        });
      });
    });

    test.describe("archived filter", () => {
      test("should send a snowplow event when a search filter is used in the URL", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&archived=true");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          search_archived: true,
        });
      });

      test("should send a snowplow event when a search filter is applied from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          search_archived: false,
        });

        await page
          .getByTestId("archived-search-filter")
          .getByLabel("Search items in trash", { exact: true })
          .click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          search_archived: true,
        });
      });

      test("should send a snowplow event when a search filter is removed from the UI", async ({
        page,
      }) => {
        const search = waitForSearch(page);
        await page.goto("/search?q=orders&archived=true");
        await search;
        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          search_archived: true,
        });

        await page
          .getByTestId("archived-search-filter")
          .getByLabel("Search items in trash", { exact: true })
          .click();

        await expectUnstructuredSnowplowEvent(snowplow, {
          event: NEW_SEARCH_QUERY_EVENT_NAME,
          context: "search-app",
          search_archived: false,
        });
      });
    });
  });
});
