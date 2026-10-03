/**
 * Playwright port of e2e/test/scenarios/search/search.cy.spec.js
 *
 * Notes:
 * - Full-app embedding mode only activates when the app runs inside an
 *   iframe (Cypress gets this for free; see visitFullAppEmbeddingUrl in
 *   support/search.ts). Embedding tests interact through a FrameLocator;
 *   network waits and routes stay on the page.
 * - The upstream beforeEach registers a blanket "@search" intercept; here a
 *   waitForSearchResponse is registered before each action whose response was
 *   actually awaited, and the keyboard test's `@search.all` count assertion is
 *   ported as a page-level request listener.
 * - The typeahead dropdown only reacts to real keystrokes, so dropdown
 *   tests type with click() + pressSequentially(); the debounce collapses
 *   the keystrokes into a single search request, as in Cypress. Tests that
 *   submit with Enter can use fill().
 * - "issue 16785" is tagged @skip upstream and stays skipped here.
 */
import type { FrameLocator, Page } from "@playwright/test";

import { test, expect } from "../support/fixtures";
import {
  SAMPLE_DATABASE,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import {
  assertIsEllipsified,
  createCollection,
  createQuestionWithDescription,
  embedFrame,
  expectSearchResultContent,
  getSearchBar,
  isScrollableHorizontally,
  isSearchRequest,
  realPressEnter,
  visitFullAppEmbeddingUrl,
  waitForSearchResponse,
} from "../support/search";

const { ORDERS_ID, PEOPLE_ID, REVIEWS_ID } = SAMPLE_DATABASE;

const visitEmbeddingWithSearch = (
  page: Page,
  baseUrl: string,
  url = "/",
): Promise<FrameLocator> =>
  visitFullAppEmbeddingUrl(page, {
    url,
    baseUrl,
    qs: {
      top_nav: true,
      search: true,
    },
  });

test.describe("scenarios > search", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("universal search", () => {
    test("should work for admin (metabase#20018)", async ({ page, mb }) => {
      const embed = await visitEmbeddingWithSearch(page, mb.baseUrl, "/");
      const searchBar = getSearchBar(embed);
      await searchBar.click();
      await searchBar.pressSequentially("orders count");
      await searchBar.blur();

      await expectSearchResultContent(embed, {
        expectedSearchResults: [
          {
            name: /Orders, Count, Grouped by/i,
            icon: "line",
          },
        ],
        strict: false,
      });

      const dropdownSearch = waitForSearchResponse(page);
      await searchBar.click();
      await searchBar.fill("");
      await searchBar.pressSequentially("product");
      await searchBar.blur();
      await dropdownSearch;

      await expectSearchResultContent(embed, {
        expectedSearchResults: [
          {
            name: "Products",
            description:
              "Includes a catalog of all the products ever sold by the famed Sample Company.",
            collection: "Sample Database",
          },
        ],
        strict: false,
      });

      const fullPageSearch = waitForSearchResponse(page);
      await searchBar.press("Enter");
      await fullPageSearch;

      await expectSearchResultContent(embed, {
        expectedSearchResults: [
          {
            name: "Products",
            description:
              "Includes a catalog of all the products ever sold by the famed Sample Company.",
          },
        ],
        strict: false,
      });
    });

    test("should work for user with permissions (metabase#12332)", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      const embed = await visitEmbeddingWithSearch(page, mb.baseUrl, "/");
      const search = waitForSearchResponse(page);
      await getSearchBar(embed).fill("product");
      await getSearchBar(embed).press("Enter");
      await search;
      await expect(
        embed.getByTestId("search-app").getByText("Products", { exact: true }),
      ).toBeVisible();
    });

    test("should work for user without data permissions (metabase#16855)", async ({
      page,
      mb,
    }) => {
      await mb.signIn("nodata");
      const embed = await visitEmbeddingWithSearch(page, mb.baseUrl, "/");
      const search = waitForSearchResponse(page);
      await getSearchBar(embed).fill("product");
      await getSearchBar(embed).press("Enter");
      await search;
      await expect(
        embed
          .getByTestId("search-app")
          .getByText("Didn't find anything", { exact: true }),
      ).toBeVisible();
    });

    test("allows to select a search result using keyboard", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      const searchRequests: string[] = [];
      page.on("request", (request) => {
        if (isSearchRequest(request.url(), request.method())) {
          searchRequests.push(request.url());
        }
      });
      const embed = await visitEmbeddingWithSearch(page, mb.baseUrl, "/");
      const search = waitForSearchResponse(page);
      await getSearchBar(embed).click();
      await getSearchBar(embed).pressSequentially("ord");
      await search;

      await expect(
        embed.getByTestId("app-bar").getByPlaceholder("Search…"),
      ).toHaveValue("ord");
      await expect(
        embed.getByTestId("search-result-item-name").first(),
      ).toHaveText("Orders in a dashboard");

      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await realPressEnter(page);

      await embedFrame(page).waitForURL(
        (url) => url.pathname === `/question/${ORDERS_QUESTION_ID}-orders`,
      );

      expect(searchRequests).toHaveLength(1);
    });

    test("should render a preview of markdown descriptions", async ({
      page,
      mb,
    }) => {
      await createQuestionWithDescription(mb.api, {
        name: "Description Test",
        query: { "source-table": ORDERS_ID },
        description: `![alt](https://upload.wikimedia.org/wikipedia/commons/a/a2/Cat_outside.jpg)

        Lorem ipsum dolor sit amet.

        ----

        ## Heading 1

        This is a [link](https://upload.wikimedia.org/wikipedia/commons/a/a2/Cat_outside.jpg).

        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. `,
      });
      await mb.signInAsNormalUser();
      const embed = await visitEmbeddingWithSearch(page, mb.baseUrl, "/");
      await getSearchBar(embed).click();
      await getSearchBar(embed).pressSequentially("Test");

      const description = embed.getByTestId("result-description");

      // Ensure that text is ellipsified
      const loremText = description.getByText(/Lorem ipsum dolor sit amet./);
      await expect(loremText).toBeVisible();
      await assertIsEllipsified(loremText);

      // Ensure that images are not being rendered in the descriptions
      await expect(description.getByRole("img")).toHaveCount(0);
    });

    test("should not overflow container if results contain descriptions with large unbroken strings", async ({
      page,
      mb,
    }) => {
      await createQuestionWithDescription(mb.api, {
        name: "Description Test",
        query: { "source-table": ORDERS_ID },
        description:
          "testingtestingtestingtestingtestingtestingtestingtesting testingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtesting testingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtesting",
      });
      await mb.signInAsNormalUser();
      const embed = await visitEmbeddingWithSearch(page, mb.baseUrl, "/");
      await getSearchBar(embed).click();
      await getSearchBar(embed).pressSequentially("Test");

      const parentContainer = embed.getByTestId(
        "search-results-floating-container",
      );
      const description = embed.getByTestId("result-description");
      await expect(description).toBeVisible();

      const parentWidth = await parentContainer.evaluate(
        (element: HTMLElement) => element.offsetWidth,
      );
      const descriptionWidth = await description.evaluate(
        (element: HTMLElement) => element.offsetWidth,
      );
      // Result description width should not exceed parent container width
      expect(descriptionWidth).toBeLessThan(parentWidth);
    });

    test("should not dismiss when a dashboard finishes loading (metabase#35009)", async ({
      page,
      mb,
    }) => {
      const embed = await visitEmbeddingWithSearch(
        page,
        mb.baseUrl,
        `/dashboard/${ORDERS_DASHBOARD_ID}`,
      );

      // Type as soon as possible, before the dashboard has finished loading
      await getSearchBar(embed).click();
      await getSearchBar(embed).pressSequentially("ord");

      // Once the dashboard is visible, the search results should not be dismissed
      await expect(
        embed
          .locator("main")
          .getByRole("heading", { name: "Loading...", exact: true }),
      ).not.toBeVisible();
      await expect(
        embed.getByTestId("search-results-floating-container"),
      ).toBeVisible();
    });

    test("should not dismiss when the homepage redirects to a dashboard (metabase#34226)", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("custom-homepage", true);
      await mb.api.updateSetting(
        "custom-homepage-dashboard",
        ORDERS_DASHBOARD_ID,
      );
      await page.route(
        (url) => url.pathname === `/api/dashboard/${ORDERS_DASHBOARD_ID}`,
        async (route) => {
          if (route.request().method() !== "GET") {
            return route.fallback();
          }
          const response = await route.fetch();
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await route.fulfill({ response });
        },
      );
      const embed = await visitEmbeddingWithSearch(page, mb.baseUrl, "/");

      // Type as soon as possible, before the dashboard has finished loading
      await getSearchBar(embed).click();
      await getSearchBar(embed).pressSequentially("ord");

      // Once the dashboard is visible, the search results should not be dismissed
      await expect(
        embed.getByTestId("dashboard-parameters-and-cards"),
      ).toBeVisible();
      await expect(
        embed.getByTestId("search-results-floating-container"),
      ).toBeVisible();
    });
  });

  test.describe("accessing full page search with `Enter`", () => {
    test("should not render full page search if user has not entered a text query", async ({
      page,
      mb,
    }) => {
      const embed = await visitEmbeddingWithSearch(page, mb.baseUrl, "/");

      const recentViews = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/activity/recents",
      );
      await getSearchBar(embed).click();
      await page.keyboard.press("Enter");
      await recentViews;

      await expect(
        embed
          .getByTestId("search-results-floating-container")
          .getByText("Recently viewed", { exact: true }),
      ).toBeVisible();
      expect(new URL(embedFrame(page).url()).pathname).toBe("/");
    });

    test("should render full page search when search text is present and user clicks 'Enter'", async ({
      page,
      mb,
    }) => {
      const embed = await visitEmbeddingWithSearch(page, mb.baseUrl, "/");

      const search = waitForSearchResponse(page);
      await getSearchBar(embed).click();
      await getSearchBar(embed).fill("orders");
      await page.keyboard.press("Enter");
      await search;

      await expect(
        embed
          .getByTestId("search-app")
          .getByText('Results for "orders"', { exact: true }),
      ).toBeVisible();

      const location = new URL(embedFrame(page).url());
      expect(location.pathname).toBe("/search");
      expect(location.search).toBe("?q=orders");
    });
  });
});

// Tagged @skip upstream.
test.describe.skip("issue 16785", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await mb.api.put("/api/table", {
      ids: [REVIEWS_ID],
      visibility_type: "hidden",
    });
  });

  test("should not display hidden tables (metabase#16785)", async ({
    page,
  }) => {
    await page.goto("/");
    await getSearchBar(page).fill("Reviews");

    const resultsList = page.getByTestId("search-results-list");
    await expect(resultsList).toBeVisible();
    await expect(
      resultsList.getByText("Reviews", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 28788", () => {
  const LONG_STRING = "01234567890ABCDEFGHIJKLMNOPQRSTUVXYZ0123456789";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("search results container should not be scrollable horizontally (metabase#28788)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: `28788-${LONG_STRING}`,
      type: "model",
      description: LONG_STRING,
      query: {
        "source-table": PEOPLE_ID,
      },
    };

    const collection = await createCollection(mb.api, {
      name: `Collection-${LONG_STRING}`,
    });
    await createQuestionWithDescription(mb.api, {
      ...questionDetails,
      collection_id: collection.id,
    });

    const embed = await visitFullAppEmbeddingUrl(page, {
      url: "/",
      baseUrl: mb.baseUrl,
      qs: { top_nav: true, search: true },
    });
    const search = waitForSearchResponse(page);
    await getSearchBar(embed).click();
    await getSearchBar(embed).pressSequentially(questionDetails.name);
    await search;
    // Port of cy.icon("hourglass")
    await expect(embed.locator(".Icon-hourglass")).toHaveCount(0);

    const container = embed.getByTestId("search-bar-results-container");
    await expect(container).toBeVisible();
    expect(await isScrollableHorizontally(container)).toBe(false);
  });
});
