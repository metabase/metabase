/**
 * Playwright port of e2e/test/scenarios/search/search-filters.cy.spec.js
 *
 * The filter sidebar on the full-page search app (/search): filter results by
 * type, created-by, last-edited-by, created-at, last-edited-at, verified,
 * native-query, personal-collection and trashed items.
 *
 * Notes:
 * - The top-level `beforeEach` restores + signs in as admin; several inner
 *   describes re-restore and create per-user content, mirroring upstream.
 * - `cy.wait("@search")` → waitForSearchResponse registered BEFORE the goto,
 *   awaited after (PORTING rule 2). Tests that go through the command palette
 *   use commandPaletteSearch (support/search-pagination.ts, viewAll=true) which
 *   awaits the palette search internally; the search-app assertions then
 *   auto-retry.
 * - `should("have.attr","aria-label").and("match", regex)` on every result →
 *   an explicit loop asserting toHaveAttribute with the RegExp (each result's
 *   aria-label must end with the type).
 * - `findByLabelText("close icon" | "verified_filled icon")` are aria-labels →
 *   getByLabel(..., { exact: true }) (testing-library findByLabelText is exact).
 * - The type-filter describe seeds model/action/model-index/document after
 *   restore; waitForModelIndexed (support/search-filters.ts) covers the async
 *   indexing before the type search runs.
 * - The verified describe is EE (content verification via the pro-self-hosted
 *   token) — gated on resolveToken and activated in beforeEach (PORTING rule 7).
 */
import { resolveToken } from "../support/api";
import {
  commandPalette,
  commandPaletteButton,
  commandPaletteInput,
} from "../support/command-palette";
import { archiveCollection } from "../support/collections-trash";
import { createAction } from "../support/actions-on-dashboards";
import { createDocument } from "../support/documents-core";
import { createModelIndex } from "../support/model-indexes";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { setActionsEnabledForDB } from "../support/command-palette";
import { test, expect } from "../support/fixtures";
import { FIRST_COLLECTION_ID, SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  expectSearchResultContent,
  waitForSearchResponse,
} from "../support/search";
import { commandPaletteSearch } from "../support/search-pagination";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ADMIN_USER_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
  NORMAL_USER_ID,
  ORDERS_COUNT_QUESTION_ID,
  createModerationReview,
  editQuestionByAddingSummarize,
  expectSearchResultItemNameContent,
  waitForLastEditors,
  waitForModelIndexed,
} from "../support/search-filters";
import { popover } from "../support/ui";
import type { Page } from "@playwright/test";

const { ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

const typeFilters = [
  { label: "Question", type: "card" },
  { label: "Dashboard", type: "dashboard" },
  { label: "Collection", type: "collection" },
  { label: "Table", type: "table" },
  { label: "Database", type: "database" },
  { label: "Model", type: "dataset" },
  { label: "Action", type: "action" },
  { label: "Indexed record", type: "indexed-entity" },
  { label: "Document", type: "document" },
];

const NORMAL_USER_TEST_QUESTION = {
  name: "Robert's Super Duper Reviews",
  query: { "source-table": ORDERS_ID, limit: 1 },
  collection_id: null,
};

const ADMIN_TEST_QUESTION = {
  name: "Admin Super Duper Reviews",
  query: { "source-table": ORDERS_ID, limit: 1 },
  collection_id: null,
};

// Using these names in the `last_edited_by` section to reduce confusion
const LAST_EDITED_BY_ADMIN_QUESTION = NORMAL_USER_TEST_QUESTION;
const LAST_EDITED_BY_NORMAL_USER_QUESTION = ADMIN_TEST_QUESTION;

const REVIEWS_TABLE_NAME = "Reviews";

const TEST_NATIVE_QUESTION_NAME = "GithubUptimeisMagnificentlyHigh";

const TEST_CREATED_AT_FILTERS: [string, string][] = [
  ["Today", "thisday"],
  ["Yesterday", "past1days"],
  ["Previous week", "past1weeks"],
  ["Previous 7 days", "past7days"],
  ["Previous 30 days", "past30days"],
  ["Previous month", "past1months"],
  ["Previous 3 months", "past3months"],
  ["Previous 12 months", "past12months"],
];

/** Every result's aria-label must end with `type` (the upstream per-result
 * `.should("have.attr","aria-label").and("match", /type$/)`). */
async function expectAllResultsMatchType(page: Page, type: string) {
  const items = page.getByTestId("search-result-item");
  await expect(items.first()).toBeVisible();
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
  const regex = new RegExp(`${type}$`);
  for (let i = 0; i < count; i++) {
    await expect(items.nth(i)).toHaveAttribute("aria-label", regex);
  }
}

test.describe("scenarios > search", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("applying search filters", () => {
    test.describe("no filters", () => {
      test("hydrating search from URL", async ({ page }) => {
        const search = waitForSearchResponse(page);
        await page.goto("/search?q=orders");
        await search;
        await expect(
          page
            .getByTestId("search-app")
            .getByText('Results for "orders"', { exact: true }),
        ).toBeVisible();
      });

      test("hydrates the command palette search from the URL (#71248)", async ({
        page,
      }) => {
        const search = waitForSearchResponse(page);
        await page.goto("/search?q=products");
        await search;
        await expect(commandPaletteButton(page)).toContainText("products");

        const paletteSearch = page.waitForResponse((response) => {
          const parsed = new URL(response.url());
          return (
            response.request().method() === "GET" &&
            parsed.pathname === "/api/search" &&
            (parsed.searchParams.get("q") ?? "").startsWith("products")
          );
        });
        await commandPaletteButton(page).click();
        await expect(commandPaletteInput(page)).toHaveValue("products");
        await paletteSearch;

        await expect(
          commandPalette(page).getByRole("option", {
            name: "Products",
            exact: true,
          }),
        ).toBeVisible();
      });
    });

    test.describe("type filter", () => {
      test.beforeEach(async ({ mb }) => {
        await setActionsEnabledForDB(mb.api, SAMPLE_DB_ID);

        const model = await createQuestion(mb.api, {
          name: "Orders Model",
          query: { "source-table": ORDERS_ID },
          type: "model",
        });
        await createAction(mb.api, {
          name: "Update orders quantity",
          description: "Set orders quantity to the same value",
          type: "query",
          model_id: model.id,
          database_id: SAMPLE_DB_ID,
          dataset_query: {
            database: SAMPLE_DB_ID,
            native: { query: "UPDATE orders SET quantity = quantity" },
            type: "native",
          },
          parameters: [],
          visualization_settings: { type: "button" },
        });

        const productsModel = await createQuestion(mb.api, {
          name: "Products Model",
          query: { "source-table": PRODUCTS_ID },
          type: "model",
        });
        await createModelIndex(mb.api, {
          modelId: productsModel.id,
          pkName: "ID",
          valueName: "TITLE",
        });

        await createDocument(mb.api, {
          name: "Releases overview",
          document: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                attrs: { _id: "1" },
                content: [{ type: "text", text: "Document body" }],
              },
            ],
          },
        });

        // The seeded content is indexed asynchronously; block until each newly
        // created type is searchable before any type-filter search runs.
        await waitForModelIndexed(mb.api, "e", "dataset", 2);
        await waitForModelIndexed(mb.api, "Update", "action", 1);
        await waitForModelIndexed(mb.api, "Releases", "document", 1);
        await waitForModelIndexed(mb.api, "e", "indexed-entity", 1);
      });

      for (const { label, type } of typeFilters) {
        test(`should hydrate search with search text and ${label} filter`, async ({
          page,
        }) => {
          const search = waitForSearchResponse(page);
          await page.goto(`/search?q=e&type=${type}`);
          await search;

          await expect(
            page
              .getByTestId("search-app")
              .getByText('Results for "e"', { exact: true }),
          ).toBeVisible();

          await expectAllResultsMatchType(page, type);

          const typeFilter = page.getByTestId("type-search-filter");
          await expect(
            typeFilter.getByText(label, { exact: true }),
          ).toBeVisible();
          await expect(
            typeFilter.getByLabel("close icon", { exact: true }),
          ).toBeVisible();
        });

        test(`should filter results by ${label}`, async ({ page }) => {
          await page.goto("/");
          await commandPaletteSearch(page, "e");

          await page.getByTestId("type-search-filter").click();
          await popover(page).getByText(label, { exact: true }).click();
          await popover(page).getByText("Apply", { exact: true }).click();

          await expectAllResultsMatchType(page, type);
        });
      }

      test("should remove type filter when `X` is clicked on search filter", async ({
        page,
      }) => {
        const { label, type } = typeFilters[0];
        const search = waitForSearchResponse(page);
        await page.goto(`/search?q=e&type=${type}`);
        await search;

        const typeFilter = page.getByTestId("type-search-filter");
        await expect(typeFilter.getByText(label, { exact: true })).toBeVisible();
        await typeFilter.getByLabel("close icon", { exact: true }).click();
        await expect(
          typeFilter.getByText(label, { exact: true }),
        ).toHaveCount(0);
        await expect(
          typeFilter.getByText("Content type", { exact: true }),
        ).toBeVisible();

        await expect.poll(() => new URL(page.url()).search).not.toContain("type");

        const items = page.getByTestId("search-result-item");
        await expect(items.first()).toBeVisible();
        const labels = await items.evaluateAll((els) =>
          els.map((el) => el.getAttribute("aria-label") ?? ""),
        );
        const uniqueResults = new Set(
          labels.map((l) => l.split(" ").slice(-1)[0]),
        );
        expect(uniqueResults.size).toBeGreaterThan(1);
      });
    });

    test.describe("created_by filter", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.restore();
        // create a question from a normal and admin user, then we can query the
        // question created by that user as an admin
        await mb.signInAsNormalUser();
        await createQuestion(mb.api, NORMAL_USER_TEST_QUESTION);
        await mb.signOut();

        await mb.signInAsAdmin();
        await createQuestion(mb.api, ADMIN_TEST_QUESTION);
      });

      test("should hydrate created_by filter", async ({ page }) => {
        const search = waitForSearchResponse(page);
        await page.goto(
          `/search?created_by=${ADMIN_USER_ID}&created_by=${NORMAL_USER_ID}&q=reviews`,
        );
        await search;

        const createdBy = page.getByTestId("created_by-search-filter");
        await expect(
          createdBy.getByText("2 users selected", { exact: true }),
        ).toBeVisible();
        await expect(
          createdBy.getByLabel("close icon", { exact: true }),
        ).toBeVisible();

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
            {
              name: ADMIN_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });
      });

      test("should filter results by one user", async ({ page }) => {
        await page.goto("/");
        await commandPaletteSearch(page, "reviews");

        await expectSearchResultItemNameContent(page, {
          itemNames: [
            NORMAL_USER_TEST_QUESTION.name,
            ADMIN_TEST_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        await page.getByTestId("created_by-search-filter").click();
        await popover(page).getByText("Robert Tableton", { exact: true }).click();
        await popover(page).getByText("Apply", { exact: true }).click();
        await expect.poll(() => page.url()).toContain("created_by");

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
          ],
        });
      });

      test("should filter results by more than one user", async ({ page }) => {
        await page.goto("/");
        await commandPaletteSearch(page, "reviews");

        await expectSearchResultItemNameContent(page, {
          itemNames: [
            NORMAL_USER_TEST_QUESTION.name,
            ADMIN_TEST_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        await page.getByTestId("created_by-search-filter").click();
        await popover(page).getByText("Robert Tableton", { exact: true }).click();
        await popover(page).getByText("Bobby Tables", { exact: true }).click();
        await popover(page).getByText("Apply", { exact: true }).click();
        await expect.poll(() => page.url()).toContain("created_by");

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
            {
              name: ADMIN_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });
      });

      test("should be able to remove a user from the `created_by` filter", async ({
        page,
      }) => {
        const search = waitForSearchResponse(page);
        await page.goto(
          `/search?q=reviews&created_by=${NORMAL_USER_ID}&created_by=${ADMIN_USER_ID}`,
        );
        await search;

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
            {
              name: ADMIN_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });

        await page.getByTestId("created_by-search-filter").click();
        // remove Robert Tableton from the created_by filter
        await popover(page)
          .getByTestId("search-user-select-box")
          .getByText("Robert Tableton", { exact: true })
          .click();
        await popover(page).getByText("Apply", { exact: true }).click();

        await expectSearchResultItemNameContent(page, {
          itemNames: [ADMIN_TEST_QUESTION.name],
        });
      });

      test("should remove created_by filter when `X` is clicked on filter", async ({
        page,
      }) => {
        await page.goto(`/search?q=reviews&created_by=${NORMAL_USER_ID}`);

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
          ],
        });

        const createdBy = page.getByTestId("created_by-search-filter");
        await expect(
          createdBy.getByText("Robert Tableton", { exact: true }),
        ).toBeVisible();
        await createdBy.getByLabel("close icon", { exact: true }).click();

        await expectSearchResultItemNameContent(page, {
          itemNames: [
            NORMAL_USER_TEST_QUESTION.name,
            ADMIN_TEST_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });
      });

      for (const userType of ["normal", "sandboxed"] as const) {
        test(`should allow ${userType} (non-admin) user to see users and filter by created_by`, async ({
          page,
          mb,
        }) => {
          await mb.signIn(userType);
          await page.goto("/");
          await commandPaletteSearch(page, "reviews");

          await expectSearchResultItemNameContent(
            page,
            {
              itemNames: [
                NORMAL_USER_TEST_QUESTION.name,
                ADMIN_TEST_QUESTION.name,
              ],
            },
            { strict: false },
          );

          await page.getByTestId("created_by-search-filter").click();
          await popover(page).getByText("Bobby Tables", { exact: true }).click();
          await popover(page).getByText("Apply", { exact: true }).click();
          await expect.poll(() => page.url()).toContain("created_by");

          await expectSearchResultContent(page, {
            expectedSearchResults: [
              {
                name: ADMIN_TEST_QUESTION.name,
                timestamp: "Created a few seconds ago by Bobby Tables",
                collection: "Our analytics",
              },
            ],
          });
        });
      }
    });

    test.describe("last_edited_by filter", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.signInAsAdmin();
        // Created by admin, then edited by the normal user → last edited by
        // Robert Tableton.
        const q1 = await createQuestion(mb.api, LAST_EDITED_BY_NORMAL_USER_QUESTION);
        await mb.signOut();
        await mb.signInAsNormalUser();
        await editQuestionByAddingSummarize(mb.api, q1.id, LAST_EDITED_BY_NORMAL_USER_QUESTION.query);

        // Upstream relies on Cypress command ordering: this createQuestion runs
        // while the normal user is still signed in (from the q1 edit above), so
        // q2 is created by the normal user and then edited by admin → last
        // edited by Bobby Tables. Creating it as admin instead makes creator ==
        // editor, and the FE then renders "Created … by you" rather than
        // "Updated …", which the last_edited_by assertions depend on.
        const q2 = await createQuestion(mb.api, LAST_EDITED_BY_ADMIN_QUESTION);
        await mb.signInAsAdmin();
        await editQuestionByAddingSummarize(mb.api, q2.id, LAST_EDITED_BY_ADMIN_QUESTION.query);

        // The edits are indexed asynchronously; block until the search index
        // reports the expected last-editor for each card.
        await waitForLastEditors(mb.api, {
          [LAST_EDITED_BY_NORMAL_USER_QUESTION.name]: NORMAL_USER_ID,
          [LAST_EDITED_BY_ADMIN_QUESTION.name]: ADMIN_USER_ID,
        });
      });

      test("should hydrate last_edited_by filter", async ({ page }) => {
        const search = waitForSearchResponse(page);
        await page.goto(`/search?q=reviews&last_edited_by=${NORMAL_USER_ID}`);
        await search;

        const lastEditedBy = page.getByTestId("last_edited_by-search-filter");
        await expect(
          lastEditedBy.getByText("Robert Tableton", { exact: true }),
        ).toBeVisible();
        await expect(
          lastEditedBy.getByLabel("close icon", { exact: true }),
        ).toBeVisible();

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              timestamp: "Updated a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
          ],
        });
      });

      test("should filter last_edited results by one user", async ({ page }) => {
        await page.goto("/");
        await commandPaletteSearch(page, "reviews");

        await page.getByTestId("last_edited_by-search-filter").click();

        await expectSearchResultItemNameContent(page, {
          itemNames: [
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
            LAST_EDITED_BY_ADMIN_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        await popover(page).getByText("Robert Tableton", { exact: true }).click();
        await popover(page).getByText("Apply", { exact: true }).click();
        await expect.poll(() => page.url()).toContain("last_edited_by");

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              timestamp: "Updated a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
          ],
        });
      });

      test("should filter last_edited results by more than user", async ({
        page,
      }) => {
        await page.goto("/");
        await commandPaletteSearch(page, "reviews");

        await page.getByTestId("last_edited_by-search-filter").click();

        await expectSearchResultItemNameContent(page, {
          itemNames: [
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
            LAST_EDITED_BY_ADMIN_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        await popover(page).getByText("Robert Tableton", { exact: true }).click();
        await popover(page).getByText("Bobby Tables", { exact: true }).click();
        await popover(page).getByText("Apply", { exact: true }).click();
        await expect.poll(() => page.url()).toContain("last_edited_by");

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              timestamp: "Updated a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
            {
              name: LAST_EDITED_BY_ADMIN_QUESTION.name,
              timestamp: "Updated a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });
      });

      test("should allow to remove a user from the `last_edited_by` filter", async ({
        page,
      }) => {
        const search = waitForSearchResponse(page);
        await page.goto(
          `/search?q=reviews&last_edited_by=${NORMAL_USER_ID}&last_edited_by=${ADMIN_USER_ID}`,
        );
        await search;

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              timestamp: "Updated a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
            {
              name: LAST_EDITED_BY_ADMIN_QUESTION.name,
              timestamp: "Updated a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });

        await page.getByTestId("last_edited_by-search-filter").click();
        // remove Robert Tableton from the last_edited_by filter
        await popover(page)
          .getByTestId("search-user-select-box")
          .getByText("Robert Tableton", { exact: true })
          .click();
        await popover(page).getByText("Apply", { exact: true }).click();

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_ADMIN_QUESTION.name,
              timestamp: "Updated a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });
      });

      test("should remove last_edited_by filter when `X` is clicked on filter", async ({
        page,
      }) => {
        await page.goto(
          `/search?q=reviews&last_edited_by=${NORMAL_USER_ID}&last_edited_by=${ADMIN_USER_ID}`,
        );

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              timestamp: "Updated a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
            {
              name: LAST_EDITED_BY_ADMIN_QUESTION.name,
              timestamp: "Updated a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });

        const lastEditedBy = page.getByTestId("last_edited_by-search-filter");
        await expect(
          lastEditedBy.getByText("2 users selected", { exact: true }),
        ).toBeVisible();
        await lastEditedBy.getByLabel("close icon", { exact: true }).click();

        await expectSearchResultItemNameContent(page, {
          itemNames: [
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
            LAST_EDITED_BY_ADMIN_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });
      });

      for (const userType of ["normal", "sandboxed"] as const) {
        test(`should allow ${userType} (non-admin) user to see users and filter by last_edited_by`, async ({
          page,
          mb,
        }) => {
          await mb.signIn(userType);
          await page.goto("/");
          await commandPaletteSearch(page, "reviews");

          await expectSearchResultItemNameContent(
            page,
            {
              itemNames: [
                NORMAL_USER_TEST_QUESTION.name,
                ADMIN_TEST_QUESTION.name,
              ],
            },
            { strict: false },
          );

          await page.getByTestId("last_edited_by-search-filter").click();
          await popover(page).getByText("Bobby Tables", { exact: true }).click();
          await popover(page).getByText("Apply", { exact: true }).click();
          await expect.poll(() => page.url()).toContain("last_edited_by");

          await expectSearchResultContent(page, {
            expectedSearchResults: [
              {
                name: LAST_EDITED_BY_ADMIN_QUESTION.name,
                timestamp: "Updated a few seconds ago by Bobby Tables",
                collection: "Our analytics",
              },
            ],
          });
        });
      }
    });

    test.describe("created_at filter", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.signInAsNormalUser();
        await createQuestion(mb.api, NORMAL_USER_TEST_QUESTION);
        await mb.signOut();
        await mb.signInAsAdmin();
      });

      for (const [label, filter] of TEST_CREATED_AT_FILTERS) {
        test(`should hydrate created_at=${filter}`, async ({ page }) => {
          const search = waitForSearchResponse(page);
          await page.goto(`/search?q=orders&created_at=${filter}`);
          await search;

          const createdAt = page.getByTestId("created_at-search-filter");
          await expect(
            createdAt.getByText(label, { exact: true }),
          ).toBeVisible();
          await expect(
            createdAt.getByLabel("close icon", { exact: true }),
          ).toBeVisible();
        });
      }

      // we can only test the 'today' filter since we currently
      // can't edit the created_at column of a question in our database
      test("should filter results by Today (created_at=thisday)", async ({
        page,
      }) => {
        await page.goto("/search?q=Reviews");

        await expectSearchResultItemNameContent(
          page,
          { itemNames: [REVIEWS_TABLE_NAME, NORMAL_USER_TEST_QUESTION.name] },
          { strict: false },
        );

        await page.getByTestId("created_at-search-filter").click();
        await popover(page).getByText("Today", { exact: true }).click();

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              collection: "Our analytics",
              timestamp: "Created a few seconds ago by Robert Tableton",
            },
          ],
          strict: false,
        });
      });

      test("should remove created_at filter when `X` is clicked on search filter", async ({
        page,
      }) => {
        const search = waitForSearchResponse(page);
        await page.goto("/search?q=Reviews&created_at=thisday");
        await search;

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              collection: "Our analytics",
              timestamp: "Created a few seconds ago by Robert Tableton",
            },
          ],
          strict: false,
        });

        const createdAt = page.getByTestId("created_at-search-filter");
        await expect(createdAt.getByText("Today", { exact: true })).toBeVisible();
        await createdAt.getByLabel("close icon", { exact: true }).click();
        await expect(
          createdAt.getByText("Today", { exact: true }),
        ).toHaveCount(0);
        await expect(
          createdAt.getByText("Creation date", { exact: true }),
        ).toBeVisible();

        await expect.poll(() => new URL(page.url()).search).not.toContain(
          "created_at",
        );

        await expectSearchResultItemNameContent(
          page,
          { itemNames: [REVIEWS_TABLE_NAME, NORMAL_USER_TEST_QUESTION.name] },
          { strict: false },
        );
      });
    });

    test.describe("last_edited_at filter", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.signInAsAdmin();
        // We'll create a question as a normal user, then edit it as an admin user
        const q = await createQuestion(mb.api, LAST_EDITED_BY_NORMAL_USER_QUESTION);
        await mb.signOut();
        await mb.signInAsNormalUser();
        await editQuestionByAddingSummarize(mb.api, q.id, LAST_EDITED_BY_NORMAL_USER_QUESTION.query);
        await mb.signOut();
        await mb.signInAsAdmin();

        // The edit is indexed asynchronously; block until the search index
        // reports the normal user as the last editor.
        await waitForLastEditors(mb.api, {
          [LAST_EDITED_BY_NORMAL_USER_QUESTION.name]: NORMAL_USER_ID,
        });
      });

      for (const [label, filter] of TEST_CREATED_AT_FILTERS) {
        test(`should hydrate last_edited_at=${filter}`, async ({ page }) => {
          const search = waitForSearchResponse(page);
          await page.goto(`/search?q=reviews&last_edited_at=${filter}`);
          await search;

          const lastEditedAt = page.getByTestId("last_edited_at-search-filter");
          await expect(
            lastEditedAt.getByText(label, { exact: true }),
          ).toBeVisible();
          await expect(
            lastEditedAt.getByLabel("close icon", { exact: true }),
          ).toBeVisible();
        });
      }

      // we can only test the 'today' filter since we currently
      // can't edit the last_edited_at column of a question in our database
      test("should filter results by Today (last_edited_at=thisday)", async ({
        page,
      }) => {
        await page.goto("/search?q=Reviews");

        await expectSearchResultItemNameContent(page, {
          itemNames: [
            REVIEWS_TABLE_NAME,
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
          ],
        });

        await page.getByTestId("last_edited_at-search-filter").click();
        await popover(page).getByText("Today", { exact: true }).click();

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              collection: "Our analytics",
              timestamp: "Updated a few seconds ago by Robert Tableton",
            },
          ],
          strict: false,
        });
      });

      test("should remove last_edited_at filter when `X` is clicked on search filter", async ({
        page,
      }) => {
        const search = waitForSearchResponse(page);
        await page.goto("/search?q=Reviews&last_edited_at=thisday");
        await search;

        await expectSearchResultContent(page, {
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              collection: "Our analytics",
              timestamp: "Updated a few seconds ago by Robert Tableton",
            },
          ],
          strict: false,
        });

        const lastEditedAt = page.getByTestId("last_edited_at-search-filter");
        await expect(
          lastEditedAt.getByText("Today", { exact: true }),
        ).toBeVisible();
        await lastEditedAt.getByLabel("close icon", { exact: true }).click();
        await expect(
          lastEditedAt.getByText("Today", { exact: true }),
        ).toHaveCount(0);
        await expect(
          lastEditedAt.getByText("Last edit date", { exact: true }),
        ).toBeVisible();

        await expect.poll(() => new URL(page.url()).search).not.toContain(
          "last_edited_at",
        );

        await expectSearchResultItemNameContent(page, {
          itemNames: [
            REVIEWS_TABLE_NAME,
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
          ],
        });
      });
    });

    test.describe("verified filter", () => {
      test.skip(
        !resolveToken("pro-self-hosted"),
        "requires the pro-self-hosted token (content verification is EE)",
      );

      test.beforeEach(async ({ mb }) => {
        await mb.api.activateToken("pro-self-hosted");
        await createModerationReview(mb.api, {
          status: "verified",
          moderated_item_type: "card",
          moderated_item_id: ORDERS_COUNT_QUESTION_ID,
        });
      });

      test("should hydrate search with search text and verified filter", async ({
        page,
      }) => {
        const search = waitForSearchResponse(page);
        await page.goto("/search?q=orders&verified=true");
        await search;

        await expect(
          page
            .getByTestId("search-app")
            .getByText('Results for "orders"', { exact: true }),
        ).toBeVisible();

        const items = page.getByTestId("search-result-item");
        await expect(items.first()).toBeVisible();
        const count = await items.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
          await expect(
            items.nth(i).getByLabel("verified_filled icon", { exact: true }),
          ).toBeVisible();
        }
      });

      test("should filter results by verified items", async ({ page }) => {
        await page.goto("/");
        await commandPaletteSearch(page, "e");

        const search = waitForSearchResponse(page);
        await page
          .getByTestId("verified-search-filter")
          .getByLabel("Verified items only", { exact: true })
          .click();
        await search;

        const items = page.getByTestId("search-result-item");
        await expect(items.first()).toBeVisible();
        const count = await items.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
          await expect(
            items.nth(i).getByLabel("verified_filled icon", { exact: true }),
          ).toBeVisible();
        }
      });

      test("should not filter results when verified items is off", async ({
        page,
      }) => {
        const search = waitForSearchResponse(page);
        await page.goto("/search?q=e&verified=true");
        await search;

        await page
          .getByTestId("verified-search-filter")
          .getByLabel("Verified items only", { exact: true })
          .click();
        await expect.poll(() => page.url()).not.toContain("verified=true");

        const items = page.getByTestId("search-result-item");
        await expect(items.first()).toBeVisible();
        const verifiedCount = await items
          .filter({ has: page.getByLabel("verified_filled icon", { exact: true }) })
          .count();
        const totalCount = await items.count();
        expect(verifiedCount).toBe(1);
        expect(totalCount - verifiedCount).toBeGreaterThan(0);
      });
    });

    test.describe("native query filter", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.signInAsAdmin();
        await createNativeQuestion(mb.api, {
          name: TEST_NATIVE_QUESTION_NAME,
          native: { query: "SELECT 'reviews';" },
        });
        await createNativeQuestion(mb.api, {
          name: "Native Query",
          native: { query: `SELECT '${TEST_NATIVE_QUESTION_NAME}';` },
        });
      });

      test("should hydrate search with search text and native query filter", async ({
        page,
      }) => {
        const search = waitForSearchResponse(page);
        await page.goto(
          `/search?q=${TEST_NATIVE_QUESTION_NAME}&search_native_query=true`,
        );
        await search;

        await expect(
          page
            .getByTestId("search-app")
            .getByText(`Results for "${TEST_NATIVE_QUESTION_NAME}"`, {
              exact: true,
            }),
        ).toBeVisible();

        await expectSearchResultItemNameContent(page, {
          itemNames: [TEST_NATIVE_QUESTION_NAME, "Native Query"],
        });
      });

      test("should include results that contain native query data when the toggle is on", async ({
        page,
      }) => {
        const search = waitForSearchResponse(page);
        await page.goto(`/search?q=${TEST_NATIVE_QUESTION_NAME}`);
        await search;

        await expectSearchResultItemNameContent(page, {
          itemNames: [TEST_NATIVE_QUESTION_NAME],
        });

        await page
          .getByTestId("search_native_query-search-filter")
          .getByLabel("Search the contents of native queries", { exact: true })
          .click();

        await expect.poll(() => page.url()).toContain("search_native_query=true");

        await expectSearchResultItemNameContent(page, {
          itemNames: [TEST_NATIVE_QUESTION_NAME, "Native Query"],
        });
      });

      test("should not include results that contain native query data if the toggle is off", async ({
        page,
      }) => {
        const search = waitForSearchResponse(page);
        await page.goto(
          `/search?q=${TEST_NATIVE_QUESTION_NAME}&search_native_query=true`,
        );
        await search;

        await expectSearchResultItemNameContent(page, {
          itemNames: [TEST_NATIVE_QUESTION_NAME, "Native Query"],
        });

        await page
          .getByTestId("search_native_query-search-filter")
          .getByLabel("Search the contents of native queries", { exact: true })
          .click();

        await expectSearchResultItemNameContent(page, {
          itemNames: [TEST_NATIVE_QUESTION_NAME],
        });
      });
    });

    test.describe("personal collection filter", () => {
      test.beforeEach(async ({ mb }) => {
        // Create a question in admin's personal collection
        await createQuestion(mb.api, {
          name: "Admin Personal Question [keyword]",
          query: { "source-table": ORDERS_ID, limit: 1 },
          collection_id: ADMIN_PERSONAL_COLLECTION_ID,
        });

        // Create a question in normal user's personal collection
        await mb.signInAsNormalUser();
        await createQuestion(mb.api, {
          name: "Normal User Personal Question [keyword]",
          query: { "source-table": ORDERS_ID, limit: 1 },
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        });
        await mb.signInAsAdmin();
      });

      test("should hydrate personal collection filter", async ({ page }) => {
        const search = waitForSearchResponse(page);
        await page.goto(
          "/search?q=keyword&filter_items_in_personal_collection=all",
        );
        await search;

        await expect(
          page
            .getByTestId("filter_items_in_personal_collection-search-filter")
            .getByRole("switch"),
        ).toBeChecked();

        await expectSearchResultItemNameContent(page, {
          itemNames: [
            "Admin Personal Question [keyword]",
            "Normal User Personal Question [keyword]",
          ],
        });
      });

      test("should not be exposed to non-admins", async ({ page, mb }) => {
        await mb.signInAsNormalUser();
        const search = waitForSearchResponse(page);
        await page.goto(
          "/search?q=keyword&filter_items_in_personal_collection=all",
        );
        await search;
        await expectSearchResultItemNameContent(page, {
          itemNames: ["Normal User Personal Question [keyword]"],
        });
        await expect(
          page.getByTestId(
            "filter_items_in_personal_collection-search-filter",
          ),
        ).toHaveCount(0);
      });

      test("should include other users' personal collection items when filter is turned on", async ({
        page,
      }) => {
        const search = waitForSearchResponse(page);
        await page.goto("/search?q=keyword");
        await search;

        // Should only see own personal items when filter is off
        await expectSearchResultItemNameContent(page, {
          itemNames: ["Admin Personal Question [keyword]"],
        });

        // Turn on personal collection filter
        const personalFilter = page.getByTestId(
          "filter_items_in_personal_collection-search-filter",
        );
        await expect(personalFilter.getByRole("switch")).not.toBeChecked();
        await personalFilter.click();
        await expect(personalFilter.getByRole("switch")).toBeChecked();

        await expect.poll(() => page.url()).toContain(
          "filter_items_in_personal_collection=all",
        );

        // Should see own and other users' items when filter is on
        await expectSearchResultItemNameContent(page, {
          itemNames: [
            "Admin Personal Question [keyword]",
            "Normal User Personal Question [keyword]",
          ],
        });
      });
    });

    test.describe("trashed items filter", () => {
      test("should only show items in the trash", async ({ page, mb }) => {
        await page.goto("/search?q=First");
        await expect(page.getByTestId("search-result-item")).toHaveCount(1);
        await expect(
          page
            .getByTestId("search-result-item")
            .getByText("Collection", { exact: true }),
        ).toBeVisible();

        await page
          .getByTestId("archived-search-filter")
          .getByLabel("Search items in trash", { exact: true })
          .click();
        await expect(page.getByTestId("search-result-item")).toHaveCount(0);

        await archiveCollection(mb.api, FIRST_COLLECTION_ID);
        // The archive is indexed asynchronously; a one-shot reload can fire its
        // search before the trash entry exists (upstream rode on Cypress's
        // pacing). Reload until the trashed collection appears.
        await expect(async () => {
          await page.reload();
          await expect(page.getByTestId("search-result-item")).toHaveCount(1);
        }).toPass();
        // TODO: eventually re-enable when FE can properly identify the parent
        // collection
        // await expect(
        //   page.getByTestId("search-result-item").getByText("Trash", { exact: true }),
        // ).toBeVisible();
      });
    });

    test("should persist filters when the user changes the text query", async ({
      page,
    }) => {
      await page.goto("/search?q=orders");

      // add created_by filter
      await page.getByTestId("created_by-search-filter").click();
      await popover(page).getByText("Bobby Tables", { exact: true }).click();
      await popover(page).getByText("Apply", { exact: true }).click();

      // add last_edited_by filter
      await page.getByTestId("last_edited_by-search-filter").click();
      await popover(page).getByText("Bobby Tables", { exact: true }).click();
      await popover(page).getByText("Apply", { exact: true }).click();

      // add type filter
      await page.getByTestId("type-search-filter").click();
      await popover(page).getByText("Question", { exact: true }).click();
      await popover(page).getByText("Apply", { exact: true }).click();

      await expectSearchResultItemNameContent(page, {
        itemNames: [
          "Orders",
          "Orders, Count",
          "Orders, Count, Grouped by Created At (year)",
        ],
      });

      await commandPaletteSearch(page, "count");

      await expectSearchResultItemNameContent(page, {
        itemNames: [
          "Orders, Count",
          "Orders, Count, Grouped by Created At (year)",
        ],
      });
    });
  });
});
