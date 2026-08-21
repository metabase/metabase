/**
 * Playwright port of
 * e2e/test/scenarios/embedding/embedding-native.cy.spec.js — static ("guest")
 * embedding of a NATIVE question with SQL parameters (locked / editable /
 * disabled params, default values, the static-embedding-modal Preview flow and
 * the signed-token flow).
 *
 * Porting notes:
 * - Two visit flows, matching upstream:
 *   - H.visitIframe (the static-embedding-modal Preview) frames the embed in
 *     the support/embedding.ts harness and returns a FrameLocator, so those
 *     assertions run through `frame`. cy.location("search") there reads the
 *     framed embed's own URL — page.frame("embed")?.url() — not the harness
 *     page url (precedent: embedding-dashboard.spec.ts required-default test).
 *   - H.visitEmbeddedPage signs a JWT and navigates the top-level page, so
 *     those assertions are page-scoped and cy.location("search") === page url.
 * - cy.contains(str) is case-sensitive substring (first match) → caseSensitive
 *   regex; findByText(str) is exact.
 * - should("have.length", 4).and("contain", "OR") on the widget SET is an
 *   any-of assertion → a filter({hasText}) count, not .first() (PORTING rule 3).
 * - cy.findByDisplayValue("Organic") matches the Source text-filter input →
 *   scoped textbox toHaveValue.
 * - Date assertion ("December 29, 2027, 4:54 AM") is timezone-sensitive; run
 *   with TZ=US/Pacific (CI sets it).
 * - No never-awaited intercepts; no snowplow.
 */
import type { FrameLocator, Page } from "@playwright/test";

import {
  closeStaticEmbeddingModal,
  openLegacyStaticEmbeddingModal,
  publishChanges,
  setEmbeddingParameter,
  assertEmbeddingParameter,
  visitEmbeddedPage,
  questionDetails as questionDetailsWithSource,
  questionDetailsWithDefaults,
} from "../support/embedding-dashboard";
import { visitIframe } from "../support/embedding";
import {
  assertRequiredEnabledForName,
  questionDetails,
} from "../support/embedding-native";
import { createNativeQuestion } from "../support/factories";
import { clearFilterWidget, filterWidget } from "../support/dashboard-parameters";
import { test, expect } from "../support/fixtures";
import { tableInteractiveBody } from "../support/question-new";
import { icon, popover, visitQuestion } from "../support/ui";

type Scope = Page | FrameLocator;

/** cy.contains semantics: case-sensitive substring. */
function caseSensitive(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

/** parameter-widget locator that also works against a FrameLocator scope. */
function filterWidgetsIn(scope: Scope) {
  return scope.getByTestId("parameter-widget");
}

/**
 * Port of the UI context's createAndVisitQuestion: create the native question
 * (optionally making one tag required with a default), visit it, and open the
 * static-embedding modal's Parameters tab.
 */
async function createAndVisitQuestion(
  page: Page,
  mb: { api: import("../support/api").MetabaseApi },
  {
    requiredTagName,
    defaultValue,
  }: { requiredTagName?: string; defaultValue?: unknown } = {},
): Promise<number> {
  const details = structuredClone(questionDetails);

  if (requiredTagName) {
    const tags = details.native["template-tags"] as Record<
      string,
      Record<string, unknown>
    >;
    tags[requiredTagName].default = defaultValue;
    tags[requiredTagName].required = true;
  }

  const card = await createNativeQuestion(mb.api, details);
  await visitQuestion(page, card.id);

  await openLegacyStaticEmbeddingModal(page, mb.api, {
    resource: "question",
    resourceId: card.id,
    activeTab: "parameters",
  });

  return card.id;
}

test.describe("scenarios > embedding > native questions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("UI", () => {
    test("should not display disabled parameters", async ({ page, mb }) => {
      await createAndVisitQuestion(page, mb);

      await publishChanges(page, "card", (body) => {
        expect(body.embedding_params).toEqual({
          id: "disabled",
          state: "disabled",
          created_at: "disabled",
          total: "disabled",
          source: "disabled",
          product_id: "disabled",
        });
      });

      const { frame } = await visitIframe(page, mb);

      await expect(frame.getByText(caseSensitive("Lora Cronin")).first()).toBeVisible();
      await expect(frame.getByText(caseSensitive("Organic")).first()).toBeVisible();
      await expect(frame.getByText(caseSensitive("39.58")).first()).toBeVisible();

      await expect(filterWidgetsIn(frame)).toHaveCount(0);
    });

    test("should display and work with enabled parameters while hiding the locked one", async ({
      page,
      mb,
    }) => {
      const questionId = await createAndVisitQuestion(page, mb);

      await setEmbeddingParameter(page, "Order ID", "Editable");
      await setEmbeddingParameter(page, "Created At", "Editable");
      await setEmbeddingParameter(page, "Total", "Locked");
      await setEmbeddingParameter(page, "State", "Editable");
      await setEmbeddingParameter(page, "Product ID", "Editable");

      await publishChanges(page, "card", (body) => {
        expect(body.embedding_params).toEqual({
          id: "enabled",
          created_at: "enabled",
          total: "locked",
          state: "enabled",
          product_id: "enabled",
          source: "disabled",
        });
      });

      await visitEmbeddedPage(page, mb, {
        resource: { question: questionId },
        params: { total: [] },
      });

      await expect(page.getByText(caseSensitive("Organic")).first()).toBeVisible();
      await expect(page.getByText(caseSensitive("Twitter"))).toHaveCount(0);

      // Created At: Q2 2026
      await filterWidget(page, { name: "Created At" }).first().click();
      await popover(page).getByText(/20\d+/).first().click();
      await popover(page).getByText(/2026/).first().click();
      await page.getByText("Q2", { exact: true }).click();

      // State: is not KS
      await filterWidget(page, { name: "State" }).first().click();
      const stateSearch = page.getByPlaceholder("Search the list");
      await stateSearch.pressSequentially("KS");
      await stateSearch.press("Enter");
      await expect(page.getByTestId(/-filter-value$/)).toHaveCount(1);
      await expect(page.getByLabel("KS", { exact: true })).toBeVisible();
      await page.getByLabel("KS", { exact: true }).click();
      await page.getByRole("button", { name: "Add filter" }).click();

      await expect(page.getByText("Logan Weber", { exact: true })).toHaveCount(0);

      // Product ID is 10. The number widget drops its placeholder attribute
      // once it holds a value, so re-resolving by placeholder for a second
      // action fails — fill leaves it focused, so submit via the keyboard.
      await page.getByPlaceholder("Product ID").fill("10");
      await page.keyboard.press("Enter");

      await expect(page.getByText(caseSensitive("Affiliate"))).toHaveCount(0);

      // Let's try to remove one filter
      const q2Widget = filterWidget(page, { name: "Q2 2026" });
      await q2Widget.hover();
      await icon(q2Widget, "close").click();

      // Order ID is 926 - there should be only one result after this
      await filterWidget(page, { name: "Order ID" }).first().click();
      await page.getByPlaceholder("Enter an ID").fill("926");
      await page.getByRole("button", { name: "Add filter" }).click();

      await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);

      await expect(
        page.getByText("December 29, 2027, 4:54 AM", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("CO", { exact: true })).toBeVisible();
      await expect(page.getByText("Sid Mills", { exact: true })).toHaveCount(0);

      await expect
        .poll(() => new URL(page.url()).search)
        .toContain("product_id=10");
      const search = new URL(page.url()).search;
      expect(search).toContain("created_at=");
      expect(search).toContain("id=926");
      expect(search).toContain("state=KS");
    });

    test("should handle required parameters", async ({ page, mb }) => {
      await createAndVisitQuestion(page, mb, {
        requiredTagName: "total",
        defaultValue: [100],
      });

      await assertEmbeddingParameter(page, "Total", "Editable");

      await publishChanges(page, "card", (body) => {
        // We only expect total to be "enabled" because the rest weren't
        // touched and therefore aren't changed, whereas "enabled" must be set
        // by default for required params.
        expect(body.embedding_params).toEqual({
          id: "disabled",
          state: "disabled",
          created_at: "disabled",
          total: "enabled",
          source: "disabled",
          product_id: "disabled",
        });
      });

      const { frame } = await visitIframe(page, mb);

      // Filter widget must be visible
      await expect(
        filterWidgetsIn(frame).filter({ hasText: caseSensitive("Total") }).first(),
      ).toBeVisible();

      // And its default value must be in the (framed) embed's URL
      await expect
        .poll(() => new URL(page.frame("embed")?.url() ?? "http://x/").search)
        .toBe("?total=100");
    });

    test("should (dis)allow setting parameters as required for a published embedding", async ({
      page,
      mb,
    }) => {
      await createAndVisitQuestion(page, mb);
      // Make one parameter editable and one locked
      await setEmbeddingParameter(page, "Order ID", "Editable");
      await setEmbeddingParameter(page, "Total", "Locked");

      await publishChanges(page, "card");
      await closeStaticEmbeddingModal(page);

      await page
        .getByTestId("native-query-editor-container")
        .getByText("Open Editor", { exact: true })
        .click();

      // Open variable editor
      await icon(
        page.getByTestId("native-query-editor-action-buttons"),
        "variable",
      ).click();

      // Now check that all disabled parameters can't be required and the rest can
      await assertRequiredEnabledForName(page, { name: "id", enabled: true });
      await assertRequiredEnabledForName(page, { name: "total", enabled: true });
      // disabled parameters
      await assertRequiredEnabledForName(page, {
        name: "created_at",
        enabled: false,
      });
      await assertRequiredEnabledForName(page, {
        name: "source",
        enabled: false,
      });
      await assertRequiredEnabledForName(page, { name: "state", enabled: false });
      await assertRequiredEnabledForName(page, {
        name: "product_id",
        enabled: false,
      });
    });
  });

  test.describe("API", () => {
    let questionId: number;

    test.beforeEach(async ({ mb }) => {
      const card = await createNativeQuestion(mb.api, questionDetails);
      questionId = card.id;
    });

    test("should hide filters via url", async ({ page, mb }) => {
      await mb.api.put(`/api/card/${questionId}`, {
        enable_embedding: true,
        embedding_params: {
          id: "enabled",
          product_id: "enabled",
          state: "enabled",
          created_at: "enabled",
          total: "enabled",
        },
      });

      // It should be possible to both set the filter value and hide it at the
      // same time. That's synonymous to the locked filter.
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { question: questionId }, params: {} },
        {
          setFilters: { id: 92 },
          additionalHashOptions: {
            hideFilters: ["id", "product_id", "state", "created_at", "total"],
          },
        },
      );

      await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);
      await expect(page.getByText("92", { exact: true }).first()).toBeVisible();

      await expect(filterWidgetsIn(page)).toHaveCount(0);
    });

    test("should set multiple filter values via url", async ({ page, mb }) => {
      await mb.api.put(`/api/card/${questionId}`, {
        enable_embedding: true,
        embedding_params: {
          created_at: "enabled",
          source: "enabled",
          state: "enabled",
          total: "enabled",
        },
      });

      await visitEmbeddedPage(
        page,
        mb,
        { resource: { question: questionId }, params: {} },
        { setFilters: { created_at: "Q2-2028", source: "Organic", state: "OR" } },
      );

      await expect(filterWidgetsIn(page)).toHaveCount(4);
      await expect(
        filterWidgetsIn(page).filter({ hasText: caseSensitive("OR") }),
      ).not.toHaveCount(0);
      await expect(
        filterWidgetsIn(page).filter({ hasText: caseSensitive("Q2 2028") }),
      ).not.toHaveCount(0);
      // Why do we use input field in one filter widget but a simple span in the
      // other one? — the Source text filter renders an input showing "Organic".
      await expect(
        filterWidget(page, { name: "Source" }).getByRole("textbox"),
      ).toHaveValue("Organic");

      // Total's value should fall back to the default one (`0`) because we
      // didn't set it explicitly
      await expect(filterWidget(page, { name: "Total" })).toContainText("0");

      await expect(page.getByText(caseSensitive("Emilie Goyette")).first()).toBeVisible();
      await expect(page.getByText(caseSensitive("35.7")).first()).toBeVisible();

      // OTOH, we should also be able to override the default filter value by
      // explicitly setting it
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { question: questionId }, params: {} },
        { setFilters: { total: 80 } },
      );

      await expect(filterWidget(page, { name: "Total" })).toContainText("80");

      await expect(page.getByText(caseSensitive("35.7"))).toHaveCount(0);
    });

    test("should lock all parameters", async ({ page, mb }) => {
      await mb.api.put(`/api/card/${questionId}`, {
        enable_embedding: true,
        embedding_params: {
          id: "locked",
          product_id: "locked",
          state: "locked",
          created_at: "locked",
          total: "locked",
          source: "locked",
        },
      });

      await visitEmbeddedPage(page, mb, {
        resource: { question: questionId },
        params: {
          id: [92, 96, 102, 104],
          product_id: [140],
          state: ["AK", "TX"],
          created_at: "Q3-2027",
          total: [10],
          source: ["Organic"],
        },
      });

      await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);
      await expect(page.getByText("66.8", { exact: true }).first()).toBeVisible();

      await expect(filterWidgetsIn(page)).toHaveCount(0);
    });
  });

  test.describe("locked parameters", () => {
    let questionId: number;

    test.beforeEach(async ({ mb }) => {
      const nameParameter = (
        questionDetailsWithSource.native["template-tags"] as Record<
          string,
          { name: string }
        >
      ).name;
      const sourceParameter = (
        questionDetailsWithSource.native["template-tags"] as Record<
          string,
          { name: string }
        >
      ).source;

      const card = await createNativeQuestion(mb.api, questionDetailsWithSource);
      questionId = card.id;

      await mb.api.put(`/api/card/${questionId}`, {
        enable_embedding: true,
        embedding_params: {
          [nameParameter.name]: "enabled",
          [sourceParameter.name]: "locked",
        },
      });
    });

    test("locked parameters require a value to be specified in the JWT", async ({
      page,
      mb,
    }) => {
      await visitEmbeddedPage(page, mb, {
        resource: { question: questionId },
        params: { source: null },
      });

      await expect(
        page.getByText("You must specify a value for :source in the JWT.", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("locked parameters should still render results in the preview by default (metabase#47570)", async ({
      page,
      mb,
    }) => {
      await visitQuestion(page, questionId);
      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource: "question",
        resourceId: questionId,
        activeTab: "parameters",
        unpublishBeforeOpen: false,
      });

      const { frame } = await visitIframe(page, mb);

      // should show card results by default
      await expect(
        frame.getByTestId("visualization-root").getByText("2,500", { exact: true }),
      ).toBeVisible();
      await expect(
        frame.getByRole("heading", { name: "test question", exact: true }),
      ).toBeVisible();
    });
  });
});

test.describe("scenarios > embedding > native questions with default parameters", () => {
  let questionId: number;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const card = await createNativeQuestion(mb.api, questionDetailsWithDefaults);
    questionId = card.id;
    await visitQuestion(page, card.id);

    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "question",
      resourceId: questionId,
      activeTab: "parameters",
    });

    // Note: ID is disabled
    await setEmbeddingParameter(page, "Source", "Locked");
    await setEmbeddingParameter(page, "Name", "Editable");
    await publishChanges(page, "card", (body) => {
      expect(body.embedding_params).toEqual({
        id: "disabled",
        source: "locked",
        name: "enabled",
        user_id: "disabled",
      });
    });
  });

  test("card parameter defaults should apply for disabled parameters, but not for editable or locked parameters", async ({
    page,
    mb,
  }) => {
    await visitEmbeddedPage(page, mb, {
      resource: { question: questionId },
      params: { source: [] },
    });

    // Remove default filter value
    await clearFilterWidget(page);

    // The ID default (1, 2) should apply, because it is disabled.
    // The Name default ('Lina Heaney') should not apply, because the Name param
    // is editable and empty.
    // The Source default ('Facebook') should not apply because the param is
    // locked but the value is unset.
    // If either the Name or Source default applied the result would be 0.
    await expect(page.getByTestId("scalar-value")).toHaveText("2");
  });
});
