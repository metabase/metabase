/**
 * Playwright port of
 * e2e/test/scenarios/embedding/embedding-reproductions.cy.spec.js — a grab-bag
 * of static ("guest") + full-app embedding regression reproductions.
 *
 * Gating (per the playbook):
 * - issues 15860 and 49142 are tagged @skip upstream → test.describe.skip
 *   (preserved, not deleted). 49142's reason: "does not make sense when CSP is
 *   disabled". 15860's reason travels with the upstream tag.
 * - issue 27643 is tagged @external (QA Postgres) → test.skip on
 *   PW_QA_DB_ENABLED.
 * - issue 51934 (EMB-189) restores the postgres-12 snapshot and builds models
 *   from QA-Postgres tables, and needs a token for full-app embedding → gated
 *   on BOTH PW_QA_DB_ENABLED and a pro-self-hosted token.
 * - issues 30535 and 8490 activate a pro-self-hosted token → test.skip on
 *   resolveToken (+ activateToken in beforeEach).
 *
 * Porting notes:
 * - H.visitEmbeddedPage navigates the top-level page straight to the signed
 *   /embed/* url; H.visitIframe frames the static-modal preview and returns a
 *   FrameLocator (support/embedding.ts). H.getIframeBody() is the live preview
 *   iframe inside the static-embedding modal (support/embedding-repros.ts).
 * - The `cy.wait("@getEmbed")` / `@previewValues` pacing waits are dropped:
 *   they gate re-fetches that Playwright's web-first assertions already wait
 *   for. The dropped waits are noted at their call sites.
 * - Cypress's `defer()` / `res.setDelay(MINUTE)` embed intercepts (8490 /
 *   50182) become holdEmbedRoute (support/embedding-repros.ts): hold the embed
 *   response until release() so the loading state can be asserted.
 * - `.CardVisualization` (a legacy class name) assertions are re-anchored on
 *   the dashcard testid / result text to avoid selecting on class names.
 * - issue 41635's first `getIframeBody().within(() => button(name).not.exist)`
 *   is a Cypress iframe-caching load-race artifact (it immediately clicks the
 *   same button next) — ported as a positive load-wait. See findings.
 */
import type { FrameLocator, Page } from "@playwright/test";

import { resolveToken } from "../support/api";
import { getDashboardCard, modal, selectDropdown } from "../support/dashboard";
import { toggleFilterWidgetValues } from "../support/dashboard-card-repros";
import { sandboxTable } from "../support/dashboard-repros";
import {
  addOrUpdateDashboardCard,
  createDashboard,
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
  embeddedPageAbsoluteUrl,
  openLegacyStaticEmbeddingModal,
  publishChanges,
  setEmbeddingParameter,
  visitEmbeddedPage,
} from "../support/embedding-dashboard";
import {
  createDashboardWithQuestions,
  createModelFromTableName,
  getFieldIdByName,
  getIframeBody,
  holdEmbedRoute,
  moveCardToCollection,
  setDefaultValueForLockedFilter,
  tableInteractiveHeader,
} from "../support/embedding-repros";
import {
  currentIframeSrc,
  visitIframe,
  visitStaticEmbedUrl,
} from "../support/embedding";
import { editDashboardCard, updateDashboardCards } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import {
  getNotebookStep,
  icon,
  visitFullAppEmbeddingUrl,
} from "../support/interactive-embedding";
import { tableInteractive } from "../support/models";
import { queryBuilderMain } from "../support/notebook";
import { visitPublicDashboard } from "../support/question-saved";
import { ORDERS_DASHBOARD_ID, SAMPLE_DATABASE } from "../support/sample-data";
import { createCollection } from "../support/search";
import { visitPublicQuestion } from "../support/sharing";
import { popover, visitDashboard, visitQuestion } from "../support/ui";

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID, FEEDBACK, FEEDBACK_ID } =
  SAMPLE_DATABASE as {
    PRODUCTS: Record<string, number>;
    PRODUCTS_ID: number;
    ORDERS: Record<string, number>;
    ORDERS_ID: number;
    FEEDBACK: Record<string, number>;
    FEEDBACK_ID: number;
  };

const TOKEN_SKIP = "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend";
const QA_DB_SKIP =
  "@external — requires the QA Postgres database (set PW_QA_DB_ENABLED)";

/** cy.contains semantics: case-sensitive substring. */
function caseSensitive(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

type Scope = Page | FrameLocator;

/** Port of H.filterWidget() — all parameter widgets in `scope`. */
function filterWidgets(scope: Scope) {
  return scope.getByTestId("parameter-widget");
}

/** Matches the preview-embed linked-filter values fetch (Cypress's
 * `@previewValues` — GET /api/preview_embed/dashboard/:token/params/:id/values). */
function isPreviewValues(response: {
  url(): string;
  request(): { method(): string };
}): boolean {
  return (
    response.request().method() === "GET" &&
    /^\/api\/preview_embed\/dashboard\/[^/]+\/params\/[^/]+\/values$/.test(
      new URL(response.url()).pathname,
    )
  );
}

// ===========================================================================
// issue 15860 (@skip upstream)
// ===========================================================================

test.describe.skip("issue 15860", () => {
  const q1IdFilter = {
    name: "Q1 ID",
    slug: "q1_id",
    id: "fde6db8b",
    type: "id",
    sectionId: "id",
    default: [1],
  };
  const q1CategoryFilter = {
    name: "Q1 Category",
    slug: "q1_category",
    id: "e8ff3175",
    type: "string/=",
    sectionId: "string",
    filteringParameters: [q1IdFilter.id],
  };
  const q2IdFilter = {
    name: "Q2 ID",
    slug: "q2_id",
    id: "t3e6hb7b",
    type: "id",
    sectionId: "id",
    default: [3],
  };
  const q2CategoryFilter = {
    name: "Q2 Category",
    slug: "q2_category",
    id: "ca1n357o",
    type: "string/=",
    sectionId: "string",
    filteringParameters: [q2IdFilter.id],
  };

  let dashboardId: number;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "Q1",
        query: { "source-table": PRODUCTS_ID },
      },
      dashboardDetails: {
        embedding_params: {
          q1_id: "locked",
          q1_category: "enabled",
          q2_id: "locked",
          q2_category: "enabled",
        },
        enable_embedding: true,
        parameters: [q1IdFilter, q1CategoryFilter, q2IdFilter, q2CategoryFilter],
      },
      cardDetails: { size_x: 11, size_y: 6 },
    });
    const q1 = dashcard.card_id;
    dashboardId = dashcard.dashboard_id;

    const { id: q2 } = await createQuestion(mb.api, {
      name: "Q2",
      query: { "source-table": PRODUCTS_ID },
    });

    await updateDashboardCards(mb.api, {
      dashboard_id: dashboardId,
      cards: [
        {
          card_id: q2,
          row: 0,
          col: 8,
          size_x: 13,
          size_y: 6,
          parameter_mappings: [
            {
              parameter_id: q2IdFilter.id,
              card_id: q2,
              target: ["dimension", ["field", PRODUCTS.ID, null]],
            },
            {
              parameter_id: q2CategoryFilter.id,
              card_id: q2,
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
            },
          ],
        },
        {
          card_id: q1,
          parameter_mappings: [
            {
              parameter_id: q1IdFilter.id,
              card_id: q1,
              target: ["dimension", ["field", PRODUCTS.ID, null]],
            },
            {
              parameter_id: q1CategoryFilter.id,
              card_id: q1,
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
            },
          ],
        },
      ],
    });

    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      embedding_params: {
        q1_id: "locked",
        q1_category: "enabled",
        q2_id: "locked",
        q2_category: "enabled",
      },
      enable_embedding: true,
    });

    await visitDashboard(page, mb.api, dashboardId);

    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "dashboard",
      resourceId: dashboardId,
      activeTab: "parameters",
      unpublishBeforeOpen: false,
    });
  });

  test("should work for locked linked filters connected to different cards with the same source table (metabase#15860)", async ({
    page,
    mb,
  }) => {
    await setDefaultValueForLockedFilter(page, "Q1 ID", 1);
    await setDefaultValueForLockedFilter(page, "Q2 ID", 3);

    const { frame } = await visitIframe(page, mb);

    await frame.getByText("Q1 Category", { exact: true }).click();
    await expect(popover(frame).getByRole("listitem")).toHaveCount(1);
    await expect(popover(frame).getByRole("listitem")).toContainText("Gizmo");

    await frame.getByText("Q2 Category", { exact: true }).click();
    await expect(popover(frame).getByRole("listitem")).toHaveCount(1);
    await expect(popover(frame).getByRole("listitem")).toContainText("Doohickey");
  });
});

// ===========================================================================
// issue 20438
// ===========================================================================

test.describe("issue 20438", () => {
  const questionDetails = {
    name: "20438",
    native: {
      query:
        "SELECT * FROM PRODUCTS\nWHERE true\n    [[AND {{CATEGORY}}]]\n limit 30",
      "template-tags": {
        CATEGORY: {
          id: "24f69111-29f8-135f-9321-1ff94bbb31ad",
          name: "CATEGORY",
          "display-name": "Category",
          type: "dimension",
          dimension: ["field", PRODUCTS.CATEGORY, null],
          "widget-type": "string/=",
          default: null,
        },
      },
    },
  };

  const filter = {
    name: "Text",
    slug: "text",
    id: "b555d25b",
    type: "string/=",
    sectionId: "string",
  };

  let dashboardId: number;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashcard = await createNativeQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails: { parameters: [filter] },
    });
    dashboardId = dashcard.dashboard_id;

    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      dashcards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 24,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["template-tag", "CATEGORY"]],
            },
          ],
        },
      ],
    });

    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      enable_embedding: true,
      embedding_params: { [filter.slug]: "enabled" },
    });

    await visitDashboard(page, mb.api, dashboardId);
  });

  test("dashboard filter connected to the field filter should work with a single value in embedded dashboards (metabase#20438)", async ({
    page,
    mb,
  }) => {
    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "dashboard",
      resourceId: dashboardId,
      activeTab: "parameters",
      unpublishBeforeOpen: false,
    });

    // Dropped: the four cy.wait("@getEmbed") pacing waits — the final grid
    // assertion below auto-retries until the filtered results render.
    const { frame } = await visitIframe(page, mb);

    await filterWidgets(frame).first().click();
    await popover(frame).getByText("Doohickey", { exact: true }).click();
    await frame.getByRole("button", { name: "Add filter", exact: true }).click();

    // One of the product titles for Doohickey, none for Gizmo.
    await expect(
      frame.getByRole("gridcell").filter({ hasText: "Small Marble Shoes" }).first(),
    ).toBeVisible();
    await expect(
      frame.getByRole("gridcell").filter({ hasText: "Rustic Paper Wallet" }),
    ).toHaveCount(0);
  });
});

// ===========================================================================
// locked parameters in embedded question (metabase#20634)
// ===========================================================================

test.describe("locked parameters in embedded question (metabase#20634)", () => {
  let questionId: number;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createNativeQuestion(mb.api, {
      name: "20634",
      native: {
        query: "select {{text}}",
        "template-tags": {
          text: {
            id: "abc-123",
            name: "text",
            "display-name": "Text",
            type: "text",
            default: null,
          },
        },
      },
    });
    questionId = id;
    await visitQuestion(page, questionId);
  });

  test("should let the user lock parameters to specific values", async ({
    page,
    mb,
  }) => {
    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "question",
      resourceId: questionId,
      activeTab: "parameters",
      unpublishBeforeOpen: false,
    });

    // Open the visibility dropdown for the Text parameter, then set it Locked.
    await modal(page).getByLabel("Text", { exact: true }).click();
    await selectDropdown(page).getByText("Locked", { exact: true }).click();

    // Set a parameter value inside the modal.
    await modal(page).getByPlaceholder("Text").pressSequentially("foo");
    await page.keyboard.press("Enter");

    await publishChanges(page, "card");

    const { frame } = await visitIframe(page, mb);

    // The Text parameter widget doesn't show up, but its value is reflected.
    await expect(frame.getByText("Text", { exact: true })).toHaveCount(0);
    await expect(
      frame.getByTestId("embed-frame").getByText("foo", { exact: true }),
    ).toBeVisible();
  });
});

// ===========================================================================
// issues 20845, 25031
// ===========================================================================

const defaultFilterValues: (string | undefined)[] = [undefined, "10"];

for (const value of defaultFilterValues) {
  const conditionalPartOfTestTitle = value
    ? "and the required filter with the default value"
    : "";

  const dashboardFilter = {
    name: "Equal to",
    slug: "equal_to",
    id: "c269ebe1",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails = { name: "25031", parameters: [dashboardFilter] };

  test.describe(`issues 20845, 25031 (default=${String(value)})`, () => {
    let questionId: number;
    let dashboardId: number;

    test.beforeEach(async ({ page, mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      const questionDetails = {
        name: "20845",
        native: {
          "template-tags": {
            qty_locked: {
              id: "6bd8d7be-bd5b-382c-cfa2-683461891663",
              name: "qty_locked",
              "display-name": "Qty locked",
              type: "number",
              required: value ? true : false,
              default: value,
            },
          },
          query:
            "select count(*) from orders where true [[AND quantity={{qty_locked}}]]",
        },
      };

      const dashcard = await createNativeQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      questionId = dashcard.card_id;
      dashboardId = dashcard.dashboard_id;

      await visitQuestion(page, questionId);

      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        dashcards: [
          {
            card_id: questionId,
            id: dashcard.id,
            row: 0,
            col: 0,
            size_x: 16,
            size_y: 10,
            parameter_mappings: [
              {
                parameter_id: dashboardFilter.id,
                card_id: questionId,
                target: ["variable", ["template-tag", "qty_locked"]],
              },
            ],
          },
        ],
      });
    });

    test(`QUESTION: locked parameter should work with numeric values ${conditionalPartOfTestTitle} (metabase#20845)`, async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/card/${questionId}`, {
        enable_embedding: true,
        embedding_params: { qty_locked: "locked" },
      });

      // Not reproducible via the UI — send the payload directly for both a
      // STRING and an INTEGER locked value.
      for (const type of ["string", "integer"] as const) {
        await visitEmbeddedPage(page, mb, {
          resource: { question: questionId },
          params: { qty_locked: type === "string" ? "15" : 15 },
        });
      }

      await expect(tableInteractiveHeader(page)).toBeVisible();
      await expect(
        page.getByRole("gridcell").filter({ hasText: "5" }).first(),
      ).toBeVisible();
    });

    test(`DASHBOARD: locked parameter should work with numeric values ${conditionalPartOfTestTitle} (metabase#25031)`, async ({
      page,
      mb,
    }) => {
      await visitDashboard(page, mb.api, dashboardId);
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        enable_embedding: true,
        embedding_params: { [dashboardFilter.slug]: "locked" },
      });

      for (const type of ["string", "integer"] as const) {
        await visitEmbeddedPage(page, mb, {
          resource: { dashboard: dashboardId },
          params: { [dashboardFilter.slug]: type === "string" ? "15" : 15 },
        });

        // Wait for the results to load.
        await expect(page.getByText(dashboardDetails.name).first()).toBeVisible();
        const card = getDashboardCard(page, 0);
        await expect(card.getByText("COUNT(*)", { exact: true })).toBeVisible();
        await expect(card.getByText("5", { exact: true }).first()).toBeVisible();
      }
    });
  });
}

// ===========================================================================
// issue 27643 (@external)
// ===========================================================================

test.describe("issue 27643", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP);

  const PG_DB_ID = 2;
  const TEMPLATE_TAG_NAME = "expected_invoice";
  const getQuestionDetails = (fieldId: number) => ({
    name: "27643",
    database: PG_DB_ID,
    native: {
      query:
        "SELECT * FROM INVOICES [[ where {{ expected_invoice }} ]] limit 1",
      "template-tags": {
        [TEMPLATE_TAG_NAME]: {
          id: "3cfb3686-0d13-48db-ab5b-100481a3a830",
          dimension: ["field", fieldId, null],
          name: TEMPLATE_TAG_NAME,
          "display-name": "Expected Invoice",
          type: "dimension",
          "widget-type": "string/=",
        },
      },
    },
    enable_embedding: true,
    embedding_params: { [TEMPLATE_TAG_NAME]: "enabled" },
  });

  let expectedInvoiceFieldId: number;

  test.beforeEach(async ({ mb }) => {
    // This issue was only reproducible against the Postgres database.
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
    expectedInvoiceFieldId = await getFieldIdByName(mb.api, {
      databaseId: PG_DB_ID,
      tableName: "invoices",
      fieldName: "expected_invoice",
    });
  });

  test.describe("should allow a dashboard filter to map to a boolean field filter parameter (metabase#27643)", () => {
    let dashboardId: number;

    test.beforeEach(async ({ mb }) => {
      const dashboardParameter = {
        id: "2850aeab",
        name: "Text filter for boolean field",
        slug: "text_filter_for_boolean_field",
        type: "string/=",
      };

      const dashcard = await createNativeQuestionAndDashboard(mb.api, {
        questionDetails: getQuestionDetails(expectedInvoiceFieldId),
        dashboardDetails: {
          name: "Dashboard with card with boolean field filter",
          enable_embedding: true,
          embedding_params: { [dashboardParameter.slug]: "enabled" },
          parameters: [dashboardParameter],
        },
      });
      dashboardId = dashcard.dashboard_id;

      await editDashboardCard(mb.api, dashcard, {
        parameter_mappings: [
          {
            parameter_id: dashboardParameter.id,
            card_id: dashcard.card_id,
            target: ["dimension", ["template-tag", TEMPLATE_TAG_NAME]],
          },
        ],
      });
    });

    test("in static embedding and in public dashboard scenarios (metabase#27643-1)", async ({
      page,
      mb,
    }) => {
      await visitDashboard(page, mb.api, dashboardId);
      await expect(getDashboardCard(page).getByText("true")).toBeVisible();
      await toggleFilterWidgetValues(page, ["false"]);
      await expect(getDashboardCard(page).getByText("false")).toBeVisible();

      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: dashboardId },
        params: {},
      });
      await expect(getDashboardCard(page).getByText("true")).toBeVisible();
      await toggleFilterWidgetValues(page, ["false"]);
      await expect(getDashboardCard(page).getByText("false")).toBeVisible();

      // We were signed out due to the previous visitEmbeddedPage.
      await mb.signInAsAdmin();
      await visitPublicDashboard(page, mb, dashboardId);
      await expect(getDashboardCard(page).getByText("true")).toBeVisible();
      await toggleFilterWidgetValues(page, ["false"]);
      await expect(getDashboardCard(page).getByText("false")).toBeVisible();
    });
  });

  test.describe("should allow a native question filter to map to a boolean field filter parameter (metabase#27643)", () => {
    let questionId: number;

    test.beforeEach(async ({ mb }) => {
      const { id } = await createNativeQuestion(
        mb.api,
        getQuestionDetails(expectedInvoiceFieldId),
      );
      questionId = id;
    });

    test("in static embedding and in public question scenarios (metabase#27643-2)", async ({
      page,
      mb,
    }) => {
      await visitQuestion(page, questionId);
      await expect(
        page.getByRole("gridcell").filter({ hasText: "true" }).first(),
      ).toBeVisible();
      await toggleFilterWidgetValues(page, ["false"]);
      await queryBuilderMain(page)
        .getByRole("button", { name: "Get Answer", exact: true })
        .click();
      await expect(
        page.getByRole("gridcell").filter({ hasText: "false" }).first(),
      ).toBeVisible();

      await visitEmbeddedPage(page, mb, {
        resource: { question: questionId },
        params: {},
      });
      await expect(
        page.getByRole("gridcell").filter({ hasText: "true" }).first(),
      ).toBeVisible();
      await toggleFilterWidgetValues(page, ["false"]);
      await expect(
        page.getByRole("gridcell").filter({ hasText: "false" }).first(),
      ).toBeVisible();

      await mb.signInAsAdmin();
      await visitPublicQuestion(page, mb, questionId);
      await expect(
        page.getByRole("gridcell").filter({ hasText: "true" }).first(),
      ).toBeVisible();
      await toggleFilterWidgetValues(page, ["false"]);
      await expect(
        page.getByRole("gridcell").filter({ hasText: "false" }).first(),
      ).toBeVisible();
    });
  });
});

// ===========================================================================
// issue 30535 (token — sandboxing)
// ===========================================================================

test.describe("issue 30535", () => {
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP);

  const questionDetails = {
    name: "3035",
    query: { "source-table": PRODUCTS_ID, limit: 10 },
  };

  let questionId: number;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await sandboxTable(mb.api, {
      table_id: PRODUCTS_ID,
      attribute_remappings: {
        attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      },
    });

    const { id } = await createQuestion(mb.api, questionDetails);
    questionId = id;
    await mb.api.put(`/api/card/${id}`, { enable_embedding: true });

    await visitQuestion(page, questionId);

    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "question",
      resourceId: questionId,
      activeTab: "parameters",
      previewMode: "preview",
      unpublishBeforeOpen: false,
    });
  });

  test("user session should not apply sandboxing to a signed embedded question (metabase#30535)", async ({
    page,
    mb,
  }) => {
    const src = await currentIframeSrc(page, mb.baseUrl);

    await mb.signOut();
    await mb.signInAsSandboxedUser();

    await page.goto(src);

    const grid = page.getByRole("grid");
    // The sandboxed user has attribute cat="Widget" — but signed embedding must
    // NOT apply sandboxing, so other categories show too.
    await expect(grid.getByText("Widget").first()).toBeVisible();
    await expect(grid.getByText("Gizmo").first()).toBeVisible();
  });
});

// ===========================================================================
// dashboard preview
// ===========================================================================

test.describe("dashboard preview", () => {
  const questionDetails = {
    name: "Products",
    query: { "source-table": PRODUCTS_ID },
  };

  const filter3 = {
    name: "Text 2",
    slug: "text_2",
    id: "b0665b6a",
    type: "string/=",
    sectionId: "string",
  };
  const filter2 = {
    name: "Text 1",
    slug: "text_1",
    id: "d4c9f2e5",
    type: "string/=",
    sectionId: "string",
  };
  const filter = {
    filteringParameters: [filter2.id],
    name: "Text",
    slug: "text",
    id: "d1b69627",
    type: "string/=",
    sectionId: "string",
  };

  const categoryMappings = (card_id: number) => [
    {
      card_id,
      parameter_id: filter.id,
      target: [
        "dimension",
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
      ],
    },
    {
      card_id,
      parameter_id: filter2.id,
      target: [
        "dimension",
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
      ],
    },
    {
      card_id,
      parameter_id: filter3.id,
      target: [
        "dimension",
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
      ],
    },
  ];

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("dashboard linked filters values don't work in static embed preview (metabase#37914)", async ({
    page,
    mb,
  }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails: {
        parameters: [filter, filter2, filter3],
        enable_embedding: true,
        embedding_params: {
          [filter.slug]: "enabled",
          [filter2.slug]: "enabled",
          [filter3.slug]: "enabled",
        },
      },
    });

    await addOrUpdateDashboardCard(mb.api, {
      dashboard_id: dashcard.dashboard_id,
      card_id: dashcard.card_id,
      card: { parameter_mappings: categoryMappings(dashcard.card_id) },
    });

    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "dashboard",
      resourceId: dashcard.dashboard_id,
      activeTab: "parameters",
      previewMode: "preview",
    });

    const frame = getIframeBody(page);

    // Set filter 2's value; filter 1 should then be narrowed by filter 2.
    // The linked-filter value fetch is async (`@previewValues`): await it before
    // asserting, and scope to the newly-opened popover (.last()) — otherwise the
    // outgoing popover, still animating closed, is read (a transition-overlap
    // race that leaked filter 2's "Gizmo" into filter 1's assertion).
    const values2 = page.waitForResponse(isPreviewValues);
    await frame.getByRole("button", { name: filter2.name, exact: true }).click();
    await values2;
    const p2 = popover(frame).last();
    await expect(p2.getByText("Gadget", { exact: true })).toBeVisible();
    await expect(p2.getByText("Gizmo", { exact: true })).toBeVisible();
    await expect(p2.getByText("Widget", { exact: true })).toBeVisible();
    await p2.getByText("Doohickey", { exact: true }).click();
    await p2.getByRole("button", { name: "Add filter", exact: true }).click();

    // Gate on filter 2's value being committed to app state before opening
    // filter 1 — otherwise filter 1's values fetch races ahead of the linkage
    // and returns the unnarrowed list (the actual flake here).
    await expect(
      filterWidgets(frame).filter({ hasText: caseSensitive("Doohickey") }),
    ).toBeVisible();

    // Assert filter 1 is now limited to Doohickey.
    const values1 = page.waitForResponse(isPreviewValues);
    await frame.getByRole("button", { name: filter.name, exact: true }).click();
    await values1;
    const p1 = popover(frame).last();
    await expect(p1.getByText("Doohickey", { exact: true })).toBeVisible();
    await expect(p1.getByText("Gadget", { exact: true })).toHaveCount(0);
    await expect(p1.getByText("Gizmo", { exact: true })).toHaveCount(0);
    await expect(p1.getByText("Widget", { exact: true })).toHaveCount(0);
  });

  test("dashboard linked filters values in embed preview don't behave like embedding (metabase#41635)", async ({
    page,
    mb,
  }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails: {
        parameters: [filter, filter2, filter3],
        enable_embedding: true,
        embedding_params: {
          [filter.slug]: "enabled",
          [filter2.slug]: "locked",
          [filter3.slug]: "locked",
        },
      },
    });

    await addOrUpdateDashboardCard(mb.api, {
      dashboard_id: dashcard.dashboard_id,
      card_id: dashcard.card_id,
      card: { parameter_mappings: categoryMappings(dashcard.card_id) },
    });

    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "dashboard",
      resourceId: dashcard.dashboard_id,
      activeTab: "parameters",
      previewMode: "preview",
    });

    const lockedSection = modal(page)
      .getByText("Previewing locked parameters", { exact: true })
      .locator("xpath=..");

    // Set the first locked parameter's value.
    await lockedSection.getByText("Text 1", { exact: true }).click();
    await popover(page).getByText("Doohickey", { exact: true }).click();
    await popover(page).getByRole("button", { name: "Add filter", exact: true }).click();

    // Set the second locked parameter's values.
    await lockedSection.getByText("Text 2", { exact: true }).click();
    await popover(page).getByText("Doohickey", { exact: true }).click();
    await popover(page).getByText("Gizmo", { exact: true }).click();
    await popover(page).getByText("Gadget", { exact: true }).click();
    await popover(page).getByRole("button", { name: "Add filter", exact: true }).click();

    const frame = getIframeBody(page);

    // Wait for the iframe to load. Upstream's first getIframeBody().within
    // asserts `button(filter.name).should("not.exist")` and then immediately
    // clicks the same button — a Cypress iframe-caching load-race artifact.
    // Ported as a positive load-wait on the enabled filter. See findings.
    await expect(
      frame.getByRole("button", { name: filter.name, exact: true }),
    ).toBeVisible();

    // Assert filter 1: it is limited to Doohickey (the linked/locked parent's
    // value), like real embedding.
    await frame.getByRole("button", { name: filter.name, exact: true }).click();
    await expect(popover(frame).getByText("Gadget", { exact: true })).toHaveCount(0);
    await expect(popover(frame).getByText("Gizmo", { exact: true })).toHaveCount(0);
    await expect(popover(frame).getByText("Widget", { exact: true })).toHaveCount(0);
    await expect(popover(frame).getByText("Doohickey", { exact: true })).toBeVisible();
  });
});

// ===========================================================================
// issue 40660
// ===========================================================================

test.describe("issue 40660", () => {
  const questionDetails = {
    name: "Products",
    query: { "source-table": PRODUCTS_ID, limit: 2 },
  };
  const dashboardDetails = { name: "long dashboard", enable_embedding: true };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("static dashboard content shouldn't overflow its container (metabase#40660)", async ({
    page,
    mb,
  }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });

    await updateDashboardCards(mb.api, {
      dashboard_id: dashcard.dashboard_id,
      cards: [
        { card_id: dashcard.card_id },
        { card_id: dashcard.card_id },
        { card_id: dashcard.card_id },
      ],
    });

    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "dashboard",
      resourceId: dashcard.dashboard_id,
      activeTab: "parameters",
      previewMode: "preview",
    });

    const frame = getIframeBody(page);

    await expect(
      frame.getByText(dashboardDetails.name, { exact: true }),
    ).toBeVisible();
    await expect(frame.getByTestId("loading-indicator")).toHaveCount(0);
    await expect(frame.getByText("1018947080336", { exact: true })).toHaveCount(3);

    await frame
      .getByTestId("embed-frame")
      .evaluate((element) => element.scrollTo(0, element.scrollHeight));

    const poweredBy = frame.getByRole("link", { name: "Powered by Metabase" });
    await poweredBy.scrollIntoViewIfNeeded();
    await expect(poweredBy).toBeVisible();
  });
});

// ===========================================================================
// issue 49142 (@skip upstream — "does not make sense when CSP is disabled")
// ===========================================================================

test.describe.skip("issue 49142", () => {
  const questionDetails = {
    name: "Products",
    query: { "source-table": PRODUCTS_ID, limit: 2 },
  };
  const dashboardDetails = {
    name: "Embeddable dashboard",
    enable_embedding: true,
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("embedding preview should be always working", async ({ page, mb }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });

    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "dashboard",
      resourceId: dashcard.dashboard_id,
      activeTab: "lookAndFeel",
      previewMode: "preview",
    });

    const frame = page.frameLocator('[data-testid="embed-preview-iframe"]');
    await expect(
      frame.getByText("Embeddable dashboard", { exact: false }),
    ).toBeVisible();
  });
});

// ===========================================================================
// issue 8490 (token — locale)
// ===========================================================================

test.describe("issue 8490", () => {
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP);

  let dashboardId: number;
  let lineChartQuestionId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    const { dashboard, questions } = await createDashboardWithQuestions(mb.api, {
      dashboardDetails: {
        name: "Dashboard to test locale",
        enable_embedding: true,
      },
      questions: [
        {
          name: "Line chart",
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              [
                "field",
                PRODUCTS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
            filter: [
              "between",
              ["field", PRODUCTS.CREATED_AT, { "base-type": "type/DateTime" }],
              "2027-01-01",
              "2028-01-01",
            ],
          },
          visualization_settings: {
            "graph.dimensions": ["CREATED_AT", "CATEGORY"],
            "graph.metrics": ["count"],
          },
          display: "bar",
          enable_embedding: true,
        },
        {
          name: "Order quantity trend",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }]],
            ],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
            filter: [
              "and",
              [
                "between",
                ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
                "2027-10-01",
                "2027-12-01",
              ],
              [
                "=",
                [
                  "field",
                  PRODUCTS.VENDOR,
                  { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
                ],
                "Alfreda Konopelski II Group",
              ],
            ],
          },
          display: "smartscalar",
        },
        {
          name: "Pie chart",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                PRODUCTS.VENDOR,
                { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
              ],
            ],
            limit: 5,
          },
          visualization_settings: { "pie.slice_threshold": 20 },
          display: "pie",
        },
      ],
      cards: [{}, { col: 11 }],
    });

    dashboardId = dashboard.id;
    lineChartQuestionId = questions[0].id;
  });

  test("static embeddings with `#locale` should show translate the loading message (metabase#50182)", async ({
    page,
    mb,
  }) => {
    // Hold the dashboard embed response so the loading state is observable.
    const dashboardGate = holdEmbedRoute(page, (url) =>
      url.pathname.startsWith("/api/embed/dashboard/"),
    );
    await visitEmbeddedPage(
      page,
      mb,
      { resource: { dashboard: dashboardId }, params: {} },
      { additionalHashOptions: { locale: "ko" } },
    );
    // Loading...
    await expect(
      page.getByTestId("embed-frame").getByText("로드 중...", { exact: true }),
    ).toBeVisible();

    const cardGate = holdEmbedRoute(page, (url) =>
      url.pathname.startsWith("/api/embed/card/"),
    );
    await visitEmbeddedPage(
      page,
      mb,
      { resource: { question: lineChartQuestionId }, params: {} },
      { additionalHashOptions: { locale: "ko" } },
    );
    // Loading...
    await expect(
      page.getByTestId("embed-frame").getByText("로딩...", { exact: true }),
    ).toBeVisible();

    dashboardGate.release();
    cardGate.release();
  });

  test("static embeddings should respect `#locale` hash parameter (metabase#8490, metabase#50182)", async ({
    page,
    mb,
  }) => {
    const dashboardGate = holdEmbedRoute(page, (url) =>
      url.pathname.startsWith("/api/embed/dashboard/"),
    );
    await visitEmbeddedPage(
      page,
      mb,
      { resource: { dashboard: dashboardId }, params: {} },
      { additionalHashOptions: { locale: "ko" } },
    );

    const embedFrame = page.getByTestId("embed-frame");
    // Loading... (translated) — then let the request through.
    await expect(embedFrame.getByText("로드 중...", { exact: true })).toBeVisible();
    dashboardGate.release();

    // Line chart: X-axis "1월 20XX" + "카운트" (count). The ECharts SVG <text>
    // is " 1월 2027 " (leading/trailing spaces); Cypress's testing-library
    // trims before applying `^…\b`, Playwright's getByText does not — so match
    // the label as a substring instead of anchoring.
    await expect(
      getDashboardCard(page, 0).getByText(/1월\s+20\d\d/),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 0).getByText("카운트", { exact: true }),
    ).toBeVisible();

    // Trend chart: "해당 없음" (N/A) + "(데이터 없음)" (no data).
    await expect(
      getDashboardCard(page, 2).getByText("해당 없음", { exact: true }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 2).getByText("(데이터 없음)", { exact: true }),
    ).toBeVisible();

    // Pie chart: "합계" (Total) + legend "기타" (Other).
    await expect(
      getDashboardCard(page, 1).getByText("합계", { exact: true }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 1)
        .getByTestId("chart-legend")
        .getByText("기타", { exact: true }),
    ).toBeVisible();

    // Now the question.
    const cardGate = holdEmbedRoute(page, (url) =>
      url.pathname.startsWith("/api/embed/card/"),
    );
    await visitEmbeddedPage(
      page,
      mb,
      { resource: { question: lineChartQuestionId }, params: {} },
      { additionalHashOptions: { locale: "ko" } },
    );

    await expect(embedFrame.getByText("로딩...", { exact: true })).toBeVisible();
    cardGate.release();

    // X-axis "11월 20XX" + "카운트" (same ECharts-whitespace note as above).
    await expect(embedFrame.getByText(/11월\s+20\d\d/)).toBeVisible();
    await expect(embedFrame.getByText("카운트", { exact: true })).toBeVisible();
  });
});

// ===========================================================================
// issue 50373
// ===========================================================================

test.describe("issue 50373", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should return cache headers in production for js bundle", async ({
    page,
    mb,
  }) => {
    const bundleFailures: string[] = [];
    page.on("response", (response) => {
      const url = response.url();
      if (!/^\/app\/dist\/.*\.js$/.test(new URL(url).pathname)) {
        return;
      }
      // The *.hot.bundle.js dev-server file is exempt (dev only).
      if (url.includes("hot.bundle.js")) {
        return;
      }
      const cacheControl = response.headers()["cache-control"];
      if (cacheControl !== "public, max-age=31536000") {
        bundleFailures.push(`${url} → ${cacheControl}`);
      }
    });

    await visitEmbeddedPage(page, mb, {
      resource: { dashboard: ORDERS_DASHBOARD_ID },
      params: {},
    });
    await expect(page.getByTestId("embed-frame")).toBeVisible();

    expect(bundleFailures, bundleFailures.join("\n")).toEqual([]);
  });
});

// ===========================================================================
// issue 51934 (EMB-189) — token + QA Postgres, full-app embedding
// ===========================================================================

test.describe("issue 51934 (EMB-189)", () => {
  test.skip(
    !process.env.PW_QA_DB_ENABLED || !resolveToken("pro-self-hosted"),
    `${QA_DB_SKIP}; also requires MB_PRO_SELF_HOSTED_TOKEN`,
  );

  const COLLECTION_NAME = "Model Collection";
  const MODEL_IN_ROOT_NAME = "Products Model";
  const MODEL_IN_COLLECTION_NAME = "QA Postgres12 Orders Model";
  const QUESTION_IN_COLLECTION_NAME = "Orders Question";

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await createModelFromTableName(mb.api, {
      tableName: "products",
      modelName: MODEL_IN_ROOT_NAME,
    });
    const collection = await createCollection(mb.api, { name: COLLECTION_NAME });
    const model = await createModelFromTableName(mb.api, {
      tableName: "orders",
      modelName: MODEL_IN_COLLECTION_NAME,
    });
    await moveCardToCollection(mb.api, model.id, collection.id);
    const question = await createQuestion(mb.api, {
      name: QUESTION_IN_COLLECTION_NAME,
      query: { "source-table": ORDERS_ID },
    });
    await moveCardToCollection(mb.api, question.id, collection.id);
  });

  test("should set the starting join step based on the query source", async ({
    page,
    mb,
  }) => {
    const QA_DB_NAME = "QA Postgres12";
    const DATA_SOURCE_NAME = "Orders";
    const BRAND_COLOR = "rgb(80, 158, 226)";

    const frame = await visitFullAppEmbeddingUrl(page, {
      url: "/question/notebook",
      qs: { data_picker: "staged", entity_types: "table,model,question" },
      baseUrl: mb.baseUrl,
    });

    const pickerPopover = (name: string) =>
      frame
        .locator(`[data-element-id=mantine-popover][aria-label="${name}"]`)
        .last();
    const dataSourcePopover = () => pickerPopover("Pick your starting data");
    const joinPopover = () => pickerPopover("Pick data to join");

    const clickPickerItem = async (scope: ReturnType<typeof pickerPopover>, name: string) => {
      await expect(scope.getByTestId("mini-picker-list-loader")).toHaveCount(0);
      const item = scope.getByRole("menuitem", { name, exact: true });
      await expect(item).toBeVisible({ timeout: 15000 });
      await item.click();
    };

    // Select a table as a data source.
    await dataSourcePopover().getByText("Raw Data", { exact: true }).click();
    await dataSourcePopover().getByRole("heading", { name: QA_DB_NAME, exact: true }).click();
    await dataSourcePopover().getByRole("option", { name: DATA_SOURCE_NAME, exact: true }).click();
    await getNotebookStep(frame, "data").getByRole("button", { name: "Join data", exact: true }).click();

    // A table data source opens a join picker into the same database.
    await expect(joinPopover().getByText(QA_DB_NAME, { exact: true })).toBeVisible();
    await expect(
      joinPopover().getByRole("option", { name: "Orders", exact: true }),
    ).toBeVisible();

    // Changing the data source refreshes the join picker.
    await getNotebookStep(frame, "data").getByText(DATA_SOURCE_NAME, { exact: true }).click();

    // Go back to the "Bucket" step.
    await icon(dataSourcePopover(), "chevronleft").click();
    await icon(dataSourcePopover(), "chevronleft").click();

    // A saved question source opens the saved-question step in its collection
    // (metabase#58357).
    await dataSourcePopover().getByText("Saved Questions", { exact: true }).click();
    await clickPickerItem(dataSourcePopover(), COLLECTION_NAME);
    await clickPickerItem(dataSourcePopover(), QUESTION_IN_COLLECTION_NAME);

    // The join popover opens automatically with the data source's collection.
    await expect(
      joinPopover().getByRole("menuitem", { name: COLLECTION_NAME, exact: true }),
    ).toHaveCSS("background-color", BRAND_COLOR);
    await clickPickerItem(joinPopover(), QUESTION_IN_COLLECTION_NAME);

    // A model source opens the model step in its collection.
    await getNotebookStep(frame, "data").getByText(QUESTION_IN_COLLECTION_NAME, { exact: true }).click();
    await dataSourcePopover().getByText("Saved Questions", { exact: true }).click();
    await dataSourcePopover().getByText("Models", { exact: true }).click();
    await clickPickerItem(dataSourcePopover(), MODEL_IN_COLLECTION_NAME);

    await expect(
      joinPopover().getByRole("menuitem", { name: COLLECTION_NAME, exact: true }),
    ).toHaveCSS("background-color", BRAND_COLOR);
    await clickPickerItem(joinPopover(), MODEL_IN_COLLECTION_NAME);

    // Selecting a data source after a join step refreshes the join picker.
    await getNotebookStep(frame, "data").getByText(MODEL_IN_COLLECTION_NAME, { exact: true }).click();
    await clickPickerItem(dataSourcePopover(), "Our analytics");
    await clickPickerItem(dataSourcePopover(), MODEL_IN_ROOT_NAME);

    await expect(
      joinPopover().getByRole("menuitem", { name: "Our analytics", exact: true }),
    ).toHaveCSS("background-color", BRAND_COLOR);
    await expect(
      joinPopover().getByRole("menuitem", { name: MODEL_IN_ROOT_NAME, exact: true }),
    ).toBeVisible();
  });
});

// ===========================================================================
// issue 63687
// ===========================================================================

test.describe("issue 63687", () => {
  const questionAsPinMapWithTiles = {
    name: "Orders",
    description: "Foo",
    enable_embedding: true,
    native: {
      query: "SELECT LATITUDE, LONGITUDE FROM PEOPLE ORDER BY ID LIMIT 10",
    },
    display: "map",
    visualization_settings: {
      "map.type": "pin",
      "map.pin_type": "tiles",
      "map.longitude_column": "LONGITUDE",
      "map.latitude_column": "LATITUDE",
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should properly display pin map tiles without auth errors for a valid JWT token", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, questionAsPinMapWithTiles);
    await visitQuestion(page, id);

    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "question",
      resourceId: id,
      activeTab: "parameters",
      unpublishBeforeOpen: false,
    });

    const tiles = page.waitForResponse((response) =>
      /^\/api\/embed\/tiles\//.test(new URL(response.url()).pathname),
    );

    await visitIframe(page, mb);

    const tileResponse = await tiles;
    expect(tileResponse.status()).toBe(200);
  });
});

// ===========================================================================
// issue 57028
// ===========================================================================

test.describe("issue 57028", () => {
  const lockedContainsBodyFilter = {
    name: "locked_contains_body",
    slug: "locked_contains_body",
    id: "e6588080",
    type: "string/contains",
    sectionId: "string",
    isMultiSelect: true,
    values_query_type: "none",
  };

  const emailFilter = {
    name: "Email",
    slug: "email",
    id: "d31e550f",
    type: "string/=",
    sectionId: "string",
    values_query_type: "list",
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("static embedded editable filter should load dropdown values when a string/contains locked param has multiple values (metabase#57028)", async ({
    page,
    mb,
  }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "Feedback",
        query: { "source-table": FEEDBACK_ID },
      },
      dashboardDetails: {
        parameters: [lockedContainsBodyFilter, emailFilter],
        enable_embedding: true,
        embedding_params: {
          [lockedContainsBodyFilter.slug]: "locked",
          [emailFilter.slug]: "enabled",
        },
      },
    });

    await addOrUpdateDashboardCard(mb.api, {
      dashboard_id: dashcard.dashboard_id,
      card_id: dashcard.card_id,
      card: {
        parameter_mappings: [
          {
            card_id: dashcard.card_id,
            parameter_id: lockedContainsBodyFilter.id,
            target: ["dimension", ["field", FEEDBACK.BODY, null]],
          },
          {
            card_id: dashcard.card_id,
            parameter_id: emailFilter.id,
            target: ["dimension", ["field", FEEDBACK.EMAIL, null]],
          },
        ],
      },
    });

    const emailValues = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new RegExp(
          `^/api/embed/dashboard/[^/]+/params/${emailFilter.id}/values$`,
        ).test(new URL(response.url()).pathname),
    );

    await visitEmbeddedPage(page, mb, {
      resource: { dashboard: dashcard.dashboard_id },
      params: {
        [lockedContainsBodyFilter.slug]: ["March", "damp", "somewhat"],
      },
    });

    await filterWidgets(page).filter({ hasText: caseSensitive("Email") }).click();

    const emailResponse = await emailValues;
    expect(emailResponse.status()).toBe(200);

    await expect(
      popover(page).getByPlaceholder("Search the list"),
    ).toBeVisible();
    expect(await popover(page).getByRole("checkbox").count()).toBeGreaterThan(0);
  });
});
