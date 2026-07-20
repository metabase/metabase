import type { FrameLocator } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { loadSdkIframeEmbedTestPage } from "../support/sdk-iframe";
import {
  PROVIDER_PATH,
  assertTableData,
  createDashboardWithCategoryFilter,
  createDashboardWithPriceFilter,
  createDashboardWithQuestion,
  createQuestionWithCategoryFilter,
  createQuestionWithPriceFilter,
  createStandaloneQuestion,
  forceGuestTokenRefresh,
  mockGuestTokenProvider,
  prepareGuestEmbedSdkIframeEmbedTest,
  signGuestJwt,
  waitForGuestTokenProvider,
} from "../support/sdk-iframe-guest-token-refresh";
import { popover } from "../support/ui";

/**
 * Port of
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding/guest-token-refresh.cy.spec.ts
 *
 * Group A of the SDK-iframe tier: uses the `embed.js` customer-page harness in
 * `support/sdk-iframe.ts`, consumed read-only. Everything new lives in
 * `support/sdk-iframe-guest-token-refresh.ts` (PORTING rule 9).
 *
 * Port notes:
 *
 * - **Token expiry is driven by the token itself, not by a clock.** Upstream
 *   signs an already-expired token (`expirationSeconds: -60`) for the
 *   "refresh-only" cases, and for the two filter-interaction cases it flips the
 *   product's own test hook,
 *   `window.FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS`, on the embed iframe's
 *   window. So `page.clock` is **not** needed here and is not used: there is no
 *   in-iframe repeating timer under test, and stepping a clock would be a less
 *   faithful way to reach a state the spec reaches directly. (See findings for
 *   why the product hook is kept rather than replaced by `page.clock`, which
 *   the sibling `sdk-iframe-embedding` port proved does reach into the frame.)
 *
 * - `cy.intercept(PROVIDER_INTERCEPT).as("guestTokenProvider")` +
 *   `cy.wait("@guestTokenProvider")`: every call site registers the intercept
 *   before the page load and waits after it. `cy.wait` consumes a *past*
 *   response, so on the filter tests (short-lived initial token) upstream's
 *   wait can be satisfied retroactively by a refresh that happened during
 *   load. `waitForGuestTokenProvider` is therefore armed before the load and
 *   awaited where upstream waits — the same semantics. The response body/URL
 *   assertions read off the awaited `Response`'s request.
 *
 * - `H.getSimpleEmbedIframeContent().within(...)` → the `FrameLocator` returned
 *   by `loadSdkIframeEmbedTestPage`. `H.popover()` and `H.assertTableData()`
 *   inside a `within` resolve against the iframe body, so both are scoped to
 *   the frame here.
 *
 * - The `signJwt` cy.task (`jsonwebtoken.sign`) stamps `iat` automatically;
 *   `signGuestJwt` sets it explicitly. See PORTING, "Set `iat` explicitly when
 *   signing a JWT".
 */

const PROVIDER_ERROR_500 = `Failed to fetch JWT token from ${PROVIDER_PATH}, status: 500.`;

// Kept verbatim from upstream — an unanchored regex over the rendered error.
const WRONG_SHAPE_ERROR =
  /Your JWT server endpoint must return an object with the shape { jwt: string }, but instead received {"token":/;

/** The error text renders as the whole content of its own `<Box>` (SdkError →
 * DefaultErrorMessage). Only `EXISTING_USER_SESSION_FAILED` gets the extra
 * "Read more." anchor, so an exact match is right for these two codes. */
function expectProviderError(frame: FrameLocator, text: string | RegExp) {
  return expect(
    typeof text === "string"
      ? frame.getByText(text, { exact: true })
      : frame.getByText(text),
  ).toBeVisible({ timeout: 40_000 });
}

test.describe("scenarios > embedding > sdk iframe embedding > guest token refresh", () => {
  test.describe("dashboard refresh-only", () => {
    test.describe("happy path", () => {
      let dashboardId: number;

      test.beforeEach(async ({ mb }) => {
        await prepareGuestEmbedSdkIframeEmbedTest(mb, {
          onPrepare: async () => {
            dashboardId = await createDashboardWithQuestion(mb.api);
          },
        });
      });

      test("calls guestEmbedProviderUri with { entityType, entityId } and loads dashboard after token refresh", async ({
        page,
        mb,
      }) => {
        const expiredToken = signGuestJwt({
          dashboardId,
          expirationSeconds: -60,
        });
        const freshToken = signGuestJwt({
          dashboardId,
          expirationSeconds: 600,
        });

        await mockGuestTokenProvider(page, mb, {
          statusCode: 200,
          body: { jwt: freshToken },
        });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-dashboard",
              attributes: {
                token: expiredToken,
                "custom-context": '{"param":"value","nested":{"a":1}}',
              },
            },
          ],
        });

        const interception = await guestTokenProvider;
        expect(interception.request().postDataJSON()).toMatchObject({
          entityType: "dashboard",
          entityId: dashboardId,
          customContext: { param: "value", nested: { a: 1 } },
        });

        await expect(frame.locator("body")).toContainText("Orders", {
          timeout: 40_000,
        });
      });
    });

    test.describe("provider error shows error state", () => {
      let dashboardId: number;

      test.beforeEach(async ({ mb }) => {
        await prepareGuestEmbedSdkIframeEmbedTest(mb, {
          onPrepare: async () => {
            dashboardId = await createDashboardWithQuestion(mb.api);
          },
        });
      });

      test("shows an error when the provider returns an HTTP error", async ({
        page,
        mb,
      }) => {
        const expiredToken = signGuestJwt({
          dashboardId,
          expirationSeconds: -60,
        });

        await mockGuestTokenProvider(page, mb, { statusCode: 500 });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-dashboard",
              attributes: { token: expiredToken },
            },
          ],
        });

        await guestTokenProvider;
        await expectProviderError(frame, PROVIDER_ERROR_500);
      });

      test("shows an error when the provider returns a wrong response shape", async ({
        page,
        mb,
      }) => {
        const expiredToken = signGuestJwt({
          dashboardId,
          expirationSeconds: -60,
        });
        const freshToken = signGuestJwt({
          dashboardId,
          expirationSeconds: 600,
        });

        await mockGuestTokenProvider(page, mb, {
          statusCode: 200,
          body: { token: freshToken },
        });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-dashboard",
              attributes: { token: expiredToken },
            },
          ],
        });

        await guestTokenProvider;
        await expectProviderError(frame, WRONG_SHAPE_ERROR);
      });
    });

    test.describe("number filter interaction after token refresh", () => {
      let dashboardId: number;

      test.beforeEach(async ({ mb }) => {
        await prepareGuestEmbedSdkIframeEmbedTest(mb, {
          onPrepare: async () => {
            dashboardId = await createDashboardWithPriceFilter(mb.api);
          },
        });
      });

      test("applying a number filter after token refresh returns filtered results", async ({
        page,
        mb,
      }) => {
        const shortLivedToken = signGuestJwt({
          dashboardId,
          expirationSeconds: 5,
        });
        const freshToken = signGuestJwt({
          dashboardId,
          expirationSeconds: 600,
        });

        await mockGuestTokenProvider(page, mb, {
          statusCode: 200,
          body: { jwt: freshToken },
        });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-dashboard",
              attributes: { token: shortLivedToken },
            },
          ],
        });

        await expect(
          frame.getByLabel("Price greater than", { exact: true }),
        ).toBeVisible({ timeout: 40_000 });

        await forceGuestTokenRefresh(page);

        await frame.getByLabel("Price greater than", { exact: true }).click();
        await popover(frame)
          .getByPlaceholder("Enter a number", { exact: true })
          .fill("50");
        await popover(frame)
          .getByPlaceholder("Enter a number", { exact: true })
          .press("Enter");

        // ensure the token is refreshed after applying a filter value
        await guestTokenProvider;

        await assertTableData(frame, {
          columns: ["ID", "Title", "Price"],
          firstRows: [["2", "Small Marble Shoes", "70.08"]],
        });
      });
    });

    test.describe("category filter interaction after token refresh", () => {
      let dashboardId: number;

      test.beforeEach(async ({ mb }) => {
        await prepareGuestEmbedSdkIframeEmbedTest(mb, {
          onPrepare: async () => {
            dashboardId = await createDashboardWithCategoryFilter(mb.api);
          },
        });
      });

      test("applying a category filter after token refresh returns filtered results", async ({
        page,
        mb,
      }) => {
        const shortLivedToken = signGuestJwt({
          dashboardId,
          expirationSeconds: 5,
        });
        const freshToken = signGuestJwt({
          dashboardId,
          expirationSeconds: 600,
        });

        await mockGuestTokenProvider(page, mb, {
          statusCode: 200,
          body: { jwt: freshToken },
        });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-dashboard",
              attributes: { token: shortLivedToken },
            },
          ],
        });

        await expect(frame.getByLabel("Category", { exact: true })).toBeVisible({
          timeout: 40_000,
        });

        await forceGuestTokenRefresh(page);

        await frame.getByLabel("Category", { exact: true }).click();

        // ensure the token is refreshed after the filter values endpoint is
        // called
        await guestTokenProvider;

        await popover(frame)
          .getByRole("checkbox", { name: "Doohickey", exact: true })
          .click();
        await popover(frame)
          .getByRole("button", { name: "Add filter", exact: true })
          .click();

        await assertTableData(frame, {
          columns: ["ID", "Title", "Category"],
          firstRows: [["2", "Small Marble Shoes", "Doohickey"]],
        });
      });
    });
  });

  test.describe("dashboard initial-token", () => {
    test.describe("happy path", () => {
      let dashboardId: number;

      test.beforeEach(async ({ mb }) => {
        await prepareGuestEmbedSdkIframeEmbedTest(mb, {
          onPrepare: async () => {
            dashboardId = await createDashboardWithQuestion(mb.api);
          },
        });
      });

      test("calls guestEmbedProviderUri with { entityType, entityId } and loads dashboard (initial token fetch)", async ({
        page,
        mb,
      }) => {
        const freshToken = signGuestJwt({
          dashboardId,
          expirationSeconds: 600,
        });

        await mockGuestTokenProvider(page, mb, {
          statusCode: 200,
          body: { jwt: freshToken },
        });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-dashboard",
              attributes: {
                "dashboard-id": dashboardId,
                "custom-context": "test-custom-context",
              },
            },
          ],
        });

        const interception = await guestTokenProvider;
        expect(interception.request().url()).toContain("response=json");
        expect(interception.request().postDataJSON()).toMatchObject({
          entityType: "dashboard",
          entityId: dashboardId,
          customContext: "test-custom-context",
        });

        await expect(frame.locator("body")).toContainText("Orders", {
          timeout: 40_000,
        });
      });
    });

    test.describe("provider error shows error state", () => {
      let dashboardId: number;

      test.beforeEach(async ({ mb }) => {
        await prepareGuestEmbedSdkIframeEmbedTest(mb, {
          onPrepare: async () => {
            dashboardId = await createDashboardWithQuestion(mb.api);
          },
        });
      });

      test("shows an error when the provider returns an HTTP error", async ({
        page,
        mb,
      }) => {
        await mockGuestTokenProvider(page, mb, { statusCode: 500 });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-dashboard",
              attributes: { "dashboard-id": dashboardId },
            },
          ],
        });

        await guestTokenProvider;
        await expectProviderError(frame, PROVIDER_ERROR_500);
      });

      test("shows an error when the provider returns a wrong response shape", async ({
        page,
        mb,
      }) => {
        const freshToken = signGuestJwt({
          dashboardId,
          expirationSeconds: 600,
        });

        await mockGuestTokenProvider(page, mb, {
          statusCode: 200,
          body: { token: freshToken },
        });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-dashboard",
              attributes: { "dashboard-id": dashboardId },
            },
          ],
        });

        await guestTokenProvider;
        await expectProviderError(frame, WRONG_SHAPE_ERROR);
      });
    });
  });

  test.describe("question refresh-only", () => {
    test.describe("happy path", () => {
      let questionId: number;

      test.beforeEach(async ({ mb }) => {
        await prepareGuestEmbedSdkIframeEmbedTest(mb, {
          onPrepare: async () => {
            questionId = await createStandaloneQuestion(mb.api);
          },
        });
      });

      test("calls guestEmbedProviderUri with { entityType: question, entityId } and loads question after token refresh", async ({
        page,
        mb,
      }) => {
        const expiredToken = signGuestJwt({
          questionId,
          expirationSeconds: -60,
        });
        const freshToken = signGuestJwt({ questionId, expirationSeconds: 600 });

        await mockGuestTokenProvider(page, mb, {
          statusCode: 200,
          body: { jwt: freshToken },
        });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-question",
              attributes: {
                token: expiredToken,
                "custom-context": "test-custom-context",
              },
            },
          ],
        });

        const interception = await guestTokenProvider;
        expect(interception.request().postDataJSON()).toMatchObject({
          entityType: "question",
          entityId: questionId,
          customContext: "test-custom-context",
        });

        await expect(frame.getByTestId("visualization-root")).toHaveCount(1, {
          timeout: 40_000,
        });
      });
    });

    test.describe("provider error shows error state", () => {
      let questionId: number;

      test.beforeEach(async ({ mb }) => {
        await prepareGuestEmbedSdkIframeEmbedTest(mb, {
          onPrepare: async () => {
            questionId = await createStandaloneQuestion(mb.api);
          },
        });
      });

      test("shows an error when the provider returns an HTTP error", async ({
        page,
        mb,
      }) => {
        const expiredToken = signGuestJwt({
          questionId,
          expirationSeconds: -60,
        });

        await mockGuestTokenProvider(page, mb, { statusCode: 500 });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-question",
              attributes: { token: expiredToken },
            },
          ],
        });

        await guestTokenProvider;
        await expectProviderError(frame, PROVIDER_ERROR_500);
      });

      test("shows an error when the provider returns a wrong response shape", async ({
        page,
        mb,
      }) => {
        const expiredToken = signGuestJwt({
          questionId,
          expirationSeconds: -60,
        });
        const freshToken = signGuestJwt({ questionId, expirationSeconds: 600 });

        await mockGuestTokenProvider(page, mb, {
          statusCode: 200,
          body: { token: freshToken },
        });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-question",
              attributes: { token: expiredToken },
            },
          ],
        });

        await guestTokenProvider;
        await expectProviderError(frame, WRONG_SHAPE_ERROR);
      });
    });

    test.describe("number filter interaction after token refresh", () => {
      let questionId: number;

      test.beforeEach(async ({ mb }) => {
        await prepareGuestEmbedSdkIframeEmbedTest(mb, {
          onPrepare: async () => {
            questionId = await createQuestionWithPriceFilter(mb.api);
          },
        });
      });

      test("applying a number filter after token refresh returns filtered results", async ({
        page,
        mb,
      }) => {
        const shortLivedToken = signGuestJwt({
          questionId,
          expirationSeconds: 5,
        });
        const freshToken = signGuestJwt({ questionId, expirationSeconds: 600 });

        await mockGuestTokenProvider(page, mb, {
          statusCode: 200,
          body: { jwt: freshToken },
        });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-question",
              attributes: { token: shortLivedToken },
            },
          ],
        });

        await expect(
          frame.getByText("Products with price filter", { exact: true }),
        ).toBeVisible({ timeout: 40_000 });

        await forceGuestTokenRefresh(page);

        await frame.getByLabel("Price greater than", { exact: true }).click();
        await popover(frame)
          .getByPlaceholder("Enter a number", { exact: true })
          .fill("50");
        await popover(frame)
          .getByPlaceholder("Enter a number", { exact: true })
          .press("Enter");

        // ensure the token is refreshed after applying a filter value
        await guestTokenProvider;

        await assertTableData(frame, {
          columns: ["ID", "TITLE", "PRICE"],
          firstRows: [["2", "Small Marble Shoes", "70.08"]],
        });
      });
    });

    test.describe("category filter interaction after token refresh", () => {
      let questionId: number;

      test.beforeEach(async ({ mb }) => {
        await prepareGuestEmbedSdkIframeEmbedTest(mb, {
          onPrepare: async () => {
            questionId = await createQuestionWithCategoryFilter(mb.api);
          },
        });
      });

      test("applying a category filter after token refresh returns filtered results", async ({
        page,
        mb,
      }) => {
        const shortLivedToken = signGuestJwt({
          questionId,
          expirationSeconds: 5,
        });
        const freshToken = signGuestJwt({ questionId, expirationSeconds: 600 });

        await mockGuestTokenProvider(page, mb, {
          statusCode: 200,
          body: { jwt: freshToken },
        });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-question",
              attributes: { token: shortLivedToken },
            },
          ],
        });

        await expect(
          frame.getByText("Products with category filter", { exact: true }),
        ).toBeVisible({ timeout: 40_000 });

        await forceGuestTokenRefresh(page);

        await frame.getByLabel("Category", { exact: true }).click();

        // ensure the token is refreshed after the filter values endpoint is
        // called
        await guestTokenProvider;

        await popover(frame)
          .getByRole("checkbox", { name: "Doohickey", exact: true })
          .click();
        await popover(frame)
          .getByRole("button", { name: "Add filter", exact: true })
          .click();

        await assertTableData(frame, {
          columns: ["ID", "TITLE", "CATEGORY"],
          firstRows: [["2", "Small Marble Shoes", "Doohickey"]],
        });
      });
    });
  });

  test.describe("question initial-token", () => {
    test.describe("happy path", () => {
      let questionId: number;

      test.beforeEach(async ({ mb }) => {
        await prepareGuestEmbedSdkIframeEmbedTest(mb, {
          onPrepare: async () => {
            questionId = await createStandaloneQuestion(mb.api);
          },
        });
      });

      test("calls guestEmbedProviderUri with { entityType: question, entityId } and loads question (initial token fetch)", async ({
        page,
        mb,
      }) => {
        const freshToken = signGuestJwt({ questionId, expirationSeconds: 600 });

        await mockGuestTokenProvider(page, mb, {
          statusCode: 200,
          body: { jwt: freshToken },
        });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-question",
              attributes: {
                "question-id": questionId,
                "custom-context": "test-custom-context",
              },
            },
          ],
        });

        const interception = await guestTokenProvider;
        expect(interception.request().url()).toContain("response=json");
        expect(interception.request().postDataJSON()).toMatchObject({
          entityType: "question",
          entityId: questionId,
          customContext: "test-custom-context",
        });

        await expect(frame.getByTestId("visualization-root")).toHaveCount(1, {
          timeout: 40_000,
        });
      });
    });

    test.describe("provider error shows error state", () => {
      let questionId: number;

      test.beforeEach(async ({ mb }) => {
        await prepareGuestEmbedSdkIframeEmbedTest(mb, {
          onPrepare: async () => {
            questionId = await createStandaloneQuestion(mb.api);
          },
        });
      });

      test("shows an error when the provider returns an HTTP error", async ({
        page,
        mb,
      }) => {
        await mockGuestTokenProvider(page, mb, { statusCode: 500 });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-question",
              attributes: { "question-id": questionId },
            },
          ],
        });

        await guestTokenProvider;
        await expectProviderError(frame, PROVIDER_ERROR_500);
      });

      test("shows an error when the provider returns a wrong response shape", async ({
        page,
        mb,
      }) => {
        const freshToken = signGuestJwt({ questionId, expirationSeconds: 600 });

        await mockGuestTokenProvider(page, mb, {
          statusCode: 200,
          body: { token: freshToken },
        });
        const guestTokenProvider = waitForGuestTokenProvider(page, mb);

        const frame = await loadSdkIframeEmbedTestPage(page, mb, {
          metabaseConfig: {
            isGuest: true,
            guestEmbedProviderUri: PROVIDER_PATH,
          },
          elements: [
            {
              component: "metabase-question",
              attributes: { "question-id": questionId },
            },
          ],
        });

        await guestTokenProvider;
        await expectProviderError(frame, WRONG_SHAPE_ERROR);
      });
    });
  });
});
