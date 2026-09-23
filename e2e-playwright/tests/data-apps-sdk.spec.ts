/**
 * Playwright port of e2e/test/scenarios/data-apps/sdk.cy.spec.ts
 *
 * The SDK data-app RUNTIME surface: `useMetabaseQuery` states + refetch, the
 * `StaticQuestion`/`useMetabaseQueryObject` render, the query-combinator
 * helpers, the sandboxed `copy()` clipboard path, and the default vs custom
 * error component — all driven inside the data-app's embed iframe.
 *
 * 🔴 BLOCKED locally on a stale snapshot — NOT a missing feature (see
 * findings-inbox/data-apps.md, shared with the sibling data-apps ports).
 * ---------------------------------------------------------------------------
 * The `data-apps` premium feature IS present and unlocked on the CI jar:
 * `activateToken("bleeding-edge")` (MB_ALL_FEATURES_TOKEN) yields
 * `token-features.data-apps = true`, and the BE route `/embed/apps/:slug`
 * exists and executes. But `e2e/snapshots/default.sql` on this box predates
 * `resources/migrations/064/20260717_data_app.yaml`, so `restore("default")`
 * drops the `data_app` table the boot migrations created, and every data-apps
 * request 500s (`Table "DATA_APP" not found`). The iframe entrypoint
 * `/embed/apps/:slug` is NOT one of the four paths `mockDataApp` stubs (Cypress
 * never mocked it — it relied on the real table existing), so the embed iframe
 * never loads locally and no test here can go green until the snapshot is
 * regenerated. Regenerating `e2e/snapshots/*` was unsafe: sibling slots were
 * live and it means running Cypress over the shared, gitignored snapshots.
 * CI is unaffected — CI regenerates snapshots against the migrated schema.
 * This is deliberately a REAL (ungated) port, not the FINDINGS #49
 * "fully-gated new feature" shape; the token gate below is the only gate.
 *
 * Port notes
 * ----------
 * - `H.activateToken("bleeding-edge")` → `mb.api.activateToken(...)`; the
 *   describe is gated `test.skip(!resolveToken("bleeding-edge"), …)` (rule 7).
 *   No `@external`/QA-DB content — the queries hit the sample DB.
 * - `H.mockDataApp` / `H.dataAppIframe` / `visitDataAppRoute` / `H.openDataApp`
 *   come from the shared `support/data-apps.ts`; the widened `testEnv`
 *   (errorQuery/combinators) and `dataAppNumericField` come from
 *   `support/data-apps-sdk.ts` (this agent's module).
 * - `cy.intercept("POST","/api/dataset").as(...)` + `cy.get("@…​.all")` counts
 *   dataset requests → a `page.on("request")` counter (rule 2: no
 *   never-awaited alias). The refetch assertion polls the counter to `+1`.
 * - `should("have.text", x)` → `toHaveText(x)`; `findByText(/re/i)` regex →
 *   `getByText(/re/i)` (multi-match → `.first()`, rule 3).
 * - Clipboard: `cy.stub(win.navigator.clipboard,"writeText")` → a recorder
 *   installed via `frame.evaluate` before the click; the recorded args are read
 *   back and asserted outside (calledOnceWith → exactly one call, that arg).
 *   Headless Chrome reports the iframe unfocused so the real `writeText`
 *   rejects; stubbing keeps the test about the app reaching the sanctioned
 *   `copy()`, not the OS write.
 */
import { SAMPLE_DATABASE } from "../support/sample-data";
import { resolveToken } from "../support/api";
import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
  DATA_APP_TEST_ENV as TEST_ENV,
  dataAppIframe,
  openDataApp,
  visitDataAppRoute,
} from "../support/data-apps";
import {
  dataAppNumericField as numericField,
  mockDataApp,
} from "../support/data-apps-sdk";
import { expect, test } from "../support/fixtures";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const visitAppRoute = (
  page: Parameters<typeof visitDataAppRoute>[0],
  baseUrl: string,
  route: string,
) => visitDataAppRoute(page, baseUrl, route);

test.describe("scenarios > data apps > SDK runtime", () => {
  test.skip(
    !resolveToken("bleeding-edge"),
    "Requires MB_ALL_FEATURES_TOKEN (the bleeding-edge token grants data-apps)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    await mb.api.activateToken("bleeding-edge");
  });

  test.describe("query hooks & question components", () => {
    const setupQueryStatesApp = (page: Parameters<typeof mockDataApp>[0]) =>
      mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: {
          ...TEST_ENV,
          // A table id that doesn't exist → the query resolves to an error.
          errorQuery: { source: { type: "table", id: 999999 } },
        },
      });

    test("surfaces the useMetabaseQuery error state", async ({ page, mb }) => {
      await setupQueryStatesApp(page);

      await visitAppRoute(page, mb.baseUrl, "query-states");
      const frame = dataAppIframe(page, APP_DISPLAY_NAME);
      await expect(frame.getByTestId("query-error")).toHaveText("error", {
        timeout: 30000,
      });
    });

    test("re-runs the query when the app calls refetch", async ({
      page,
      mb,
    }) => {
      // Count POST /api/dataset requests (upstream aliased them and counted the
      // `.all` array; the request going out again is the only proof refetch did
      // anything, since a refetch of a query that already succeeded renders the
      // same value).
      let datasetQueryCount = 0;
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          new URL(request.url()).pathname === "/api/dataset"
        ) {
          datasetQueryCount += 1;
        }
      });

      await setupQueryStatesApp(page);

      await visitAppRoute(page, mb.baseUrl, "query-states");
      const frame = dataAppIframe(page, APP_DISPLAY_NAME);
      // The query has to have resolved before refetching means anything.
      await expect(frame.getByTestId("query-value")).toHaveText(/^\d+$/, {
        timeout: 30000,
      });

      const before = datasetQueryCount;
      await frame.getByTestId("query-refetch").click();
      await expect
        .poll(() => datasetQueryCount, { timeout: 30000 })
        .toBe(before + 1);
    });

    test("renders a StaticQuestion from useMetabaseQueryObject", async ({
      page,
      mb,
    }) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      await visitAppRoute(page, mb.baseUrl, "static-question");
      const frame = dataAppIframe(page, APP_DISPLAY_NAME);

      // A rendered value, not just the header: the hook's query object has to
      // have actually run.
      const headers = frame.getByTestId("header-cell");
      await expect(headers.first()).toBeVisible({ timeout: 30000 });
      const headerTexts = await headers.allTextContents();
      const subtotalIndex = headerTexts.findIndex(
        (text) => text.trim() === "Subtotal",
      );
      expect(subtotalIndex, "Subtotal column").toBeGreaterThanOrEqual(0);

      // Cells are row-major, so the first row's Subtotal sits at the column's
      // own index.
      const cells = frame.getByTestId("table-body").getByTestId("cell-data");
      await expect
        .poll(() => cells.count(), { timeout: 30000 })
        .toBeGreaterThan(subtotalIndex);
      const subtotal = (await cells.nth(subtotalIndex).textContent()) ?? "";
      expect(parseFloat(subtotal.replace(/[^\d.]/g, ""))).toBeGreaterThan(0);
    });

    test("builds a query with filter/breakout/orderBy/aggregations helpers", async ({
      page,
      mb,
    }) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: {
          ...TEST_ENV,
          combinators: {
            source: { type: "table", id: ORDERS_ID },
            filterField: numericField(ORDERS.TOTAL, "TOTAL"),
            filterValue: 50,
            breakoutField: numericField(ORDERS.PRODUCT_ID, "PRODUCT_ID"),
          },
        },
      });

      await visitAppRoute(page, mb.baseUrl, "combinators");
      const frame = dataAppIframe(page, APP_DISPLAY_NAME);
      await expect(frame.getByTestId("combinators-loading")).toHaveText(
        "done",
        { timeout: 30000 },
      );
      await expect(frame.getByTestId("combinators-error")).toHaveText(
        "no-error",
      );
      // Retries until the query resolves with rows.
      await expect
        .poll(
          async () =>
            Number(
              (await frame.getByTestId("combinators-rowcount").textContent()) ??
                "0",
            ),
          { timeout: 30000 },
        )
        .toBeGreaterThan(0);
    });
  });

  test.describe("clipboard (copy)", () => {
    test("writes text to the clipboard from a user click", async ({
      page,
      mb,
    }) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      await visitAppRoute(page, mb.baseUrl, "clipboard");

      // Headless Chrome reports the iframe document as unfocused, so the real
      // `navigator.clipboard.writeText` rejects ("Document is not focused").
      // Record its calls and resolve: the test verifies the app reaches the
      // sanctioned `copy` with the right text — the OS write itself is browser
      // behavior, not ours. Installed before the click; asserted outside the
      // recorder so a never-invoked stub fails loudly.
      const iframeHandle = await page
        .locator(`iframe[title="${APP_DISPLAY_NAME}"]`)
        .elementHandle();
      const frame = await iframeHandle!.contentFrame();
      await frame!.evaluate(() => {
        const calls: string[] = [];
        (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites =
          calls;
        navigator.clipboard.writeText = (text: string) => {
          calls.push(text);
          return Promise.resolve();
        };
      });

      const body = dataAppIframe(page, APP_DISPLAY_NAME);
      await body.getByTestId("clipboard-copy").click();
      await expect(body.getByTestId("clipboard-status")).toHaveText("copied", {
        timeout: 30000,
      });

      const writes = await frame!.evaluate(
        () =>
          (window as unknown as { __clipboardWrites: string[] })
            .__clipboardWrites,
      );
      expect(writes).toEqual(["data-app-clipboard-payload"]);
    });
  });

  test.describe("error component", () => {
    test("shows the default neutral error state for a missing question", async ({
      page,
      mb,
    }) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      await visitAppRoute(page, mb.baseUrl, "missing-question");
      const frame = dataAppIframe(page, APP_DISPLAY_NAME);
      await expect(frame.getByText(/not found/i).first()).toBeVisible({
        timeout: 30000,
      });
    });

    test("lets an app override the default with its own errorComponent", async ({
      page,
      mb,
    }) => {
      const CUSTOM_APP = "custom-error-component";
      const CUSTOM_DISPLAY = "Custom Error App";

      await mockDataApp(page, CUSTOM_APP, { displayName: CUSTOM_DISPLAY });

      await openDataApp(page, mb.baseUrl, CUSTOM_APP);
      const frame = dataAppIframe(page, CUSTOM_DISPLAY);
      const custom = frame.getByTestId("custom-error-component");
      await expect(custom).toBeVisible({ timeout: 30000 });
      await expect(custom).toContainText("Custom app error");
    });
  });
});
