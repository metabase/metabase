/**
 * Playwright port of e2e/test/scenarios/embedding/interactive-embedding.cy.spec.js
 *
 * Notes:
 * - Full-app embedding only activates inside an iframe; all app interaction
 *   goes through the FrameLocator returned by visitFullAppEmbeddingUrl
 *   (support/interactive-embedding.ts — a generalized copy of the
 *   support/search.ts harness; see the TODO(consolidation) there).
 * - The upstream beforeEach registers blanket intercepts (@getCardQuery,
 *   @getDashboard, …) consumed by the visit helpers → ported as
 *   waitForResponse registered inside each visit helper before navigation.
 *   The data-picker aliases (@getTableMetadata/@getCard) are consumed
 *   *after* their triggering actions (cy.wait drains a queue), so those are
 *   ported as ResponseQueue instances with the same record-then-pop
 *   semantics.
 * - postMessage tests observe/dispatch through the harness page, which is
 *   the embed's real window.parent (no cy.spy / hand-crafted MessageEvent
 *   needed — see support/interactive-embedding.ts).
 * - cy.task("signJwt") → local HS256 signer (node:crypto).
 * - @external tests (QA database containers) are gated on PW_QA_DB_ENABLED.
 */
import type { FrameLocator, Page, Response } from "@playwright/test";

import { resolveToken } from "../support/api";
import { test, expect } from "../support/fixtures";
import {
  ALL_USERS_GROUP,
  ResponseQueue,
  addLinkClickBehavior,
  appBar,
  assertTableRowsCount,
  clearRecordedPostMessages,
  createComment,
  createDashboardWithTabs,
  createDocument,
  createModelFromTableName,
  dashboardGrid,
  dashboardHeader,
  embedFrame,
  expectFrameHeightMessage,
  expectInputWithValue,
  exportDashcardCsv,
  getDashboardCard,
  getNotebookStep,
  getTextCardDetails,
  goToTab,
  icon,
  mockDashboardCard,
  mockRedirectResponse,
  modal,
  popover,
  postMessageToEmbed,
  sideNav,
  signJwt,
  updateCollectionGraph,
  updateDashboardCards,
  visitFullAppEmbeddingUrl,
} from "../support/interactive-embedding";
import { adhocQuestionHash } from "../support/native-editor";
import { NORMAL_PERSONAL_COLLECTION_ID } from "../support/onboarding";
import { signInWithCachedSession } from "../support/permissions";
import { SECOND_COLLECTION_ID } from "../support/question-new";
import {
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  THIRD_COLLECTION_ID,
  USERS,
} from "../support/sample-data";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const QA_DB_SKIP_MESSAGE =
  "@external — requires the QA database containers (set PW_QA_DB_ENABLED)";

// Upstream runs at Cypress's configured viewport (1280x800). playwright.config
// sets that too, but its chromium project spreads `devices["Desktop Chrome"]`,
// whose own `viewport: {width: 1280, height: 720}` overrides the global `use`
// — so the suite actually runs 80px shorter than Cypress. This spec asserts on
// exact viewport-derived numbers (the `frame` message reports height 800), so
// it pins the upstream viewport explicitly. See
// findings-inbox/interactive-embedding.md — the config itself wants fixing, but
// not from inside one spec's port while other slots are mid-run.
test.use({ viewport: { width: 1280, height: 800 } });

// === response predicates (the upstream beforeEach intercepts) ===

const isCardQuery = (response: Response) =>
  response.request().method() === "POST" &&
  /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname);

const isDashcardQuery = (response: Response) =>
  response.request().method() === "POST" &&
  /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/.test(
    new URL(response.url()).pathname,
  );

const isGetDashboard = (response: Response) =>
  response.request().method() === "GET" &&
  /^\/api\/dashboard\/\d+$/.test(new URL(response.url()).pathname);

const isXrayDashboard = (response: Response) =>
  response.request().method() === "GET" &&
  new URL(response.url()).pathname.startsWith("/api/automagic-dashboards/");

const isTableMetadata = (response: Response) =>
  response.request().method() === "GET" &&
  /^\/api\/table\/[^/]+\/query_metadata$/.test(
    new URL(response.url()).pathname,
  );

const isGetCard = (response: Response) =>
  response.request().method() === "GET" &&
  /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname);

type UrlOptions = {
  url: string;
  qs?: Record<string, string | number | boolean>;
};

// === the spec-local visit helpers (visit + consume the blanket alias) ===

async function visitQuestionUrl(
  page: Page,
  baseUrl: string,
  urlOptions: UrlOptions,
): Promise<FrameLocator> {
  const cardQuery = page.waitForResponse(isCardQuery);
  const frame = await visitFullAppEmbeddingUrl(page, { ...urlOptions, baseUrl });
  await cardQuery;
  return frame;
}

async function visitDashboardUrl(
  page: Page,
  baseUrl: string,
  urlOptions: UrlOptions,
): Promise<FrameLocator> {
  const dashboard = page.waitForResponse(isGetDashboard);
  const dashcardQuery = page.waitForResponse(isDashcardQuery);
  const frame = await visitFullAppEmbeddingUrl(page, { ...urlOptions, baseUrl });
  await dashboard;
  await dashcardQuery;
  return frame;
}

async function visitXrayDashboardUrl(
  page: Page,
  baseUrl: string,
  urlOptions: UrlOptions,
): Promise<FrameLocator> {
  const xray = page.waitForResponse(isXrayDashboard);
  const frame = await visitFullAppEmbeddingUrl(page, { ...urlOptions, baseUrl });
  await xray;
  return frame;
}

test.describe("scenarios > embedding > full app", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "pro-self-hosted token required (set MB_PRO_SELF_HOSTED_TOKEN)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test.describe("home page navigation", () => {
    test("should show the top and side nav by default", async ({
      page,
      mb,
    }) => {
      const xray = page.waitForResponse(isXrayDashboard);
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        baseUrl: mb.baseUrl,
      });
      await xray;

      await expect(appBar(frame)).toBeVisible();
      await expect(appBar(frame).getByTestId("main-logo")).toBeVisible();
      await expect(
        appBar(frame).getByRole("button", { name: /New/ }),
      ).toHaveCount(0);
      await expect(
        appBar(frame).getByPlaceholder("Search", { exact: true }),
      ).toHaveCount(0);

      await expect(sideNav(frame)).toBeVisible();
    });

    test("should hide the top nav when nothing is shown", async ({
      page,
      mb,
    }) => {
      const xray = page.waitForResponse(isXrayDashboard);
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        qs: { side_nav: false, logo: false },
        baseUrl: mb.baseUrl,
      });
      await xray;
      await expect(appBar(frame)).toHaveCount(0);
    });

    test("should hide the top nav by an explicit param", async ({
      page,
      mb,
    }) => {
      const xray = page.waitForResponse(isXrayDashboard);
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        qs: { top_nav: false },
        baseUrl: mb.baseUrl,
      });
      await xray;
      await expect(appBar(frame)).toHaveCount(0);
    });

    test("should not hide the top nav when the logo is still visible", async ({
      page,
      mb,
    }) => {
      const frame = await visitQuestionUrl(page, mb.baseUrl, {
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { breadcrumbs: false },
      });

      await expect(appBar(frame).getByTestId("main-logo")).toBeVisible();
      await expect(
        appBar(frame).getByRole("treeitem", {
          name: "Our analytics",
          exact: true,
        }),
      ).toHaveCount(0);
    });

    test("should keep showing sidebar toggle button when logo, breadcrumbs, the new button, and search are hidden", async ({
      page,
      mb,
    }) => {
      const xray = page.waitForResponse(isXrayDashboard);
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        qs: {
          logo: false,
          breadcrumbs: false,
          search: false,
          new_button: false,
        },
        baseUrl: mb.baseUrl,
      });
      await xray;

      await expect(sideNav(frame)).toBeVisible();
      await expect(appBar(frame)).toBeVisible();
      await appBar(frame)
        .getByRole("button", { name: "Toggle sidebar", exact: true })
        .click();
      await expect(sideNav(frame)).not.toBeVisible();
    });

    test("should hide the side nav by a param", async ({ page, mb }) => {
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        qs: { side_nav: false },
        baseUrl: mb.baseUrl,
      });
      await expect(appBar(frame).getByTestId("main-logo")).toBeVisible();
      await expect(
        appBar(frame).getByRole("button", {
          name: "Toggle sidebar",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(sideNav(frame)).toHaveCount(0);
    });

    test("should disable home link when top nav is enabled but side nav is disabled", async ({
      page,
      mb,
    }) => {
      const frame = await visitDashboardUrl(page, mb.baseUrl, {
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
        qs: { top_nav: true, side_nav: false },
      });
      // Upstream asserts `have.attr("disabled", "disabled")`. jQuery returns
      // the *name* of a boolean attribute when it's present, so that assertion
      // only means "the attribute exists" — the real DOM value is "".
      await expect(frame.getByTestId("main-logo-link")).toHaveAttribute(
        "disabled",
      );
    });

    test("should show question creation controls by a param", async ({
      page,
      mb,
    }) => {
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        qs: { new_button: true },
        baseUrl: mb.baseUrl,
      });
      await expect(
        appBar(frame).getByRole("button", { name: /New/ }),
      ).toBeVisible();
    });

    test("should show search controls by a param", async ({ page, mb }) => {
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        qs: { search: true },
        baseUrl: mb.baseUrl,
      });
      await expect(
        appBar(frame).getByPlaceholder("Search…", { exact: true }),
      ).toBeVisible();
    });

    test("should preserve params when navigating", async ({ page, mb }) => {
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        qs: { search: true },
        baseUrl: mb.baseUrl,
      });

      await expect(
        appBar(frame).getByPlaceholder("Search…", { exact: true }),
      ).toBeVisible();

      await sideNav(frame)
        .getByText("Our analytics", { exact: true })
        .click();

      await expect(
        frame
          .getByRole("rowgroup")
          .filter({ hasText: /Orders in a dashboard/ })
          .first(),
      ).toBeVisible();

      await expect(
        appBar(frame).getByPlaceholder("Search…", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("browse data", () => {
    test("should hide the top nav when nothing is shown", async ({
      page,
      mb,
    }) => {
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: "/browse/databases",
        qs: { side_nav: false, logo: false },
        baseUrl: mb.baseUrl,
      });
      await expect(
        frame.getByRole("heading", { name: /Databases/ }),
      ).toBeVisible();
      await expect(
        frame.getByRole("treeitem", { name: /Browse databases/ }),
      ).toHaveCount(0);
      await expect(
        frame.getByRole("treeitem", { name: "Our analytics", exact: true }),
      ).toHaveCount(0);
      await expect(appBar(frame)).toHaveCount(0);
    });
  });

  test.describe("questions", () => {
    test("should show the question header by default", async ({
      page,
      mb,
    }) => {
      const frame = await visitQuestionUrl(page, mb.baseUrl, {
        url: "/question/" + ORDERS_QUESTION_ID,
      });

      await expect(frame.getByTestId("qb-header")).toBeVisible();
      await frame.getByTestId("qb-header-left-side").hover();
      await expect(
        frame.getByRole("button", { name: /Edited/ }),
      ).toBeVisible();

      // Two .Icon-refresh exist (header run button + run-button-overlay).
      // cy.icon(...).should("be.visible") asserts via jQuery .is(), which is
      // "any match", so first-match is the faithful equivalent.
      await expect(icon(frame, "refresh").first()).toBeVisible();
      await expect(frame.getByTestId("notebook-button")).toBeVisible();
      await expect(
        frame.getByTestId("qb-header").getByRole("button", {
          name: /Summarize/,
        }),
      ).toBeVisible();
      await expect(
        frame.getByTestId("qb-header").getByRole("button", { name: /Filter/ }),
      ).toBeVisible();
    });

    test("should hide the question header by a param", async ({
      page,
      mb,
    }) => {
      const frame = await visitQuestionUrl(page, mb.baseUrl, {
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { header: false },
      });

      await expect(frame.getByTestId("qb-header")).toHaveCount(0);
    });

    test("should hide the question's additional info by a param", async ({
      page,
      mb,
    }) => {
      const frame = await visitQuestionUrl(page, mb.baseUrl, {
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { additional_info: false },
      });

      await expect(
        frame
          .getByTestId("app-bar")
          .getByText("Our analytics", { exact: true }),
      ).toBeVisible();
      await expect(
        frame.getByTestId("qb-header").getByText(/Edited/),
      ).toHaveCount(0);
    });

    test("should hide the question's action buttons by a param", async ({
      page,
      mb,
    }) => {
      const frame = await visitQuestionUrl(page, mb.baseUrl, {
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { action_buttons: false },
      });

      // See the header test above — .Icon-refresh matches twice.
      await expect(icon(frame, "refresh").first()).toBeVisible();
      await expect(frame.getByTestId("notebook-button")).toHaveCount(0);
      await expect(
        frame.getByRole("button", { name: /Summarize/ }),
      ).toHaveCount(0);
      await expect(frame.getByRole("button", { name: /Filter/ })).toHaveCount(
        0,
      );
    });

    test("should send 'X-Metabase-Client' header for api requests", async ({
      page,
      mb,
    }) => {
      const cardQuery = page.waitForResponse(isCardQuery);
      await visitFullAppEmbeddingUrl(page, {
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { action_buttons: false },
        baseUrl: mb.baseUrl,
      });

      const headers = await (await cardQuery).request().allHeaders();
      expect(headers["x-metabase-client"]).toBe("embedding-iframe-full-app");
    });

    test.describe("question creation", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.signOut();
        await mb.signInAsNormalUser();
      });

      test("should allow to create a new question from the navbar (metabase#21511)", async ({
        page,
        mb,
      }) => {
        // Simple data picker
        let frame = await visitFullAppEmbeddingUrl(page, {
          url: "/collection/root",
          qs: { top_nav: true, new_button: true, side_nav: false },
          baseUrl: mb.baseUrl,
        });

        await frame.getByRole("button", { name: "New", exact: true }).click();
        await popover(frame).getByText("Question", { exact: true }).click();
        await popover(frame).getByText("Orders", { exact: true }).click();

        // Multi-stage data picker
        frame = await visitFullAppEmbeddingUrl(page, {
          url: "/collection/root",
          qs: {
            top_nav: true,
            new_button: true,
            side_nav: false,
            data_picker: "staged",
          },
          baseUrl: mb.baseUrl,
        });

        await frame.getByRole("button", { name: "New", exact: true }).click();
        await popover(frame).getByText("Question", { exact: true }).click();
        await popover(frame).getByText("Raw Data", { exact: true }).click();
        await popover(frame).getByText("Orders", { exact: true }).click();
      });

      test("should show the database for a new native question (metabase#21511)", async ({
        page,
        mb,
      }) => {
        const newQuestionQuery = {
          dataset_query: {
            database: null,
            native: {
              query: "",
            },
            type: "native",
          },
          visualization_settings: {},
        };

        const frame = await visitFullAppEmbeddingUrl(page, {
          url: `/question#${adhocQuestionHash(newQuestionQuery)}`,
          qs: { side_nav: false },
          baseUrl: mb.baseUrl,
        });

        await expect(
          frame
            .getByTestId("native-query-editor-container")
            .getByText(/Sample Database/),
        ).toBeVisible();
      });
    });

    test.describe("desktop logo", () => {
      // This can't be unit test in AppBar since the logic to hide the AppBar is in its parent component
      test("should hide main header when there's nothing to display there", async ({
        page,
        mb,
      }) => {
        const frame = await visitQuestionUrl(page, mb.baseUrl, {
          url: "/question/" + ORDERS_QUESTION_ID,
          qs: { side_nav: false, logo: false, breadcrumbs: false },
        });
        await expectInputWithValue(frame, "Orders");
        await expect(frame.getByTestId("app-bar")).toHaveCount(0);
        await expect(frame.getByTestId("main-logo")).toHaveCount(0);
        await expect(icon(frame, "sidebar_closed")).toHaveCount(0);
        await expect(
          frame.getByRole("button", { name: "Toggle sidebar", exact: true }),
        ).toHaveCount(0);
      });
    });

    test.describe("mobile logo", () => {
      test.beforeEach(async ({ page }) => {
        // cy.viewport("iphone-x")
        await page.setViewportSize({ width: 375, height: 812 });
      });

      // This can't be unit test in AppBar since the logic to hide the AppBar is in its parent component
      test("should hide main header when there's nothing to display there", async ({
        page,
        mb,
      }) => {
        const frame = await visitQuestionUrl(page, mb.baseUrl, {
          url: "/question/" + ORDERS_QUESTION_ID,
          qs: { side_nav: false, logo: false, breadcrumbs: false },
        });
        await expectInputWithValue(frame, "Orders");
        await expect(frame.getByTestId("app-bar")).toHaveCount(0);
        await expect(frame.getByTestId("main-logo")).toHaveCount(0);
        await expect(icon(frame, "sidebar_closed")).toHaveCount(0);
        await expect(
          frame.getByRole("button", { name: "Toggle sidebar", exact: true }),
        ).toHaveCount(0);
      });
    });
  });

  test.describe("notebook simple data picker", () => {
    const ordersCardDetails = {
      name: "Card",
      type: "question",
      query: {
        "source-table": ORDERS_ID,
      },
    };

    let tableMetadataQueue: ResponseQueue;
    let cardQueue: ResponseQueue;

    test.beforeEach(async ({ page, mb }) => {
      await mb.signInAsNormalUser();
      cardQueue = new ResponseQueue(page, isGetCard, "getCard");
      tableMetadataQueue = new ResponseQueue(
        page,
        isTableMetadata,
        "getTableMetadata",
      );
    });

    async function startNewEmbeddingQuestion(
      page: Page,
      baseUrl: string,
      searchParameters: Record<string, string | number | boolean> = {},
    ): Promise<FrameLocator> {
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        qs: { new_button: true, ...searchParameters },
        baseUrl,
      });
      await frame.getByRole("button", { name: "New", exact: true }).click();
      await popover(frame).getByText("Question", { exact: true }).click();
      return frame;
    }

    function selectDataSource(frame: FrameLocator, dataSource: string) {
      return popover(frame)
        .getByRole("link", { name: dataSource, exact: true })
        .click();
    }

    /** When using a QA database, the first option is the QA db's table. */
    function selectFirstDataSource(frame: FrameLocator, dataSource: string) {
      return popover(frame)
        .getByRole("link", { name: dataSource, exact: true })
        .first()
        .click();
    }

    function clickOnDataSource(frame: FrameLocator, sourceName: string) {
      return getNotebookStep(frame, "data")
        .getByText(sourceName, { exact: true })
        .click();
    }

    async function verifyTableSelected({
      tableName,
      schemaName,
      databaseName,
    }: {
      tableName: string;
      schemaName?: string;
      databaseName?: string;
    }) {
      const response = await tableMetadataQueue.next();
      const body = await response.json();
      expect(body.display_name).toBe(tableName);
      if (schemaName) {
        expect(body.schema).toBe(schemaName);
      }
      if (databaseName) {
        expect(body.db.name).toBe(databaseName);
      }
    }

    async function verifyCardSelected({
      cardName,
      collectionName,
    }: {
      cardName: string;
      collectionName: string;
    }) {
      const response = await cardQueue.next();
      const body = await response.json();
      expect(body.name).toBe(cardName);
      expect(body.collection.name).toBe(collectionName);
    }

    /** Port of `H.popover().should("not.contain", name)`, anchored on the
     * picker being populated first (Cypress could pass on an empty popover). */
    async function expectDataSourceAbsent(frame: FrameLocator, name: string) {
      await expect(popover(frame).getByRole("link").first()).toBeVisible();
      await expect(
        popover(frame).getByText(name, { exact: true }),
      ).toHaveCount(0);
    }

    test('should respect "entity_types" search parameter (EMB-272)', async ({
      page,
      mb,
    }) => {
      // test default `entity_types`
      let frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
      await expect(
        popover(frame).getByRole("link", { name: "Reviews", exact: true }),
      ).toBeVisible();
      await expect(
        popover(frame).getByRole("link", {
          name: "Orders Model",
          exact: true,
        }),
      ).toBeVisible();

      // test `entity_types=["table"]`
      frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
        entity_types: "table",
      });
      await expect(
        popover(frame).getByRole("link", { name: "Reviews", exact: true }),
      ).toBeVisible();
      await expect(
        popover(frame).getByRole("link", {
          name: "Orders Model",
          exact: true,
        }),
      ).toHaveCount(0);

      // test `entity_types=["model"]`
      frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
        entity_types: "model",
      });
      await expect(
        popover(frame).getByRole("link", {
          name: "Orders Model",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        popover(frame).getByRole("link", { name: "Reviews", exact: true }),
      ).toHaveCount(0);

      // test `entity_types=["question"]` — question should be ignored, and
      // the default value ["model", "table"] used (metabase#58357)
      await mb.api.createQuestion(ordersCardDetails);
      frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
        entity_types: "question",
      });
      await expect(
        popover(frame).getByRole("link", { name: "Reviews", exact: true }),
      ).toBeVisible();
      await expect(
        popover(frame).getByRole("link", {
          name: "Orders Model",
          exact: true,
        }),
      ).toBeVisible();
      // Questions shouldn't be shown
      await expect(
        popover(frame).getByRole("link", { name: "Card", exact: true }),
      ).toHaveCount(0);
    });

    test.describe("table", () => {
      test("should select a table in the only database", async ({
        page,
        mb,
      }) => {
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectDataSource(frame, "Products");
        await clickOnDataSource(frame, "Products");
        await verifyTableSelected({
          tableName: "Products",
          databaseName: "Sample Database",
        });
      });

      test("should select a table when there are multiple databases", async ({
        page,
        mb,
      }) => {
        test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_MESSAGE);
        await mb.restore("postgres-12");
        await mb.signInAsAdmin();
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectFirstDataSource(frame, "Orders");

        // assert that even after selecting a data source from one database,
        // the data picker still shows the other data sources database
        await frame.getByTestId("data-step-cell").click();
        await expect(popover(frame).getByRole("link")).toHaveCount(13);

        // close the data picker popover
        await frame.getByTestId("data-step-cell").click();

        // assert that the data sources should be filtered by the selected
        // database from the starting data source.
        await getNotebookStep(frame, "data")
          .getByRole("button", { name: "Join data", exact: true })
          .click();
        await expect(popover(frame).getByRole("link")).toHaveCount(8);
        await selectDataSource(frame, "Accounts");

        await verifyTableSelected({
          tableName: "Orders",
          databaseName: "QA Postgres12",
        });
        await verifyTableSelected({
          tableName: "Accounts",
          databaseName: "QA Postgres12",
        });
      });

      test("should select a table in a schema-less database", async ({
        page,
        mb,
      }) => {
        test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_MESSAGE);
        await mb.restore("mysql-8");
        await mb.signInAsAdmin();
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectFirstDataSource(frame, "Reviews");
        await verifyTableSelected({
          tableName: "Reviews",
          databaseName: "QA MySQL8",
        });
      });

      test("should select a table when there are multiple schemas", async ({
        page,
        mb,
      }) => {
        test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_MESSAGE);
        const { resetTestTableMultiSchema } = await import(
          "../support/data-model"
        );
        await mb.restore("postgres-writable");
        await resetTestTableMultiSchema();
        await mb.signInAsAdmin();
        await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectDataSource(frame, "Birds");
        await verifyTableSelected({
          tableName: "Birds",
          schemaName: "Wild",
          databaseName: "Writable Postgres12",
        });
      });

      test("should be able to join a table when the data source is a table", async ({
        page,
        mb,
      }) => {
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectDataSource(frame, "Orders");
        await getNotebookStep(frame, "data")
          .getByRole("button", { name: "Join data", exact: true })
          .click();
        await popover(frame).getByText("Products", { exact: true }).click();
        await verifyTableSelected({
          tableName: "Orders",
          databaseName: "Sample Database",
        });
        await verifyTableSelected({
          tableName: "Products",
          databaseName: "Sample Database",
        });
      });

      test("should not be able to select a question as a data source", async ({
        page,
        mb,
      }) => {
        await mb.api.createQuestion(ordersCardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await expectDataSourceAbsent(frame, ordersCardDetails.name);
      });
    });

    test.describe("question", () => {
      const cardType = "question";

      test("should not be able to select a data source in the root collection", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: undefined,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await expectDataSourceAbsent(frame, cardDetails.name);
      });

      test("should not be able to select a data source in a regular collection", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: FIRST_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await expectDataSourceAbsent(frame, cardDetails.name);
      });

      test("should not be able to select a data source in a nested collection", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: SECOND_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await expectDataSourceAbsent(frame, cardDetails.name);
      });

      test("should not be able to select a data source in a personal collection", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await expectDataSourceAbsent(frame, cardDetails.name);
      });

      test("should not be able to select a data source in another user personal collection", async ({
        page,
        mb,
      }) => {
        await mb.signInAsAdmin();
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await expectDataSourceAbsent(frame, cardDetails.name);
      });

      test("should not be able to select a data source when there is no access to the root collection", async ({
        page,
        mb,
        context,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: FIRST_COLLECTION_ID,
        };

        await mb.signInAsAdmin();
        await mb.api.createQuestion(cardDetails);
        // grant `nocollection` user access to `First collection`
        await updateCollectionGraph(mb.api, {
          [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
        });

        await signInWithCachedSession(context, "nocollection");
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await expectDataSourceAbsent(frame, cardDetails.name);
      });

      test("should not be able to select a data source when there is no access to the immediate parent collection", async ({
        page,
        mb,
        context,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: THIRD_COLLECTION_ID,
        };

        await mb.signInAsAdmin();
        await mb.api.createQuestion(cardDetails);
        await updateCollectionGraph(mb.api, {
          [ALL_USERS_GROUP]: {
            [FIRST_COLLECTION_ID]: "read",
            [THIRD_COLLECTION_ID]: "read",
          },
        });

        await signInWithCachedSession(context, "nocollection");
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await expectDataSourceAbsent(frame, cardDetails.name);
      });

      test("should not be able to join a card when the data source is a table", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: FIRST_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectDataSource(frame, "Products");
        await getNotebookStep(frame, "data")
          .getByRole("button", { name: "Join data", exact: true })
          .click();
        await expectDataSourceAbsent(frame, cardDetails.name);
      });
    });

    test.describe("model", () => {
      const cardType = "model";

      test("should select a data source in the root collection", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: undefined,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await popover(frame)
          .getByRole("link", { name: cardDetails.name, exact: true })
          .click();
        await verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Our analytics",
        });
      });

      test("should select a data source in a regular collection", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: FIRST_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectDataSource(frame, cardDetails.name);
        await verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "First collection",
        });
      });

      test("should select a data source in a nested collection", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: SECOND_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectDataSource(frame, cardDetails.name);
        await verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Second collection",
        });
      });

      test("should select a data source in a personal collection", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectDataSource(frame, cardDetails.name);
        await verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Robert Tableton's Personal Collection",
        });
      });

      test("should select a data source in another user personal collection", async ({
        page,
        mb,
      }) => {
        await mb.signInAsAdmin();
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectDataSource(frame, cardDetails.name);
        await verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Robert Tableton's Personal Collection",
        });
      });

      test("should select a data source when there is no access to the root collection", async ({
        page,
        mb,
        context,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: FIRST_COLLECTION_ID,
        };

        await mb.signInAsAdmin();
        await mb.api.createQuestion(cardDetails);
        // grant `nocollection` user access to `First collection`
        await updateCollectionGraph(mb.api, {
          [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
        });

        await signInWithCachedSession(context, "nocollection");
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectDataSource(frame, cardDetails.name);
        await verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "First collection",
        });
      });

      test("should select a data source when there is no access to the immediate parent collection", async ({
        page,
        mb,
        context,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: THIRD_COLLECTION_ID,
        };

        await mb.signInAsAdmin();
        await mb.api.createQuestion(cardDetails);
        await updateCollectionGraph(mb.api, {
          [ALL_USERS_GROUP]: {
            [FIRST_COLLECTION_ID]: "read",
            [THIRD_COLLECTION_ID]: "read",
          },
        });

        await signInWithCachedSession(context, "nocollection");
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectDataSource(frame, cardDetails.name);
        await verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Third collection",
        });
      });

      test("should be able to join a card when the data source is a table", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: FIRST_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl);
        await selectDataSource(frame, "Products");
        await getNotebookStep(frame, "data")
          .getByRole("button", { name: "Join data", exact: true })
          .click();
        await selectDataSource(frame, cardDetails.name);
        await verifyTableSelected({
          tableName: "Products",
          databaseName: "Sample Database",
        });
        await verifyTableSelected({
          tableName: cardDetails.name,
        });
      });
    });
  });

  test.describe("notebook multi-stage data picker", () => {
    const ordersCardDetails = {
      name: "Card",
      type: "question",
      query: {
        "source-table": ORDERS_ID,
      },
    };

    const ordersCountCardDetails = {
      name: "Card",
      type: "question",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    };

    const cardTypeToLabel: Record<string, string> = {
      question: "Saved Questions",
      model: "Models",
      metric: "Metrics",
    };

    let tableMetadataQueue: ResponseQueue;
    let cardQueue: ResponseQueue;

    test.beforeEach(async ({ page, mb }) => {
      await mb.signInAsNormalUser();
      cardQueue = new ResponseQueue(page, isGetCard, "getCard");
      tableMetadataQueue = new ResponseQueue(
        page,
        isTableMetadata,
        "getTableMetadata",
      );
    });

    async function startNewEmbeddingQuestion(
      page: Page,
      baseUrl: string,
      {
        isMultiStageDataPicker = false,
        searchParameters = {},
      }: {
        isMultiStageDataPicker?: boolean;
        searchParameters?: Record<string, string | number | boolean>;
      } = {},
    ): Promise<FrameLocator> {
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        qs: {
          new_button: true,
          ...(isMultiStageDataPicker && { data_picker: "staged" }),
          ...searchParameters,
        },
        baseUrl,
      });
      await frame.getByRole("button", { name: "New", exact: true }).click();
      await popover(frame).getByText("Question", { exact: true }).click();
      return frame;
    }

    async function selectTable(
      frame: FrameLocator,
      {
        tableName,
        schemaName,
        databaseName,
      }: { tableName: string; schemaName?: string; databaseName?: string },
    ) {
      await popover(frame).getByText("Raw Data", { exact: true }).click();
      if (databaseName) {
        await popover(frame).getByText(databaseName, { exact: true }).click();
      }
      if (schemaName) {
        await popover(frame).getByText(schemaName, { exact: true }).click();
      }
      await popover(frame).getByText(tableName, { exact: true }).click();
      await tableMetadataQueue.next();
    }

    async function selectCard(
      frame: FrameLocator,
      {
        cardName,
        cardType,
        collectionNames,
      }: { cardName: string; cardType: string; collectionNames: string[] },
    ) {
      await popover(frame)
        .getByText(cardTypeToLabel[cardType], { exact: true })
        .click();
      for (const collectionName of collectionNames) {
        await popover(frame)
          .getByText(collectionName, { exact: true })
          .click();
      }
      await popover(frame).getByText(cardName, { exact: true }).click();
      await tableMetadataQueue.next();
      if (cardType !== "metric") {
        await cardQueue.next();
      }
    }

    function clickOnDataSource(frame: FrameLocator, sourceName: string) {
      return getNotebookStep(frame, "data")
        .getByText(sourceName, { exact: true })
        .click();
    }

    function clickOnJoinDataSource(frame: FrameLocator, sourceName: string) {
      return getNotebookStep(frame, "join")
        .getByLabel("Right table")
        .getByText(sourceName, { exact: true })
        .click();
    }

    async function verifyTableSelected(
      frame: FrameLocator,
      {
        tableName,
        schemaName,
        databaseName,
      }: { tableName: string; schemaName?: string; databaseName?: string },
    ) {
      await expect(
        popover(frame).getByLabel(tableName, { exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      if (schemaName) {
        await expect(
          popover(frame).getByText(schemaName, { exact: true }),
        ).toBeVisible();
      }
      if (databaseName) {
        await expect(
          popover(frame).getByText(databaseName, { exact: true }),
        ).toBeVisible();
      }
    }

    async function verifyCardSelected(
      frame: FrameLocator,
      { cardName, collectionName }: { cardName: string; collectionName: string },
    ) {
      await expect(
        popover(frame).getByText(collectionName, { exact: true }),
      ).toBeVisible();
      await expect(
        popover(frame).getByLabel(cardName, { exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    }

    /**
     * Go back from the table selector to the bucket step (where it shows
     * "Raw Data" and "Models"). This step only shows when there is more than
     * one option in the bucket step — i.e. when there are both selectable
     * models and tables for the current user.
     */
    async function goBackToBucketStep(
      frame: FrameLocator,
      fromStep: "from-table" | "from-model" = "from-table",
    ) {
      await icon(popover(frame), "chevronleft").click();
      if (fromStep === "from-table") {
        await icon(popover(frame), "chevronleft").click();
      }
    }

    const waitForSavedDatabases = (page: Page) =>
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname === "/api/database" &&
          url.searchParams.get("saved") === "true"
        );
      });

    test('should respect "entity_types" search parameter (EMB-228)', async ({
      page,
      mb,
    }) => {
      // test `entity_types=["table"]`
      const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
        isMultiStageDataPicker: true,
        searchParameters: { entity_types: "table" },
      });
      /**
       * When we're in table step, it means we don't show models, otherwise,
       * we would have shown the bucket step which has "Raw Data" and
       * "Models" options instead.
       */
      await expect(
        popover(frame).getByText("Sample Database", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(frame).getByRole("heading", { name: "Orders", exact: true }),
      ).toBeVisible();

      // We don't have to test every permutations here because we already
      // cover those cases in `EmbeddingDataPicker.unit.spec.tsx`
    });

    test.describe("table", () => {
      test("should select a table in the only database", async ({
        page,
        mb,
      }) => {
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectTable(frame, { tableName: "Products" });
        await clickOnDataSource(frame, "Products");
        await verifyTableSelected(frame, {
          tableName: "Products",
          databaseName: "Sample Database",
        });
      });

      test("should select a table when there are multiple databases (metabase#54127)", async ({
        page,
        mb,
      }) => {
        test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_MESSAGE);
        await mb.restore("postgres-12");
        await mb.signInAsAdmin();
        await createModelFromTableName(mb.api, {
          tableName: "orders",
          modelName: "Orders Model (Postgres)",
        });
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectTable(frame, {
          tableName: "Orders",
          databaseName: "QA Postgres12",
        });
        await clickOnDataSource(frame, "Orders");
        await verifyTableSelected(frame, {
          tableName: "Orders",
          databaseName: "QA Postgres12",
        });

        // assert that even after selecting a data source from one database,
        // the data picker still shows the other data sources database
        await icon(popover(frame), "chevronleft").click();
        await expect(
          popover(frame).getByRole("heading", {
            name: "Sample Database",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          popover(frame).getByRole("heading", {
            name: "QA Postgres12",
            exact: true,
          }),
        ).toBeVisible();

        await icon(popover(frame), "chevronleft").click();
        await popover(frame).getByText("Models", { exact: true }).click();
        await expect(
          popover(frame).getByText("Orders Model", { exact: true }),
        ).toBeVisible();
        await expect(
          popover(frame).getByText("Orders Model (Postgres)", {
            exact: true,
          }),
        ).toBeVisible();

        // close the data picker popover
        await frame.getByTestId("data-step-cell").click();

        // assert that the tables should be filtered by the selected database
        // from the starting data source.
        await getNotebookStep(frame, "data")
          .getByRole("button", { name: "Join data", exact: true })
          .click();
        await icon(popover(frame), "chevronleft").click();
        await expect(
          popover(frame).getByRole("heading", {
            name: "Sample Database",
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          popover(frame).getByRole("heading", {
            name: "QA Postgres12",
            exact: true,
          }),
        ).toBeVisible();

        // assert that the models should be filtered by the selected database
        // from the starting data source.
        await icon(popover(frame), "chevronleft").click();
        await popover(frame).getByText("Models", { exact: true }).click();
        await expect(
          popover(frame).getByText("Orders Model", { exact: true }),
        ).toHaveCount(0);
        await expect(
          popover(frame).getByText("Orders Model (Postgres)", {
            exact: true,
          }),
        ).toBeVisible();
      });

      test("should select a table in a schema-less database", async ({
        page,
        mb,
      }) => {
        test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_MESSAGE);
        await mb.restore("mysql-8");
        await mb.signInAsAdmin();
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectTable(frame, {
          tableName: "Reviews",
          databaseName: "QA MySQL8",
        });
        await clickOnDataSource(frame, "Reviews");
        await verifyTableSelected(frame, {
          tableName: "Reviews",
          databaseName: "QA MySQL8",
        });
      });

      test("should select a table when there are multiple schemas", async ({
        page,
        mb,
      }) => {
        test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_MESSAGE);
        const { resetTestTableMultiSchema } = await import(
          "../support/data-model"
        );
        await mb.restore("postgres-writable");
        await resetTestTableMultiSchema();
        await mb.signInAsAdmin();
        await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectTable(frame, {
          tableName: "Animals",
          schemaName: "Domestic",
          databaseName: "Writable Postgres12",
        });
        await clickOnDataSource(frame, "Animals");
        await verifyTableSelected(frame, {
          tableName: "Animals",
          schemaName: "Domestic",
          databaseName: "Writable Postgres12",
        });
      });

      test("should be able to join a table when the data source is a table", async ({
        page,
        mb,
      }) => {
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectTable(frame, { tableName: "Orders" });
        await getNotebookStep(frame, "data")
          .getByRole("button", { name: "Join data", exact: true })
          .click();
        await popover(frame).getByText("Products", { exact: true }).click();
        await clickOnJoinDataSource(frame, "Products");
        await verifyTableSelected(frame, {
          tableName: "Products",
          databaseName: "Sample Database",
        });
      });

      test("should be able to join a model when the data source is a table", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: FIRST_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectTable(frame, { tableName: "Products" });
        await getNotebookStep(frame, "data")
          .getByRole("button", { name: "Join data", exact: true })
          .click();
        await goBackToBucketStep(frame);
        await selectCard(frame, {
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: ["First collection"],
        });
        await clickOnJoinDataSource(frame, cardDetails.name);
        await verifyCardSelected(frame, {
          cardName: cardDetails.name,
          collectionName: "First collection",
        });
      });
    });

    test.describe("question", () => {
      test("should not be able to select a question", async ({
        page,
        mb,
      }) => {
        const databases = waitForSavedDatabases(page);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await databases;
        await expect(
          popover(frame).getByText("Models", { exact: true }),
        ).toBeVisible();
        await expect(
          popover(frame).getByText("Raw Data", { exact: true }),
        ).toBeVisible();
        await expect(
          popover(frame).getByText("Saved Questions", { exact: true }),
        ).toHaveCount(0);
      });
    });

    test.describe("model", () => {
      test("should select a data source in the root collection", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: undefined,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectCard(frame, {
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: [],
        });
        await clickOnDataSource(frame, ordersCardDetails.name);
        await verifyCardSelected(frame, {
          cardName: cardDetails.name,
          collectionName: "Our analytics",
        });
      });

      test("should select a data source in a regular collection", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: FIRST_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectCard(frame, {
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: ["First collection"],
        });
        await clickOnDataSource(frame, ordersCardDetails.name);
        await verifyCardSelected(frame, {
          cardName: cardDetails.name,
          collectionName: "First collection",
        });
      });

      test("should select a data source in a nested collection", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: SECOND_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectCard(frame, {
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: ["First collection", "Second collection"],
        });
        await clickOnDataSource(frame, ordersCardDetails.name);
        await verifyCardSelected(frame, {
          cardName: cardDetails.name,
          collectionName: "Second collection",
        });
      });

      test("should select a data source in a personal collection", async ({
        page,
        mb,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectCard(frame, {
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: ["Your personal collection"],
        });
        await clickOnDataSource(frame, ordersCardDetails.name);
        await verifyCardSelected(frame, {
          cardName: cardDetails.name,
          collectionName: "Your personal collection",
        });
      });

      test("should select a data source in another user personal collection", async ({
        page,
        mb,
      }) => {
        await mb.signInAsAdmin();
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        await mb.api.createQuestion(cardDetails);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectCard(frame, {
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: [
            "All personal collections",
            "Robert Tableton's Personal Collection",
          ],
        });
        await clickOnDataSource(frame, ordersCardDetails.name);
        await verifyCardSelected(frame, {
          cardName: cardDetails.name,
          collectionName: "Robert Tableton's Personal Collection",
        });
      });

      test("should select a data source when there is no access to the root collection", async ({
        page,
        mb,
        context,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: FIRST_COLLECTION_ID,
        };

        await mb.signInAsAdmin();
        await mb.api.createQuestion(cardDetails);
        // grant `nocollection` user access to `First collection`
        await updateCollectionGraph(mb.api, {
          [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
        });

        await signInWithCachedSession(context, "nocollection");
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectCard(frame, {
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: ["First collection"],
        });
        await clickOnDataSource(frame, ordersCardDetails.name);
        await verifyCardSelected(frame, {
          cardName: cardDetails.name,
          collectionName: "First collection",
        });
      });

      test("should select a data source when there is no access to the immediate parent collection", async ({
        page,
        mb,
        context,
      }) => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: THIRD_COLLECTION_ID,
        };

        await mb.signInAsAdmin();
        await mb.api.createQuestion(cardDetails);
        await updateCollectionGraph(mb.api, {
          [ALL_USERS_GROUP]: {
            [FIRST_COLLECTION_ID]: "read",
            [THIRD_COLLECTION_ID]: "read",
          },
        });

        await signInWithCachedSession(context, "nocollection");
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectCard(frame, {
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: ["Third collection"],
        });
        await clickOnDataSource(frame, ordersCardDetails.name);
        await verifyCardSelected(frame, {
          cardName: cardDetails.name,
          collectionName: "Third collection",
        });
      });

      test("should join a table when the data source is a model", async ({
        page,
        mb,
      }) => {
        // Orders Model already exists
        const ordersModelName = "Orders Model";
        const ordersCountModelDetails = {
          ...ordersCountCardDetails,
          name: "Orders Count Model",
          type: "model",
          collection_id: undefined,
        };
        await mb.api.createQuestion(ordersCountModelDetails);

        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectCard(frame, {
          cardName: ordersModelName,
          cardType: "model",
          collectionNames: [],
        });

        await getNotebookStep(frame, "data")
          .getByRole("button", { name: "Join data", exact: true })
          .click();
        await goBackToBucketStep(frame, "from-model");
        await selectCard(frame, {
          cardName: ordersCountModelDetails.name,
          cardType: "model",
          collectionNames: [],
        });

        // select join column
        await popover(frame)
          .getByRole("option", { name: "ID", exact: true })
          .click();
        await popover(frame)
          .getByRole("option", { name: "Count", exact: true })
          .click();

        await clickOnJoinDataSource(frame, ordersCountModelDetails.name);
        await verifyCardSelected(frame, {
          cardName: ordersCountModelDetails.name,
          collectionName: "Our analytics",
        });
      });

      test("should join a model when the data source is a model", async ({
        page,
        mb,
      }) => {
        // Orders Model already exists
        const ordersModelName = "Orders Model";

        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await selectCard(frame, {
          cardName: ordersModelName,
          cardType: "model",
          collectionNames: [],
        });

        await getNotebookStep(frame, "data")
          .getByRole("button", { name: "Join data", exact: true })
          .click();
        await goBackToBucketStep(frame, "from-model");

        await selectTable(frame, {
          tableName: "Products",
          databaseName: "Sample Database",
        });
        await clickOnJoinDataSource(frame, "Products");
        await verifyTableSelected(frame, {
          tableName: "Products",
          databaseName: "Sample Database",
        });
      });
    });

    test.describe("metric", () => {
      test.beforeEach(async ({ mb }) => {
        const cardDetails = {
          ...ordersCountCardDetails,
          type: "metric",
          collection_id: undefined,
        };
        await mb.api.createQuestion(cardDetails);
      });

      test("should not be able to select a metric", async ({ page, mb }) => {
        const databases = waitForSavedDatabases(page);
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await databases;
        await expect(
          popover(frame).getByText("Models", { exact: true }),
        ).toBeVisible();
        await expect(
          popover(frame).getByText("Raw Data", { exact: true }),
        ).toBeVisible();
        await expect(
          popover(frame).getByText("Metrics", { exact: true }),
        ).toHaveCount(0);
      });
    });

    test.describe('"entity_types" query parameter', () => {
      test('should show only the provided "entity_types"', async ({
        page,
        mb,
      }) => {
        const frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
          searchParameters: { entity_types: "table" },
        });
        await expect(
          popover(frame).getByText("Models", { exact: true }),
        ).toHaveCount(0);
        await expect(
          popover(frame).getByText("Sample Database", { exact: true }),
        ).toBeVisible();
        await expect(
          popover(frame).getByRole("option", { name: "Orders", exact: true }),
        ).toBeVisible();
      });

      test('should show models and tables as a default value when not providing "entity_types"', async ({
        page,
        mb,
      }) => {
        // Test providing `entity_types` as an empty string
        let frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
          searchParameters: { entity_types: "" },
        });
        await expect(
          popover(frame).getByText("Models", { exact: true }),
        ).toBeVisible();
        await expect(
          popover(frame).getByText("Raw Data", { exact: true }),
        ).toBeVisible();

        // Test not providing `entity_types`
        frame = await startNewEmbeddingQuestion(page, mb.baseUrl, {
          isMultiStageDataPicker: true,
        });
        await expect(
          popover(frame).getByText("Models", { exact: true }),
        ).toBeVisible();
        await expect(
          popover(frame).getByText("Raw Data", { exact: true }),
        ).toBeVisible();
      });
    });
  });

  test.describe("dashboards", () => {
    test("should show the dashboard header by default", async ({
      page,
      mb,
    }) => {
      const frame = await visitDashboardUrl(page, mb.baseUrl, {
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
      });

      await expect(frame.getByTestId("dashboard-name-heading")).toBeVisible();
      await expect(
        frame.getByRole("button", { name: /Edited.*by/ }),
      ).toBeVisible();

      await dashboardHeader(frame)
        .getByRole("img", { name: /info/i })
        .click();
      await expect(modal(frame)).toBeVisible();
      await expect(
        modal(frame).getByRole("heading", { name: /entity id/i }),
      ).toHaveCount(0);
    });

    test("should hide the dashboard header by a param", async ({
      page,
      mb,
    }) => {
      const frame = await visitDashboardUrl(page, mb.baseUrl, {
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
        qs: { header: false },
      });
      await expect(
        frame.getByRole("heading", {
          name: "Orders in a dashboard",
          exact: true,
        }),
      ).toHaveCount(0);
      await assertTableRowsCount(dashboardGrid(frame), 2000);
    });

    test("should hide the dashboard with multiple tabs header by a param and allow selecting tabs (metabase#38429, metabase#39002)", async ({
      page,
      mb,
    }) => {
      const FIRST_TAB = { id: 1, name: "Tab 1" };
      const SECOND_TAB = { id: 2, name: "Tab 2" };
      const dashboard = await createDashboardWithTabs(mb.api, {
        name: "Dashboard with tabs",
        tabs: [FIRST_TAB, SECOND_TAB],
        dashcards: [
          mockDashboardCard({
            dashboard_tab_id: FIRST_TAB.id,
            card_id: ORDERS_QUESTION_ID,
            size_x: 10,
            size_y: 8,
          }),
        ],
      });
      const frame = await visitDashboardUrl(page, mb.baseUrl, {
        url: `/dashboard/${dashboard.id}`,
        qs: { header: false },
      });
      await expect(
        frame.getByRole("heading", {
          name: "Orders in a dashboard",
          exact: true,
        }),
      ).toHaveCount(0);
      await assertTableRowsCount(dashboardGrid(frame), 2000);
      await goToTab(frame, SECOND_TAB.name);
      await expect(frame.getByTestId("dashboard-empty-state")).toBeVisible();
    });

    test("should hide the dashboard's additional info by a param", async ({
      page,
      mb,
    }) => {
      const frame = await visitDashboardUrl(page, mb.baseUrl, {
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
        qs: { additional_info: false },
      });

      await expect(
        frame
          .getByTestId("dashboard-header")
          .getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible();
      await expect(
        frame.getByTestId("dashboard-header").getByText(/Edited/),
      ).toHaveCount(0);
      await expect(
        frame
          .getByTestId("app-bar")
          .getByText("Our analytics", { exact: true }),
      ).toBeVisible();
    });

    test("should preserve embedding options with click behavior (metabase#24756)", async ({
      page,
      mb,
    }) => {
      await addLinkClickBehavior(mb.api, {
        dashboardId: ORDERS_DASHBOARD_ID,
        linkTemplate: "/question/" + ORDERS_QUESTION_ID,
      });
      const frame = await visitDashboardUrl(page, mb.baseUrl, {
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
      });

      const cardQuery = page.waitForResponse(isCardQuery);
      await frame.getByRole("gridcell").first().click();
      await cardQuery;

      // I don't know why this test starts to fail, but this command
      // will force the cursor to move away from the app bar, if
      // the cursor is still on the app bar, the logo will not be
      // be visible, since we'll only see the side bar toggle button.
      await frame.getByTestId("question-filter-header").hover();

      await expect(frame.getByTestId("main-logo")).toBeVisible();
    });

    test("should have parameters header occupied the entire horizontal space when visiting a dashboard via navigation (metabase#30645)", async ({
      page,
      mb,
    }) => {
      const filterId = "50c9eac6";
      const dashboardDetails = {
        name: "interactive dashboard embedding",
        parameters: [
          {
            id: filterId,
            name: "ID",
            slug: "id",
            type: "id",
          },
        ],
      };
      const createResponse = await mb.api.post(
        "/api/dashboard",
        dashboardDetails,
      );
      const { id: dashboardId } = (await createResponse.json()) as {
        id: number;
      };
      const textDashcard = getTextCardDetails({
        col: 0,
        row: 0,
        size_x: 6,
        size_y: 20,
        text: "I am a very long text card",
      });
      const dashcard = mockDashboardCard({
        col: 8,
        row: 0,
        card_id: ORDERS_QUESTION_ID,
        parameter_mappings: [
          {
            parameter_id: filterId,
            card_id: ORDERS_QUESTION_ID,
            target: [
              "dimension",
              ["field", ORDERS.ID, { "base-type": "type/Integer" }],
            ],
          },
        ],
      });
      await updateDashboardCards(mb.api, {
        dashboard_id: dashboardId,
        cards: [dashcard, textDashcard],
      });

      const frame = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        baseUrl: mb.baseUrl,
      });

      // Navigate to a dashboard via in-app navigation
      await sideNav(frame).getByText("Our analytics", { exact: true }).click();
      await frame
        .getByRole("main")
        .getByText(dashboardDetails.name, { exact: true })
        .click();
      await expect(
        sideNav(frame).getByText("Our analytics", { exact: true }),
      ).not.toBeVisible();

      await expect(
        frame
          .locator("main header")
          .getByText(dashboardDetails.name, { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(frame).getByText("I am a very long text card", {
          exact: true,
        }),
      ).toBeVisible();

      // The bug won't appear if we scroll instantly and check the position of
      // the dashboard parameter header. I suspect that happens because we
      // used to calculate the dashboard parameter header position in
      // JavaScript, which could take some time.
      //
      // Upstream is `cy.scrollTo("bottom", { duration: 2 * FPS })`, which is
      // jQuery .animate() assigning scrollTop across frames — NOT a CSS smooth
      // scroll. scrollTo({ behavior: "smooth" }) is not the equivalent: the
      // config sets contextOptions.reducedMotion "reduce", under which
      // Chromium does not perform the programmatic smooth scroll at all
      // (scrollTop stayed 0). Animate scrollTop by hand to keep both
      // properties the test depends on: it scrolls, and it isn't instant.
      await frame.getByRole("main").evaluate(async (element) => {
        const from = element.scrollTop;
        const to = element.scrollHeight - element.clientHeight;
        const durationMs = 2 * (1000 / 60);
        const startedAt = performance.now();
        await new Promise<void>((resolve) => {
          const step = () => {
            const progress = Math.min(
              1,
              (performance.now() - startedAt) / durationMs,
            );
            element.scrollTop = from + (to - from) * progress;
            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              resolve();
            }
          };
          requestAnimationFrame(step);
        });
      });

      // Upstream asserts `should("not.be.visible")`. Cypress treats an element
      // clipped by an ancestor's overflow (i.e. scrolled out of view) as not
      // visible; Playwright's toBeVisible only checks for a non-empty box and
      // visibility != hidden, so a scrolled-away element is still "visible" to
      // it. toBeInViewport is the assertion that carries upstream's meaning.
      await expect(
        getDashboardCard(frame).getByText("I am a very long text card", {
          exact: true,
        }),
      ).not.toBeInViewport();
      await expect
        .poll(() =>
          frame
            .getByTestId("dashboard-parameters-widget-container")
            .evaluate((element) => element.getBoundingClientRect().x),
        )
        .toBe(0);
    });

    test.describe("navigation through postMessage", () => {
      const assertIsLost = async (frame: FrameLocator) => {
        await expect(
          frame
            .locator("[role=status]")
            .filter({ hasText: /We're a little lost/ })
            .first(),
        ).toBeVisible();
      };

      const assertIsDashboard = async (frame: FrameLocator) => {
        await expect(
          frame.getByTestId("table-footer").first(),
        ).toContainText("Showing first 2,000 rows");
      };

      const assertIsQuestion = async (frame: FrameLocator) => {
        await expect(
          frame.getByTestId("question-row-count").first(),
        ).toContainText("Showing first 2,000 rows");
      };

      const goTo = (page: Page, url: string) =>
        postMessageToEmbed(page, {
          metabase: { type: "location", location: url },
        });

      test("should handle invalid questions/dashboards (metabase#65500)", async ({
        page,
        mb,
      }) => {
        const dashboard = await createDashboardWithTabs(mb.api, {
          name: "Dashboard with tabs",
          dashcards: [
            mockDashboardCard({
              card_id: ORDERS_QUESTION_ID,
              size_x: 10,
              size_y: 8,
            }),
          ],
        });

        // The Cypress version loads a plain iframe test page
        // (H.loadInteractiveIframeEmbedTestPage) — the parameterless harness
        // is the same thing.
        const frame = await visitFullAppEmbeddingUrl(page, {
          url: `/dashboard/${dashboard.id}`,
          baseUrl: mb.baseUrl,
        });

        await assertIsDashboard(frame);

        // invalid dashboard -> valid dashboard
        await goTo(page, "/dashboard/9999990");
        await assertIsLost(frame);
        await goTo(page, `/dashboard/${dashboard.id}`);
        await assertIsDashboard(frame);

        // invalid question -> valid question
        await goTo(page, "/question/9999990");
        await assertIsLost(frame);
        await goTo(page, `/question/${ORDERS_QUESTION_ID}`);
        await assertIsQuestion(frame);

        // invalid question -> valid dashboard
        await goTo(page, "/question/9999990");
        await assertIsLost(frame);
        await goTo(page, `/dashboard/${dashboard.id}`);
        await assertIsDashboard(frame);

        // invalid dashboard -> valid question
        await goTo(page, "/dashboard/9999990");
        await assertIsLost(frame);
        await goTo(page, `/question/${ORDERS_QUESTION_ID}`);
        await assertIsQuestion(frame);
      });
    });

    test("should send `frame` message with dashboard height when the dashboard is resized (metabase#37437)", async ({
      page,
      mb,
    }) => {
      const TAB_1 = { id: 1, name: "Tab 1" };
      const TAB_2 = { id: 2, name: "Tab 2" };
      const dashboard = await createDashboardWithTabs(mb.api, {
        tabs: [TAB_1, TAB_2],
        name: "Dashboard",
        dashcards: [
          getTextCardDetails({
            dashboard_tab_id: TAB_1.id,
            size_x: 10,
            size_y: 20,
            text: "I am a text card",
          }),
        ],
      });
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: `/dashboard/${dashboard.id}`,
        baseUrl: mb.baseUrl,
      });

      // TODO(upstream parity): like the Cypress test, this can't assert that
      // this is the last frame message.
      await expectFrameHeightMessage(page, (height) => height > 1000);

      await clearRecordedPostMessages(page);
      await frame.getByRole("tab", { name: TAB_2.name, exact: true }).click();
      await expectFrameHeightMessage(page, (height) => height < 1000);

      await clearRecordedPostMessages(page);
      await frame
        .getByTestId("app-bar")
        .getByText("Our analytics", { exact: true })
        .click();

      await expect(
        frame.getByRole("heading", { name: "Usage analytics", exact: true }),
      ).toBeVisible();
      await expectFrameHeightMessage(page, (height) => height === 800);
    });

    test("should allow downloading question results when logged in via Google SSO (metabase#39848)", async ({
      page,
      mb,
    }) => {
      const CSRF_TOKEN = "abcdefgh";
      await page.route(
        (url) => url.pathname === "/api/user/current",
        async (route) => {
          const response = await route.fetch();
          await route.fulfill({
            response,
            headers: {
              ...response.headers(),
              "X-Metabase-Anti-CSRF-Token": CSRF_TOKEN,
            },
          });
        },
      );
      const frame = await visitDashboardUrl(page, mb.baseUrl, {
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
      });

      const card = getDashboardCard(frame);
      await card.hover();
      await expect(card.getByTestId("loading-indicator")).toHaveCount(0);
      await card.getByTestId("dashcard-menu").click();

      const csvResponse = await exportDashcardCsv(page, frame);
      const headers = await csvResponse.request().allHeaders();
      expect(headers["x-metabase-anti-csrf-token"]).toBe(CSRF_TOKEN);
    });

    test("should send 'X-Metabase-Client' header for api requests", async ({
      page,
      mb,
    }) => {
      const dashboard = page.waitForResponse(isGetDashboard);
      await visitFullAppEmbeddingUrl(page, {
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
        baseUrl: mb.baseUrl,
      });

      const headers = await (await dashboard).request().allHeaders();
      expect(headers["x-metabase-client"]).toBe("embedding-iframe-full-app");
    });
  });

  test.describe("x-ray dashboards", () => {
    test("should show the dashboard header by default", async ({
      page,
      mb,
    }) => {
      const frame = await visitXrayDashboardUrl(page, mb.baseUrl, {
        url: "/auto/dashboard/table/1",
      });

      await expect(
        frame.getByRole("heading", { name: "More X-rays", exact: true }),
      ).toBeVisible();
      await expect(
        frame.getByRole("button", { name: "Save this", exact: true }),
      ).toBeVisible();
    });

    test("should hide the dashboard header by a param", async ({
      page,
      mb,
    }) => {
      const frame = await visitXrayDashboardUrl(page, mb.baseUrl, {
        url: "/auto/dashboard/table/1",
        qs: { header: false },
      });

      await expect(
        frame.getByRole("heading", { name: "More X-rays", exact: true }),
      ).toBeVisible();
      await expect(
        frame.getByRole("button", { name: "Save this", exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("documents > comments", () => {
    test("should not display comments in an embedded app", async ({
      page,
      mb,
    }) => {
      const PARAGRAPH_ID = "b7fa322a-964e-d668-8d30-c772ef4f0022";

      // Upstream hardcodes DOCUMENT_ID = 1 (fresh snapshot); using the
      // created document's id is the same document, minus the assumption.
      const document = await createDocument(mb.api, {
        name: "Lorem ipsum",
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: {
                _id: PARAGRAPH_ID,
              },
              content: [
                {
                  type: "text",
                  text: "Lorem ipsum dolor sit amet.",
                },
              ],
            },
          ],
        },
      });
      await createComment(mb.api, {
        target_type: "document",
        target_id: document.id,
        child_target_id: PARAGRAPH_ID,
        parent_comment_id: null,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { _id: crypto.randomUUID() },
              content: [{ type: "text", text: "Test comment" }],
            },
          ],
        },
      });

      // Port of the `@commentGet.all` count: record GET /api/comment*
      // requests fired by the embedded app. (Broader than the upstream
      // "/api/comment/*" path glob, which never matches the query-string
      // form the FE actually uses.)
      const commentRequests: string[] = [];
      page.on("request", (request) => {
        if (
          request.method() === "GET" &&
          new URL(request.url()).pathname.startsWith("/api/comment")
        ) {
          commentRequests.push(request.url());
        }
      });

      const documentGet = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          /^\/api\/document\/\d+$/.test(new URL(response.url()).pathname),
      );
      const frame = await visitFullAppEmbeddingUrl(page, {
        url: `/document/${document.id}`,
        baseUrl: mb.baseUrl,
      });
      await documentGet;

      await expect(
        frame.getByText("Lorem ipsum dolor sit amet.", { exact: true }),
      ).toBeVisible();
      await expect(frame.getByLabel("Show all comments")).toHaveCount(0);
      await expect(
        frame.getByRole("link", { name: "Comments", exact: true }),
      ).toHaveCount(0);
      expect(commentRequests).toHaveLength(0);
    });
  });
});

test.describe("scenarios > embedding > full app - jwt sso integration", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "pro-self-hosted token required (set MB_PRO_SELF_HOSTED_TOKEN)",
  );

  /**
   * These tests are meant to validate the JWT SSO flow.
   *
   * The JWT provider url is mocked (page.route) even though we only care
   * about the redirect URL — if the request failed the iframe would land on
   * a chrome error page.
   */
  const dashboardId = ORDERS_DASHBOARD_ID;
  const jwtSecret =
    "0000000000000000000000000000000000000000000000000000000000000000";

  const isJwtProviderUrl = (url: URL) =>
    url.origin === "http://localhost:8888";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    // The FE builds its SSO redirect from the `site-url` SETTING, not from the
    // current origin (getSSOUrl in metabase-enterprise/auth/utils.ts). The e2e
    // snapshot was taken on port 4000, so restore() persists
    // site-url=http://localhost:4000 onto whatever port this worker's backend
    // actually listens on — sending the embedded app's /auth/sso off to the
    // shared dev backend, which has none of the JWT config set below. Upstream
    // never notices because its backend really is on 4000. Restore the
    // invariant upstream gets for free.
    await mb.api.updateSetting("site-url", mb.baseUrl);
    // enable interactive embedding
    await mb.api.updateSetting("enable-embedding-interactive", true);
    await mb.api.updateSetting(
      "embedding-app-origins-interactive",
      "http://localhost:*",
    );
    await mb.api.updateSetting("embedding-secret-key", jwtSecret);

    // setup jwt
    await mb.api.updateSetting(
      "jwt-identity-provider-uri",
      "http://localhost:8888/jwt-provider",
    );
    await mb.api.updateSetting("jwt-shared-secret", jwtSecret);
    await mb.api.updateSetting("jwt-enabled", true);

    await addLinkClickBehavior(mb.api, {
      dashboardId,
      linkTemplate: "/question/{{test_attribute}}",
    });

    await mb.signOut(); // we *need* to sign out, otherwise the SSO process won't kick in
  });

  test("when trying to access a resource while un-authenticated, it should pass the path via return_to to the jwt provider", async ({
    page,
    mb,
  }) => {
    await page.route(isJwtProviderUrl, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "ok" }),
    );
    const jwtProviderRequest = page.waitForRequest((request) =>
      request.url().startsWith("http://localhost:8888"),
    );

    await visitFullAppEmbeddingUrl(page, {
      url: `/dashboard/${dashboardId}`,
      baseUrl: mb.baseUrl,
    });

    expect((await jwtProviderRequest).url()).toBe(
      `http://localhost:8888/jwt-provider?return_to=/dashboard/${dashboardId}`,
    );
  });

  test("should authenticate the user correctly if the JWT provider returns a valid JWT token", async ({
    page,
    mb,
  }) => {
    // 1) sign a jwt for the user
    const jwtToken = signJwt(
      {
        email: USERS.normal.email,
        exp: Math.round(Date.now() / 1000) + 10 * 60,
      },
      jwtSecret,
    );

    // 2) mock the JWT provider to redirect to the auth/sso endpoint with the JWT
    await page.route(isJwtProviderUrl, (route) =>
      mockRedirectResponse(
        route,
        `${mb.baseUrl}/auth/sso?jwt=${jwtToken}&return_to=/dashboard/${dashboardId}`,
      ),
    );

    // 3) visit the dashboard
    const frame = await visitFullAppEmbeddingUrl(page, {
      url: `/dashboard/${dashboardId}`,
      baseUrl: mb.baseUrl,
    });

    // 4) verify the user is authenticated and can access the dashboard
    await embedFrame(page).waitForURL(
      `${mb.baseUrl}/dashboard/${dashboardId}`,
    );
    await expect(
      frame
        .locator("main")
        .getByText("Orders in a dashboard", { exact: true }),
    ).toBeVisible();
  });

  test("should pass JWT user attributes to click behavior custom destinations (metabase#65942)", async ({
    page,
    mb,
  }) => {
    const jwtAttributeValue = ORDERS_QUESTION_ID;

    // 1) the click behavior using a user attribute in the URL is set up in
    // beforeEach so it uses the admin user

    // 2) sign a jwt for the user with a custom attribute
    const jwtToken = signJwt(
      {
        email: USERS.normal.email,
        exp: Math.round(Date.now() / 1000) + 10 * 60,
        test_attribute: jwtAttributeValue,
      },
      jwtSecret,
    );

    // 3) mock the JWT provider to redirect to the auth/sso endpoint with the JWT
    await page.route(isJwtProviderUrl, (route) =>
      mockRedirectResponse(
        route,
        `${mb.baseUrl}/auth/sso?jwt=${jwtToken}&return_to=/dashboard/${dashboardId}`,
      ),
    );

    // 4) visit the dashboard as embedded
    const frame = await visitFullAppEmbeddingUrl(page, {
      url: `/dashboard/${dashboardId}`,
      baseUrl: mb.baseUrl,
    });

    // 5) verify user is on dashboard
    await embedFrame(page).waitForURL(
      `${mb.baseUrl}/dashboard/${dashboardId}`,
    );

    const cardQuery = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          `/api/card/${ORDERS_QUESTION_ID}/query`,
    );
    await frame.getByRole("gridcell").first().click();
    await cardQuery;

    await frame.getByTestId("question-filter-header").hover();
    await expect(frame.getByTestId("main-logo")).toBeVisible();
  });
});
