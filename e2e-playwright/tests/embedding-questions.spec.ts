/**
 * Playwright port of
 * e2e/test/scenarios/embedding/embedding-questions.cy.spec.js — static ("guest")
 * embedding of a saved QUESTION (params locked/editable/disabled, downloads
 * toggle, appearance `#locale`/`#font` hash params, and the published
 * signed-token flow).
 *
 * Porting notes:
 * - Two visit flows, matching upstream and embedding-native.spec.ts:
 *   - H.visitIframe (static-embedding-modal Preview) frames the embed in the
 *     support/embedding.ts harness and returns a FrameLocator; those assertions
 *     run through `frame`, and cy.location(...) reads the framed embed's own url
 *     (page.frame("embed")?.url()), not the harness page url.
 *   - H.visitEmbeddedPage signs a JWT and navigates the top-level page, so those
 *     assertions are page-scoped and cy.url() === page.url().
 * - findByText(str) is exact (rule 1). cy.icon(name) → .Icon-<name>.
 * - The ECharts assertions in the aggregation test run against the embed IFRAME,
 *   so scope-aware chart helpers live in support/embedding-questions.ts (the
 *   shared charts.ts / viz-tabular-repros.ts ports are Page-scoped). Cypress
 *   `.trigger("mousemove")` → synthetic MouseEvent dispatch (wave-13).
 * - Several rendered values are TIMEZONE-SENSITIVE (e.g. "Fri, Feb 11, 2028,
 *   21:40:27", "Februar 11, 2028, 9:40 PM"). CI sets TZ=US/Pacific and
 *   Playwright inherits it; run this spec with TZ=US/Pacific locally to match.
 * - The downloads describe's `cy.intercept(...).as("publishChanges"/"dl")` are
 *   never awaited (the test PUTs via the API and never cy.wait()s them) — dropped
 *   per rule 2.
 * - Gating: static embedding (first describe + downloads "without token") works
 *   on the EE jar with no premium token — restore() clears the token, so these
 *   run unconditionally. The EE describe and the "premium token" context call
 *   H.activateToken and are skip-gated on resolveToken("pro-self-hosted").
 */
import type { FrameLocator, Page } from "@playwright/test";

import { resolveToken } from "../support/api";
import {
  visitEmbeddedPage,
} from "../support/embedding-dashboard";
import { openLegacyStaticEmbeddingModal, visitIframe } from "../support/embedding";
import {
  assertEChartsTooltip,
  assertOnXYAxisLabels,
  cartesianChartCircles,
  downloadsQuestionDetails,
  echartsContainer,
  joinedQuestion,
  questionWithAggregation,
  regularQuestion,
  tooltip,
  triggerMousemove,
} from "../support/embedding-questions";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import { icon, main, popover, visitQuestion } from "../support/ui";

const { ORDERS, PRODUCTS, ORDERS_ID } = SAMPLE_DATABASE as {
  ORDERS: Record<string, number>;
  PRODUCTS: Record<string, number>;
  ORDERS_ID: number;
};

/**
 * Port of the shared beforeEach data setup used by the first two describes:
 * remap Product ID -> Product Title, and hide Subtotal globally.
 */
async function setupDataModel(api: import("../support/api").MetabaseApi) {
  await api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
    name: "Product ID as Title",
    type: "external",
    human_readable_field_id: PRODUCTS.TITLE,
  });
  await api.put(`/api/field/${ORDERS.SUBTOTAL}`, {
    visibility_type: "sensitive",
  });
}

test.describe("scenarios > embedding > questions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await setupDataModel(mb.api);
  });

  test("should display a dashboard question correctly", async ({ page, mb }) => {
    const card = await createQuestion(mb.api, {
      name: "Total Orders",
      dashboard_id: ORDERS_DASHBOARD_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "scalar",
      enable_embedding: true,
    });

    await visitQuestion(page, card.id);

    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "question",
      resourceId: card.id,
      activeTab: "parameters",
      unpublishBeforeOpen: false,
    });

    const { frame, url } = await visitIframe(page, mb);

    expect(url).toContain("embed");

    const embed = frame.getByTestId("embed-frame");
    await expect(embed.getByText("Total Orders", { exact: true })).toBeVisible();
    await expect(embed.getByText("18,760", { exact: true })).toBeVisible();
  });

  test("should display the regular GUI question correctly", async ({
    page,
    mb,
  }) => {
    const { name: title, description } = regularQuestion;

    const card = await createQuestion(mb.api, regularQuestion);
    await mb.api.put(`/api/card/${card.id}`, { enable_embedding: true });

    await visitQuestion(page, card.id);
    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "question",
      resourceId: card.id,
      activeTab: "parameters",
      unpublishBeforeOpen: false,
    });

    const { frame } = await visitIframe(page, mb);

    const embed = frame.getByTestId("embed-frame");
    await expect(embed.getByText(title, { exact: true })).toBeVisible();

    await icon(embed, "info").hover();
    await expect(tooltip(frame)).toContainText(description);

    // Data model: Renamed column
    await expect(
      embed.getByText("Product ID as Title", { exact: true }),
    ).toBeVisible();
    // Data model: Display value changed to show FK
    await expect(
      embed.getByText("Awesome Concrete Shoes", { exact: true }),
    ).toBeVisible();
    // Custom column
    await expect(embed.getByText("Math", { exact: true })).toBeVisible();
    // Question settings: Renamed column
    await expect(embed.getByText("Billed", { exact: true })).toBeVisible();
    // Question settings: Column formatting
    await expect(embed.getByText("€39.72", { exact: true })).toBeVisible();
    // Question settings: Abbreviated date, day enabled, 24H clock with seconds
    await expect(
      embed.getByText("Fri, Feb 11, 2028, 21:40:27", { exact: true }),
    ).toBeVisible();
    // Question settings: Show mini-bar
    await expect(
      embed.getByTestId("mini-bar-container").first(),
    ).toBeVisible();

    // Data model: Subtotal is turned off globally
    await expect(embed.getByText("Subtotal", { exact: true })).toHaveCount(0);
  });

  test("should display the GUI question with aggregation correctly", async ({
    page,
    mb,
  }) => {
    const card = await createQuestion(mb.api, questionWithAggregation);
    await mb.api.put(`/api/card/${card.id}`, { enable_embedding: true });

    await visitQuestion(page, card.id);
    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "question",
      resourceId: card.id,
      activeTab: "parameters",
      unpublishBeforeOpen: false,
    });

    const { frame } = await visitIframe(page, mb);

    await assertOnXYAxisLabels(frame, { xLabel: "Created At", yLabel: "Count" });

    await expect(echartsContainer(frame).getByText(/2025/)).toHaveCount(5);
    await expect(echartsContainer(frame).getByText("Apr 2025")).toBeVisible();

    await expect(echartsContainer(frame)).toContainText("60");

    // Check the tooltip for the last point on the line. The point sits on the
    // right plot edge and the synthetic mousemove can land a beat before
    // zrender is ready to open the tooltip, so re-nudge until it appears
    // (the widget-state re-nudge pattern; nothing in the DOM distinguishes the
    // "dispatched but not yet shown" state).
    const circles = cartesianChartCircles(frame).filter({ visible: true });
    await expect(circles.last()).toBeVisible();
    await expect(async () => {
      await triggerMousemove(circles.last());
      await assertEChartsTooltip(frame, {
        header: "Aug 2025",
        rows: [{ name: "2", value: "79" }],
      });
    }).toPass({ timeout: 15000 });
  });

  test("should display the nested GUI question correctly", async ({
    page,
    mb,
  }) => {
    const base = await createQuestion(mb.api, regularQuestion);
    const nested = await createQuestion(mb.api, {
      query: { "source-table": `card__${base.id}`, limit: 10 },
    });
    await mb.api.put(`/api/card/${nested.id}`, { enable_embedding: true });

    await visitQuestion(page, nested.id);
    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "question",
      resourceId: nested.id,
      activeTab: "parameters",
      unpublishBeforeOpen: false,
    });

    const { frame } = await visitIframe(page, mb);

    // Global (Data model) settings should be preserved
    await expect(
      frame.getByText("Product ID as Title", { exact: true }),
    ).toBeVisible();
    await expect(
      frame.getByText("Awesome Concrete Shoes", { exact: true }),
    ).toBeVisible();

    // Custom column
    await expect(frame.getByText("Math", { exact: true })).toBeVisible();

    // Base question visualization settings should reset to the defaults
    // (inherit global formatting)
    await expect(frame.getByText("Total", { exact: true })).toBeVisible();
    await expect(frame.getByText("39.72", { exact: true })).toBeVisible();
    await expect(
      frame.getByText("February 11, 2028, 9:40 PM", { exact: true }),
    ).toBeVisible();

    await expect(frame.getByTestId("mini-bar-container")).toHaveCount(0);

    // Data model: Subtotal is turned off globally
    await expect(frame.getByText("Subtotal", { exact: true })).toHaveCount(0);
  });

  test("should display GUI question with explicit joins correctly", async ({
    page,
    mb,
  }) => {
    const card = await createQuestion(mb.api, joinedQuestion);
    await mb.api.put(`/api/card/${card.id}`, { enable_embedding: true });

    await visitQuestion(page, card.id);
    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "question",
      resourceId: card.id,
      activeTab: "parameters",
      unpublishBeforeOpen: false,
    });

    const { frame } = await visitIframe(page, mb);

    // Base question assertions
    const vizRoot = frame.getByTestId("visualization-root");
    await expect(vizRoot).toContainText("Product ID as Title");
    await expect(vizRoot).toContainText("Awesome Concrete Shoes");
    await expect(vizRoot).toContainText("Math");
    await expect(vizRoot).toContainText("Billed");
    await expect(vizRoot).toContainText("€39.72");
    await expect(vizRoot).toContainText("Fri, Feb 11, 2028, 21:40:27");
    await expect(vizRoot).not.toContainText("Subtotal");

    await expect(frame.getByTestId("mini-bar-container")).toHaveCount(5);

    // Scroll the interactive table to the far right (cy.scrollTo("right") with
    // no duration → assign scrollLeft directly).
    await frame.getByTestId("table-scroll-container").evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });

    // Joined table fields
    await expect(vizRoot).toContainText("98.52598640° W");
    await expect(vizRoot).toContainText("User → Birth Date");
    await expect(vizRoot).toContainText("December 12, 1986");
    await expect(vizRoot).toContainText("October 7, 2026, 1:34 AM");
  });
});

test.describe("scenarios [EE] > embedding > questions", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await setupDataModel(mb.api);
  });

  test("should display according to `#locale` hash parameter (metabase#22561, metabase#50182)", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
      enable_embedding: true,
    });

    // We don't have a de-CH.json file, so it should fallback to de.json, see
    // metabase#51039 for more details
    const deLocale = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/app/locales/de.json",
    );

    await visitEmbeddedPage(
      page,
      mb,
      { resource: { question: ORDERS_QUESTION_ID }, params: {} },
      { additionalHashOptions: { locale: "de-CH" } },
    );

    await deLocale;

    await main(page)
      .getByText("Februar 11, 2028, 9:40 PM", { exact: true })
      .hover();
    await expect(
      page.getByRole("button", { name: "Ergebnis downloaden", exact: true }),
    ).toBeVisible();
    await expect.poll(() => page.url()).toContain("locale=de");
  });

  test("should display according to `#font` hash parameter (metabase#45638)", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
      enable_embedding: true,
    });

    await visitEmbeddedPage(
      page,
      mb,
      { resource: { question: ORDERS_QUESTION_ID }, params: {} },
      { additionalHashOptions: { font: "Roboto" } },
    );

    await expect(main(page)).toHaveCSS(
      "font-family",
      'Roboto, "Noto Sans", sans-serif',
    );
  });
});

test.describe("scenarios > embedding > questions > downloads", () => {
  let questionId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const card = await createNativeQuestion(mb.api, downloadsQuestionDetails);
    questionId = card.id;
  });

  test.describe("without token", () => {
    test("should not be possible to disable downloads", async ({
      page,
      mb,
    }) => {
      await visitQuestion(page, questionId);

      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource: "question",
        resourceId: questionId,
        activeTab: "lookAndFeel",
      });

      // Embedding settings page should not show option to disable downloads
      await expect(
        page.getByLabel("Customizing look and feel", { exact: true }),
      ).not.toContainText("Download (csv, xlsx, json, png)");

      // Use API to "publish" this question and to enable its filter
      await mb.api.put(`/api/card/${questionId}`, {
        enable_embedding: true,
        embedding_params: { text: "enabled" },
      });

      // Visit embedded question and set its filter through query parameters
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { question: questionId }, params: {} },
        { setFilters: { text: "Foo" } },
      );

      await expect(page.getByRole("gridcell").first()).toHaveText("Foo");
      await main(page).hover();
      await page.getByRole("button", { name: "Download results" }).click();

      await expect(popover(page).getByText("Download", { exact: true })).toBeVisible();
      await expect(popover(page).getByText(".csv", { exact: true })).toBeVisible();
      await expect(popover(page).getByText(".xlsx", { exact: true })).toBeVisible();
      await expect(popover(page).getByText(".json", { exact: true })).toBeVisible();

      // Trying to prevent downloads via query params doesn't have any effect
      await page.goto(page.url() + "&downloads=false");

      await expect(page.getByRole("gridcell").first()).toHaveText("Foo");
      await main(page).hover();
      await expect(
        page.getByRole("button", { name: "Download results" }),
      ).toBeVisible();
    });
  });

  test.describe("premium token with paid features", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should be possible to disable downloads", async ({ page, mb }) => {
      await visitQuestion(page, questionId);

      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource: "question",
        resourceId: questionId,
        activeTab: "lookAndFeel",
      });

      // Disable downloads
      const downloadToggle = page.getByLabel("Download (csv, xlsx, json, png)");
      await expect(downloadToggle).toBeChecked();

      await downloadToggle.click({ force: true });
      await expect(downloadToggle).not.toBeChecked();

      // Use API to "publish" this question and to enable its filter
      await mb.api.put(`/api/card/${questionId}`, {
        enable_embedding: true,
        embedding_params: { text: "enabled" },
      });

      const { frame } = await visitIframe(page, mb);

      const textWidget = frame
        .getByTestId("parameter-widget")
        .getByRole("textbox");
      await textWidget.fill("Foo");
      await textWidget.press("Enter");
      await expect(frame.getByRole("gridcell").first()).toHaveText("Foo");

      await expect
        .poll(() => new URL(page.frame("embed")?.url() ?? "http://x/").search)
        .toBe("?text=Foo");
      await expect
        .poll(() => new URL(page.frame("embed")?.url() ?? "http://x/").hash)
        .toMatch(/&downloads=false$/);

      // We don't even show the footer if it's empty
      await expect(frame.getByRole("contentinfo")).toHaveCount(0);
      await expect(icon(frame, "download")).toHaveCount(0);
    });
  });
});
