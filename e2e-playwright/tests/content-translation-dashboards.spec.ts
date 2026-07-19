/**
 * Playwright port of
 * e2e/test/scenarios/admin/i18n/content-translation/dashboards.cy.spec.ts
 *
 * Content translation of dashboards rendered as static ("guest") embeds: upload
 * a translation dictionary via the EE upload-dictionary API (a local, in-process
 * CSV — no external infra), publish/JWT-embed a dashboard with a locale hash,
 * and assert translated strings render (pivot column renames, card titles &
 * descriptions, pie/funnel dimension values + colors, pivot measure names,
 * filter labels & field values, tab names, and heading/text cards).
 *
 * EE-gated: the whole file needs the pro-self-hosted token (content-translation
 * is a premium feature); skipped when it isn't available.
 *
 * Notes on the port:
 * - H.visitEmbeddedPage → support/embedding-dashboard.ts visitEmbeddedPage
 *   (signs a JWT and navigates top-level to /embed/dashboard/<token>#locale=…;
 *   no iframe — static embeds render at the top level).
 * - The @dashboard / @cardQuery / @searchQuery intercept+wait pairs become
 *   waitFor helpers registered before the trigger (PORTING rule 2). The
 *   "card titles" / "values translation" describes intercept the app-mode card
 *   query POST endpoint, but that endpoint does NOT fire inside a static embed
 *   (embeds fetch card data via a GET under /api/embed/dashboard); their
 *   cy.wait("@cardQuery") is satisfied retroactively by the pre-embed app-mode
 *   render, so those waits are dropped and the retrying translated-text
 *   assertions carry the timing.
 * - before()+snapshot()+beforeEach(restore(snapshot)) describes use the
 *   per-worker snapshotReady-flag pattern (mb is test-scoped, so no beforeAll).
 * - findByText string args are exact (rule 1); regex findByText → substring.
 */
import type { Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import type { MetabaseApi } from "../support/api";
import { tooltip } from "../support/charts";
import {
  DictionaryArray,
  frenchBooleanTranslations,
  frenchNames,
  germanFieldNames,
  germanFieldValues,
  getDashboardTabDetails,
  getHeadingCardDetails,
  getTextCardDetails,
  uploadTranslationDictionaryViaAPI,
  waitForEmbedCard,
  waitForEmbedDashboard,
  waitForEmbedSearch,
} from "../support/content-translation-dashboards";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  sidebar,
} from "../support/dashboard";
import { removeDashboardCard } from "../support/dashboard-core";
import {
  addOrUpdateDashboardCard,
  openLegacyStaticEmbeddingModal,
  publishChanges,
  visitEmbeddedPage,
} from "../support/embedding-dashboard";
import {
  createDashboard,
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { test, expect } from "../support/fixtures";
import { tableInteractiveBody } from "../support/question-new";
import { resolveToken } from "../support/api";
import { ORDERS_DASHBOARD_ID, SAMPLE_DATABASE } from "../support/sample-data";
import { icon, popover, visitDashboard } from "../support/ui";
import {
  clickVisualizeAnotherWay,
  openQuestionsSidebar,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
  saveDashcardVisualizerModal,
  selectVisualization,
} from "../support/visualizer-basics";
import { ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY } from "../support/visualizer-cartesian";

const {
  ORDERS,
  ORDERS_ID,
  ACCOUNTS_ID,
  ACCOUNTS,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATABASE as unknown as {
  ORDERS: Record<string, number>;
  ORDERS_ID: number;
  ACCOUNTS_ID: number;
  ACCOUNTS: Record<string, number>;
  PRODUCTS: Record<string, number>;
  PRODUCTS_ID: number;
  PEOPLE: Record<string, number>;
  PEOPLE_ID: number;
};

/** The subset of the mb fixture these local helpers use. */
type TranslationHarness = {
  api: MetabaseApi;
  signOut(): Promise<void>;
  signInAsNormalUser(): Promise<void>;
};

const NORMAL_USER_ID = (() => {
  const user = (
    SAMPLE_INSTANCE_DATA as { users: { id: number; email: string }[] }
  ).users.find(({ email }) => email === "normal@metabase.test");
  if (!user) {
    throw new Error("normal user not found in cypress_sample_instance_data");
  }
  return user.id;
})();

test.skip(
  !resolveToken("pro-self-hosted"),
  "content translation is EE-gated (needs the pro-self-hosted token)",
);

test.describe("content translation > static embeds > dashboards", () => {
  test.describe("pivot table renamed column (metabase#63296)", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await uploadTranslationDictionaryViaAPI(mb.api, [
        { locale: "fr", msgid: "Category", msgstr: "La catégorie" },
        { locale: "fr", msgid: "Title", msgstr: "Le titre" },
      ]);

      await createQuestion(
        mb.api,
        ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY,
      );

      await createQuestion(mb.api, {
        name: "Pivot table",
        display: "pivot",
        query: {
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, null],
            ["field", PRODUCTS.TITLE, null],
          ],
          "source-table": PRODUCTS_ID,
        },
        visualization_settings: {
          "pivot_table.column_split": {
            rows: ["CATEGORY", "TITLE"],
            columns: [],
            values: ["count"],
          },
          column_settings: {
            '["name", "CATEGORY"]': {
              column_title: "Category",
            },
          },
        },
      });
    });

    test("should assign the proper colors to a pie", async ({ mb, page }) => {
      const { id: dashboardId } = await createDashboard(mb.api, {
        name: "the_dashboard",
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);
      await openQuestionsSidebar(page);

      await sidebar(page).getByText("Pivot table", { exact: true }).click();

      await saveDashboard(page);

      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource: "dashboard",
        resourceId: dashboardId,
      });
      await publishChanges(page, "dashboard");

      const dashboardReq = waitForEmbedDashboard(page);
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { dashboard: dashboardId }, params: {} },
        { additionalHashOptions: { locale: "fr" } },
      );
      await dashboardReq;

      await expect(
        getDashboardCard(page, 0).getByText("La catégorie", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("card titles and descriptions", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await uploadTranslationDictionaryViaAPI(mb.api, [
        { locale: "fr", msgid: "Gadget", msgstr: "Le gadget" },
        { locale: "fr", msgid: "Doohickey", msgstr: "Le doohickey" },
        { locale: "fr", msgid: "Gizmo", msgstr: "Le gizmo" },
        { locale: "fr", msgid: "Widget", msgstr: "Le widget" },
        {
          locale: "fr",
          msgid: "Products by Category (Pie)",
          msgstr: "Produits par catégorie (Camembert)",
        },
        {
          locale: "fr",
          msgid: "A breakdown of products by category",
          msgstr: "Une répartition des produits par catégorie",
        },
      ]);

      await createQuestion(
        mb.api,
        ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY,
      );

      await createQuestion(mb.api, {
        ...PRODUCTS_COUNT_BY_CATEGORY_PIE,
        description: "A breakdown of products by category",
      });
    });

    test("should translate guest embeds dashboard card titles and descriptions", async ({
      mb,
      page,
    }) => {
      const { id: dashboardId } = await createDashboard(mb.api, {
        name: "the_dashboard",
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);
      await openQuestionsSidebar(page);

      await sidebar(page)
        .getByText(PRODUCTS_COUNT_BY_CATEGORY_PIE.name, { exact: true })
        .click();
      await saveDashboard(page);

      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource: "dashboard",
        resourceId: dashboardId,
      });
      await publishChanges(page, "dashboard");

      const dashboardReq = waitForEmbedDashboard(page);
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { dashboard: dashboardId }, params: {} },
        { additionalHashOptions: { locale: "fr" } },
      );
      await dashboardReq;

      // The title is translated.
      await expect(
        page.getByText("Produits par catégorie (Camembert)", { exact: true }),
      ).toBeVisible();

      const card = getDashboardCard(page, 0);
      await card.hover();
      await icon(card, "info").hover();
      // The description is translated.
      await expect(
        tooltip(page).getByText(
          "Une répartition des produits par catégorie",
          { exact: true },
        ),
      ).toBeVisible();
    });
  });

  test.describe("values translation", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await uploadTranslationDictionaryViaAPI(mb.api, [
        { locale: "fr", msgid: "Gadget", msgstr: "Le gadget" },
        { locale: "fr", msgid: "Doohickey", msgstr: "Le doohickey" },
        { locale: "fr", msgid: "Gizmo", msgstr: "Le gizmo" },
        { locale: "fr", msgid: "Widget", msgstr: "Le widget" },
      ]);

      await createQuestion(
        mb.api,
        ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY,
      );

      await createQuestion(mb.api, {
        ...PRODUCTS_COUNT_BY_CATEGORY_PIE,
        visualization_settings: {
          "pie.rows": [
            ["Widget", "#69C8C8"],
            ["Gadget", "#C7EAEA"],
            ["Gizmo", "#98D9D9"],
            ["Doohickey", "#F3F3F4"],
          ].map(([key, color]) => ({
            key,
            name: key,
            originalName: key,
            color,
            defaultColor: false,
            enabled: true,
            hidden: false,
            isOther: false,
          })),
        },
      });
    });

    test("should assign the proper colors to a pie", async ({ mb, page }) => {
      const { id: dashboardId } = await createDashboard(mb.api, {
        name: "the_dashboard",
      });
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);
      await openQuestionsSidebar(page);

      await sidebar(page)
        .getByText(PRODUCTS_COUNT_BY_CATEGORY_PIE.name, { exact: true })
        .click();
      await saveDashboard(page);

      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource: "dashboard",
        resourceId: dashboardId,
      });
      await publishChanges(page, "dashboard");

      const dashboardReq = waitForEmbedDashboard(page);
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { dashboard: dashboardId }, params: {} },
        { additionalHashOptions: { locale: "fr" } },
      );
      await dashboardReq;

      const card = getDashboardCard(page, 0);
      await expect(card.getByText("Le gadget", { exact: true }).first()).toBeVisible();
      await expect(card.getByText("Le doohickey", { exact: true }).first()).toBeVisible();
      await expect(card.getByText("Le gizmo", { exact: true }).first()).toBeVisible();
      await expect(card.getByText("Le widget", { exact: true }).first()).toBeVisible();

      // Verify colors
      const colors = await card
        .getByTestId("chart-legend")
        .locator("button [color]")
        .evaluateAll((els) => els.map((el) => el.getAttribute("color")));
      expect(colors).toEqual(["#69C8C8", "#C7EAEA", "#98D9D9", "#F3F3F4"]);
    });

    test("should translate guest embeds dashboard values on visualizer cards (metabase#62373)", async ({
      mb,
      page,
    }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

      await editDashboard(page);
      await removeDashboardCard(page, 0);
      await openQuestionsSidebar(page);

      // Add the regular question
      await sidebar(page)
        .getByText(ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.name, {
          exact: true,
        })
        .click();

      // Add the visualizer question
      await clickVisualizeAnotherWay(
        page,
        ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.name,
      );
      await selectVisualization(page, "bar");
      await saveDashcardVisualizerModal(page, { mode: "create" });
      await saveDashboard(page);

      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource: "dashboard",
        resourceId: ORDERS_DASHBOARD_ID,
      });
      await publishChanges(page, "dashboard");

      const dashboardReq = waitForEmbedDashboard(page);
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { dashboard: ORDERS_DASHBOARD_ID }, params: {} },
        { additionalHashOptions: { locale: "fr" } },
      );
      await dashboardReq;

      for (const index of [0, 1]) {
        const card = getDashboardCard(page, index);
        await expect(card.getByText("Le gadget", { exact: true }).first()).toBeVisible();
        await expect(card.getByText("Le doohickey", { exact: true }).first()).toBeVisible();
        await expect(card.getByText("Le gizmo", { exact: true }).first()).toBeVisible();
        await expect(card.getByText("Le widget", { exact: true }).first()).toBeVisible();
      }
    });
  });

  test.describe("measure names", () => {
    const SNAPSHOT = "with-translations";
    let snapshotReady = false;

    test.beforeEach(async ({ mb }) => {
      if (!snapshotReady) {
        await mb.restore();
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");
        await uploadTranslationDictionaryViaAPI(mb.api, [
          ...germanFieldNames,
          ...germanFieldValues,
          ...frenchNames,
          ...frenchBooleanTranslations,
        ]);
        await mb.api.snapshot(SNAPSHOT);
        snapshotReady = true;
      }
      await mb.restore(SNAPSHOT);
      await mb.signInAsAdmin();
    });

    test("should translate pivot table measure names", async ({ mb, page }) => {
      const { dashboardId } = await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "Pivot Table Test",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
              ["field", ORDERS.QUANTITY, null],
            ],
          },
          display: "pivot",
          visualization_settings: {
            "pivot_table.column_split": {
              rows: [ORDERS.CREATED_AT, ORDERS.QUANTITY],
              columns: [],
              values: ["count"],
            },
            column_settings: {
              '["name","count"]': {
                column_title: "Price",
              },
            },
          },
        },
        dashboardDetails: {
          name: "Pivot Dashboard Test",
          enable_embedding: true,
          embedding_params: {},
        },
      });

      const dashboardReq = waitForEmbedDashboard(page);
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { dashboard: dashboardId }, params: {} },
        { additionalHashOptions: { locale: "de" } },
      );
      await dashboardReq;

      await expect(
        getDashboardCard(page, 0).getByText("Preis", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("filters and field values", () => {
    test.describe("ee", () => {
      const SNAPSHOT = "with-translations-ee";
      let snapshotReady = false;

      test.beforeEach(async ({ mb }) => {
        if (!snapshotReady) {
          await mb.restore();
          await mb.signInAsAdmin();
          await mb.api.activateToken("pro-self-hosted");
          await uploadTranslationDictionaryViaAPI(mb.api, [
            ...germanFieldNames,
            ...germanFieldValues,
            ...frenchNames,
            ...frenchBooleanTranslations,
          ]);
          await mb.api.snapshot(SNAPSHOT);
          snapshotReady = true;
        }
        await mb.restore(SNAPSHOT);
        await mb.signInAsAdmin();
      });

      for (const { isMultiSelect } of [
        { isMultiSelect: true },
        { isMultiSelect: false },
      ]) {
        test(`can filter products table via localized, ${isMultiSelect ? "multiselect" : "single-select"} list widget and see localized values`, async ({
          mb,
          page,
        }) => {
          const productCategoryFilter = {
            name: "Category",
            slug: "product_category",
            id: "11d79abe",
            type: "string/=",
            sectionId: "string",
            isMultiSelect,
          };
          const { id, card_id, dashboard_id } = await createQuestionAndDashboard(
            mb.api,
            {
              questionDetails: {
                name: "Products question",
                query: {
                  "source-table": PRODUCTS_ID,
                  limit: 30,
                },
              },
              dashboardDetails: {
                parameters: [productCategoryFilter],
                enable_embedding: true,
                embedding_params: {
                  [productCategoryFilter.slug]: "enabled",
                },
              },
            },
          );
          await mb.api.put(`/api/dashboard/${dashboard_id}`, {
            dashcards: [
              {
                id,
                card_id,
                row: 0,
                col: 0,
                size_x: 24,
                size_y: 20,
                parameter_mappings: [
                  {
                    parameter_id: productCategoryFilter.id,
                    card_id,
                    target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                  },
                ],
              },
            ],
          });

          const cardReq = waitForEmbedCard(page);
          await visitEmbeddedPage(
            page,
            mb,
            { resource: { dashboard: dashboard_id }, params: {} },
            { additionalHashOptions: { locale: "de" } },
          );
          await cardReq;

          // Before filtering, multiple categories are shown
          const body = tableInteractiveBody(page);
          await expect
            .poll(() => body.getByText(/Dingsbums/).count())
            .toBeGreaterThan(2);
          await expect
            .poll(() => body.getByText(/Apparat/).count())
            .toBeGreaterThan(2);
          await expect
            .poll(() => body.getByText(/Gerät/).count())
            .toBeGreaterThan(2);
          await expect
            .poll(() => body.getByText(/Steuerelement/).count())
            .toBeGreaterThan(2);

          // Non-categorical string values are translated
          await expect(
            page.getByText("Rustic Paper Wallet", { exact: true }),
          ).toHaveCount(0);
          await expect(
            page.getByText("Rustikale Papierbörse", { exact: true }).first(),
          ).toBeVisible();

          // After filtering, only selected categories are shown
          await filterWidget(page).getByText("Kategorie", { exact: true }).click();
          const pop = popover(page);
          await pop.getByText(/Dingsbums/).first().click();
          if (isMultiSelect) {
            await pop.getByText(/Apparat/).first().click();
          }
          await pop.getByText(/Füge einen Filter hinzu/).click();

          await expect
            .poll(() => body.getByText(/Dingsbums/).count())
            .toBeGreaterThan(2);
          if (isMultiSelect) {
            await expect
              .poll(() => body.getByText(/Apparat/).count())
              .toBeGreaterThan(2);
          } else {
            await expect(body.getByText(/Apparat/)).toHaveCount(0);
          }
          await expect(body.getByText(/Gerät/)).toHaveCount(0);
          await expect(body.getByText(/Steuerelement/)).toHaveCount(0);
        });
      }

      test("translates boolean content in filters and cards", async ({
        mb,
        page,
      }) => {
        const booleanFilter = {
          name: "Boolean Filter",
          slug: "boolean_filter",
          id: "boolean-filter-id",
          type: "boolean/=",
          sectionId: "boolean",
          default: true,
        };

        const { id, card_id, dashboard_id } = await createQuestionAndDashboard(
          mb.api,
          {
            questionDetails: {
              name: "Boolean Question",
              query: {
                "source-table": ACCOUNTS_ID,
                aggregation: [["count"]],
                breakout: [
                  ["field", ACCOUNTS.TRIAL_CONVERTED, { "base-type": "type/Boolean" }],
                  [
                    "field",
                    ACCOUNTS.ACTIVE_SUBSCRIPTION,
                    { "base-type": "type/Boolean" },
                  ],
                ],
              },
            },
            dashboardDetails: {
              parameters: [booleanFilter],
              enable_embedding: true,
              embedding_params: {
                [booleanFilter.slug]: "enabled",
              },
            },
          },
        );
        await mb.api.put(`/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 24,
              size_y: 20,
              parameter_mappings: [
                {
                  card_id,
                  parameter_id: booleanFilter.id,
                  target: [
                    "dimension",
                    ["field", "ACTIVE_SUBSCRIPTION", { "base-type": "type/Boolean" }],
                    { "stage-number": 1 },
                  ],
                },
              ],
            },
          ],
        });

        const cardReq = waitForEmbedCard(page);
        await visitEmbeddedPage(
          page,
          mb,
          { resource: { dashboard: dashboard_id }, params: {} },
          { additionalHashOptions: { locale: "fr" } },
        );
        await cardReq;

        const body = tableInteractiveBody(page);
        await expect(body.getByText(/vrai/)).toHaveCount(2);
        await expect(body.getByText(/true/)).toHaveCount(0);
      });

      test("translates MultiAutocomplete values and options", async ({
        mb,
        page,
      }) => {
        const nameFilter = {
          name: "Multi",
          slug: "multi",
          id: "52b05b6d",
          type: "string/=",
          sectionId: "string",
        };

        const { id, card_id, dashboard_id } = await createQuestionAndDashboard(
          mb.api,
          {
            questionDetails: {
              name: "People question",
              query: {
                "source-table": PEOPLE_ID,
                limit: 30,
                filter: [
                  "contains",
                  ["field", PEOPLE.NAME, { "base-type": "type/Text" }],
                  "Fran",
                  { "case-sensitive": false },
                ],
              },
            },
            dashboardDetails: {
              parameters: [nameFilter],
              enable_embedding: true,
              embedding_params: {
                [nameFilter.slug]: "enabled",
              },
            },
          },
        );
        await mb.api.put(`/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 24,
              size_y: 20,
              parameter_mappings: [
                {
                  parameter_id: nameFilter.id,
                  card_id,
                  target: ["dimension", ["field", PEOPLE.NAME, null]],
                },
              ],
            },
          ],
        });

        const cardReq = waitForEmbedCard(page);
        await visitEmbeddedPage(
          page,
          mb,
          { resource: { dashboard: dashboard_id }, params: {} },
          { additionalHashOptions: { locale: "fr" } },
        );
        await cardReq;

        const body = tableInteractiveBody(page);
        // all rows should be visible initially
        await expect.poll(() => body.getByRole("row").count()).toBeGreaterThan(2);
        await expect(body.getByText(/Glacia Froskeon/)).toBeVisible();
        await expect(body.getByText(/Hammera Francite/)).toBeVisible();
        await expect(body.getByText(/Francesca Gleason/)).toHaveCount(0);
        await expect(body.getByText(/Francesca Hammes/)).toHaveCount(0);

        await filterWidget(page).getByText("Multi", { exact: true }).click();
        // Search matches against untranslated text, hence "Fran" matching these
        // names; the OPTION text shows the translated label.
        const searchReq = waitForEmbedSearch(page);
        await page
          .getByPlaceholder("Recherche dans la liste")
          .pressSequentially("Fran");
        await searchReq;
        await page
          .getByRole("option", { name: "Glacia Froskeon", exact: true })
          .click();
        // The Mantine combobox dropdown floats over the submit button (Cypress's
        // synthetic click ignores the overlay; a real/forced click lands on the
        // floating ScrollArea). Escape closes the combobox — keeping the picked
        // pill — so the button below becomes clickable. Park the mouse first so
        // a tooltip under the cursor can't swallow the Escape.
        await page.mouse.move(0, 0);
        await page.keyboard.press("Escape");
        await page
          .getByTestId("parameter-value-dropdown")
          .getByRole("button", { name: /Ajouter un filtre/ })
          .click();

        // only the row matching the selection
        await expect.poll(() => body.getByRole("row").count()).toBe(1);
        await expect(body.getByText(/Glacia Froskeon/)).toBeVisible();
        await expect(body.getByText(/Hammera Francite/)).toHaveCount(0);
        await expect(body.getByText(/Francesca Gleason/)).toHaveCount(0);
        await expect(body.getByText(/Francesca Hammes/)).toHaveCount(0);

        await page.getByTestId("parameter-widget").click();
        // Search matches against untranslated text, hence "Fran" matching these
        // names. (No searchQuery wait here — upstream doesn't; the "Fran"
        // results are already cached from the first search.)
        await page
          .getByPlaceholder("Recherche dans la liste")
          .pressSequentially("Fran");
        await page
          .getByRole("option", { name: "Hammera Francite", exact: true })
          .click();
        // Park the mouse so a tooltip under the cursor can't eat the Escape.
        await page.mouse.move(0, 0);
        await page.keyboard.press("Escape");
        await page
          .getByTestId("parameter-value-dropdown")
          .getByRole("button", { name: /Mettre à jour le filtre/ })
          .click();

        // only the two rows matching the selection
        await expect.poll(() => body.getByRole("row").count()).toBe(2);
        await expect(body.getByText(/Glacia Froskeon/)).toBeVisible();
        await expect(body.getByText(/Hammera Francite/)).toBeVisible();
        await expect(body.getByText(/Francesca Gleason/)).toHaveCount(0);
        await expect(body.getByText(/Francesca Hammes/)).toHaveCount(0);
      });

      test("translates selected static-list filter label in guest embed", async ({
        mb,
        page,
      }) => {
        const staticListFilter = {
          name: "Number",
          slug: "number",
          id: "static-list-id",
          type: "number/=",
          sectionId: "number",
          values_source_type: "static-list" as const,
          values_source_config: {
            values: [
              ["1", "Gadget"],
              ["2", "Widget"],
            ],
          },
        };

        const { id, card_id, dashboard_id } = await createQuestionAndDashboard(
          mb.api,
          {
            questionDetails: {
              name: "Expression Question",
              query: {
                "source-table": PEOPLE_ID,
              },
            },
            dashboardDetails: {
              parameters: [staticListFilter],
              enable_embedding: true,
              embedding_params: {
                [staticListFilter.slug]: "enabled",
              },
            },
          },
        );
        // Map the parameter to an expression column so the filter widget is
        // visible, but hasFields() returns false (testing the tc() fix in
        // FormattedParameterValue).
        await mb.api.put(`/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 24,
              size_y: 9,
              parameter_mappings: [
                {
                  parameter_id: staticListFilter.id,
                  card_id,
                  target: [
                    "dimension",
                    ["expression", "Thing", { "base-type": "type/Integer" }],
                    { "stage-number": 0 },
                  ],
                },
              ],
            },
          ],
        });

        await visitEmbeddedPage(
          page,
          mb,
          { resource: { dashboard: dashboard_id }, params: {} },
          {
            setFilters: { [staticListFilter.slug]: "1" },
            additionalHashOptions: { locale: "de" },
          },
        );

        await expect(
          filterWidget(page).getByText("Gerät", { exact: true }),
        ).toBeVisible();
      });

      test("translates selected static-list filter label in guest embed for values without labels", async ({
        mb,
        page,
      }) => {
        const staticListFilter = {
          name: "String",
          slug: "string",
          id: "static-list-id",
          type: "string/=",
          sectionId: "string",
          values_source_type: "static-list" as const,
          values_source_config: {
            values: [["Gadget"], ["Widget"]],
          },
        };

        const { id, card_id, dashboard_id } = await createQuestionAndDashboard(
          mb.api,
          {
            questionDetails: {
              name: "Expression Question",
              query: {
                "source-table": PEOPLE_ID,
              },
            },
            dashboardDetails: {
              parameters: [staticListFilter],
              enable_embedding: true,
              embedding_params: {
                [staticListFilter.slug]: "enabled",
              },
            },
          },
        );
        await mb.api.put(`/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 24,
              size_y: 9,
              parameter_mappings: [
                {
                  parameter_id: staticListFilter.id,
                  card_id,
                  target: [
                    "dimension",
                    ["expression", "Thing", { "base-type": "type/Integer" }],
                    { "stage-number": 0 },
                  ],
                },
              ],
            },
          ],
        });

        await visitEmbeddedPage(
          page,
          mb,
          { resource: { dashboard: dashboard_id }, params: {} },
          {
            setFilters: { [staticListFilter.slug]: "Gadget" },
            additionalHashOptions: { locale: "de" },
          },
        );

        await expect(
          filterWidget(page).getByText("Gerät", { exact: true }),
        ).toBeVisible();
      });
    });
  });

  test.describe("tab names and text cards", () => {
    const SNAPSHOT = "tab-names-and-text-cards";
    const translations: DictionaryArray = [
      { locale: "de", msgid: "Tab 1", msgstr: "Reiter 1" },
      { locale: "de", msgid: "Tab 2", msgstr: "Reiter 2" },
      { locale: "de", msgid: "Sample Heading", msgstr: "Beispielüberschrift" },
      { locale: "de", msgid: "Sample Text", msgstr: "Beispieltext" },
    ];
    let snapshotReady = false;

    async function visitEmbeddedDashboard(
      mb: TranslationHarness,
      page: Page,
      { locale = "de" }: { locale?: string } = {},
    ) {
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { dashboard: ORDERS_DASHBOARD_ID }, params: {} },
        { additionalHashOptions: { locale } },
      );
    }

    async function visitNormalDashboard(
      mb: TranslationHarness,
      page: Page,
      { locale = "de" }: { locale?: string } = {},
    ) {
      await mb.api.put(`/api/user/${NORMAL_USER_ID}`, { locale });
      await mb.signInAsNormalUser();
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    }

    test.beforeEach(async ({ mb }) => {
      if (!snapshotReady) {
        await mb.restore();
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");
        await uploadTranslationDictionaryViaAPI(mb.api, translations);
        await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
          enable_embedding: true,
          tabs: [
            getDashboardTabDetails({ name: "Tab 1", id: 100 }),
            getDashboardTabDetails({ name: "Tab 2", id: 101 }),
          ],
          dashcards: [
            getHeadingCardDetails({
              col: 0,
              text: "Sample Heading",
              dashboard_tab_id: 100,
            }),
            getTextCardDetails({
              col: 0,
              text: "Sample Text",
              dashboard_tab_id: 100,
            }),
          ],
        });
        await mb.api.snapshot(SNAPSHOT);
        snapshotReady = true;
      }
      await mb.restore(SNAPSHOT);
      await mb.signInAsAdmin();
    });

    test("should translate text in dashboard tab names", async ({ mb, page }) => {
      await visitEmbeddedDashboard(mb, page);
      await expect(page.getByRole("tab", { name: "Reiter 1" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Reiter 2" })).toBeVisible();
    });

    test("should translate content in heading cards", async ({ mb, page }) => {
      await visitEmbeddedDashboard(mb, page);
      await expect(
        getDashboardCard(page, 0).getByText(/Beispielüberschrift/),
      ).toBeVisible();
    });

    test("should translate content in text cards", async ({ mb, page }) => {
      await visitEmbeddedDashboard(mb, page);
      await expect(
        getDashboardCard(page, 1).getByText(/Beispieltext/),
      ).toBeVisible();
    });

    test("translations of tab names and text cards do not break normal dashboard", async ({
      mb,
      page,
    }) => {
      await visitNormalDashboard(mb, page);
      await expect(page.getByRole("tab", { name: "Tab 1" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Tab 2" })).toBeVisible();
      await expect(
        page.getByTestId("dashcard").getByText(/Sample Heading/).first(),
      ).toBeVisible();
      await expect(
        page.getByTestId("dashcard").getByText(/Sample Text/).first(),
      ).toBeVisible();
    });
  });

  test.describe("funnel chart with translated dimension values (metabase#71488)", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await uploadTranslationDictionaryViaAPI(mb.api, [
        { locale: "fr", msgid: "Gadget", msgstr: "Le gadget" },
        { locale: "fr", msgid: "Doohickey", msgstr: "Le doohickey" },
        { locale: "fr", msgid: "Gizmo", msgstr: "Le gizmo" },
        { locale: "fr", msgid: "Widget", msgstr: "Le widget" },
      ]);
    });

    test("should render funnel with translated dimension labels in a static embed", async ({
      mb,
      page,
    }) => {
      const card = await createQuestion(mb.api, {
        name: "Products Funnel",
        display: "funnel",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
        visualization_settings: {
          "funnel.metric": "count",
          "funnel.dimension": "CATEGORY",
        },
      });
      const { id: dashboardId } = await createDashboard(mb.api, {
        name: "funnel_dashboard",
      });
      // Add the funnel card to the dashboard
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashboardId,
        card_id: card.id,
        card: { size_x: 16, size_y: 8 },
      });
      await visitDashboard(page, mb.api, dashboardId);
      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource: "dashboard",
        resourceId: dashboardId,
      });
      await publishChanges(page, "dashboard");
      await visitEmbeddedPage(
        page,
        mb,
        { resource: { dashboard: dashboardId }, params: {} },
        { additionalHashOptions: { locale: "fr" } },
      );

      // The funnel should render without crashing
      await expect(page.getByTestId("funnel-chart")).toBeVisible({
        timeout: 10_000,
      });
      // Dimension labels should be translated
      await expect(page.getByTestId("funnel-chart-header")).toHaveCount(4);
      const funnel = page.getByTestId("funnel-chart");
      await expect(funnel.getByText("Le gadget", { exact: true })).toBeVisible();
      await expect(funnel.getByText("Le doohickey", { exact: true })).toBeVisible();
      await expect(funnel.getByText("Le gizmo", { exact: true })).toBeVisible();
      await expect(funnel.getByText("Le widget", { exact: true })).toBeVisible();
    });
  });
});
