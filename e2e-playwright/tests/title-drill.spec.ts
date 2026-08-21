/**
 * Playwright port of e2e/test/scenarios/dashboard/title-drill.cy.spec.js.
 *
 * Notes:
 * - Title-drill navigations are client-side (the FE builds "#"/site-url-based
 *   hrefs that JS navigates); the slot backend's MB_SITE_URL is pinned so they
 *   stay on-slot. URL assertions use expect.poll over page.url()/pathname.
 * - The href on a chart title is "#" until the title is focused or hovered
 *   ("titles become actual HTML anchors on focus and on hover"); hover/focus
 *   before asserting the real href.
 * - Describe 3 reuses one intercept alias across many waits; after a title
 *   drill the reruns fire against a different endpoint, so we sync via
 *   waitForTitleDrillQuery (see support/title-drill.ts).
 */
import type { Locator, Page } from "@playwright/test";

import { addOrUpdateDashboardCard } from "../support/drillthroughs";
import { filterWidget, getDashboardCard } from "../support/dashboard";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import { test, expect } from "../support/fixtures";
import {
  createDashboard,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
  dashboardParametersPopover,
  editDashboardCard,
  visitDashboardWithParams,
} from "../support/filters-repros";
import { cartesianChartCircles } from "../support/metrics";
import { fieldValuesCombobox } from "../support/native-filters";
import { queryBuilderMain } from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  checkFilterLabelAndValue,
  checkScalarResult,
  createDashboardWithQuestions,
  waitForTitleDrillQuery,
} from "../support/title-drill";
import { appBar, popover } from "../support/ui";
import { visitDashboard } from "../support/ui";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

test.describe("scenarios > dashboard > title drill", () => {
  test.describe(
    "on a native question without connected dashboard parameters",
    () => {
      let questionId: number;

      test.beforeEach(async ({ page, mb }) => {
        await mb.restore();
        await mb.signInAsAdmin();

        const questionDetails = {
          name: "Q1",
          native: { query: 'SELECT 1 as "foo", 2 as "bar"' },
          display: "bar",
          visualization_settings: {
            "graph.dimensions": ["foo"],
            "graph.metrics": ["bar"],
          },
        };

        const dashcard = await createNativeQuestionAndDashboard(mb.api, {
          questionDetails,
        });
        questionId = dashcard.card_id;
        await visitDashboard(page, mb.api, dashcard.dashboard_id);
      });

      test.describe("as a user with access to underlying data", () => {
        test("should let you click through the title to the query builder (metabase#13042)", async ({
          page,
        }) => {
          await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

          const title = getDashboardCard(page).getByRole("link", {
            name: "Q1",
            exact: true,
          });
          await title.hover();
          await expect(title).toHaveAttribute(
            "href",
            new RegExp(`/question/${questionId}`),
          );
          await title.click();

          await expect(
            queryBuilderMain(page).getByText("This question is written in SQL.", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            queryBuilderMain(page).getByText("foo", { exact: true }),
          ).toBeVisible();
          await expect(
            queryBuilderMain(page).getByText("bar", { exact: true }),
          ).toBeVisible();

          await expect
            .poll(() => new URL(page.url()).pathname)
            .toBe(`/question/${questionId}-q1`);
        });
      });

      test.describe("as a user without access to the underlying data", () => {
        test.beforeEach(async ({ page, mb }) => {
          await mb.signIn("nodata");
          await page.reload();
        });

        test("should let you click through the title to the query builder (metabase#13042)", async ({
          page,
        }) => {
          await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

          const title = getDashboardCard(page).getByRole("link", {
            name: "Q1",
            exact: true,
          });
          await title.hover();
          await expect(title).toHaveAttribute(
            "href",
            new RegExp(`/question/${questionId}`),
          );
          await title.click();

          await expect(
            queryBuilderMain(page).getByText("This question is written in SQL.", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            queryBuilderMain(page).getByText("foo", { exact: true }),
          ).toBeVisible();
          await expect(
            queryBuilderMain(page).getByText("bar", { exact: true }),
          ).toBeVisible();

          await expect
            .poll(() => new URL(page.url()).pathname)
            .toBe(`/question/${questionId}-q1`);
        });
      });
    },
  );

  test.describe(
    "on a native question with a connected dashboard parameter",
    () => {
      const filter = {
        name: "Text contains",
        slug: "text_contains",
        id: "98289b9b",
        type: "string/contains",
        sectionId: "string",
      };

      test.beforeEach(async ({ page, mb }) => {
        await mb.restore();
        await mb.signInAsAdmin();

        const questionDetails = {
          name: "16181",
          native: {
            query: "select count(*) from products where {{filter}}",
            "template-tags": {
              filter: {
                id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
                name: "filter",
                "display-name": "Filter",
                type: "dimension",
                dimension: ["field", PRODUCTS.TITLE, null],
                "widget-type": "string/contains",
                default: null,
              },
            },
          },
          display: "scalar",
        };

        const dashboardDetails = { parameters: [filter] };

        const { id, card_id, dashboard_id } =
          await createNativeQuestionAndDashboard(mb.api, {
            questionDetails,
            dashboardDetails,
          });

        // Connect filter to the card
        await mb.api.put(`/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 11,
              size_y: 6,
              parameter_mappings: [
                {
                  parameter_id: filter.id,
                  card_id,
                  target: ["dimension", ["template-tag", "filter"]],
                },
              ],
            },
          ],
        });

        await visitDashboard(page, mb.api, dashboard_id);
        await checkScalarResult(page, "200");
      });

      // Both variants (admin / nodata) run the identical body.
      const runTitleDrillFilterTest = async (page: Page) => {
        await checkScalarResult(page, "200");

        await page.getByText("Text contains", { exact: true }).click();
        const input = page.getByPlaceholder("Enter some text", { exact: true });
        await input.fill("bb");
        await input.blur();
        await page.getByRole("button", { name: "Add filter", exact: true }).click();

        await checkFilterLabelAndValue(page, "Text contains", "bb");
        await checkScalarResult(page, "12");

        // Drill through on the question's title
        await page.getByText("16181", { exact: true }).click();

        await checkFilterLabelAndValue(page, "Filter", "bb");
        await checkScalarResult(page, "12");
      };

      test.describe("as a user with access to underlying data", () => {
        test("'contains' filter should still work after title drill through IF the native question field filter's type matches exactly (metabase#16181)", async ({
          page,
        }) => {
          await runTitleDrillFilterTest(page);
        });
      });

      test.describe("as a user without access to underlying data", () => {
        test.beforeEach(async ({ page, mb }) => {
          await mb.signIn("nodata");
          await page.reload();
          await checkScalarResult(page, "200");
        });

        test("'contains' filter should still work after title drill through IF the native question field filter's type matches exactly (metabase#16181)", async ({
          page,
        }) => {
          await runTitleDrillFilterTest(page);
        });
      });
    },
  );

  test.describe(
    "on a simple question with a connected dashboard parameter",
    () => {
      const questionDetails = {
        name: "GUI Question",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
        display: "pie",
      };

      const filterWithDefaultValue = {
        name: "Category",
        slug: "category",
        id: "c32a49e1",
        type: "category",
        default: ["Doohickey"],
      };

      const filter = { name: "ID", slug: "id", id: "f2bf003c", type: "id" };

      const dashboardDetails = {
        parameters: [filterWithDefaultValue, filter],
      };

      let questionId: number;

      test.beforeEach(async ({ page, mb }) => {
        await mb.restore();
        await mb.signInAsAdmin();

        const dashboardCard = await createQuestionAndDashboard(mb.api, {
          questionDetails,
          dashboardDetails,
        });
        const { card_id } = dashboardCard;
        questionId = card_id;

        await editDashboardCard(mb.api, dashboardCard, {
          parameter_mappings: [
            {
              parameter_id: filterWithDefaultValue.id,
              card_id,
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
            },
            {
              parameter_id: filter.id,
              card_id,
              target: ["dimension", ["field", PRODUCTS.ID, null]],
            },
          ],
        });

        // visitDashboard already awaits the dashcard query (the spec's first
        // cy.wait("@cardQuery")).
        await visitDashboard(page, mb.api, dashboardCard.dashboard_id);
      });

      test.describe("as a user with access to underlying data", () => {
        test("should let you click through the title to the query builder with the parameter applied as a filter on the question", async ({
          page,
        }) => {
          // make sure query results are correct
          await expect(
            getDashboardCard(page).getByText("42", { exact: true }),
          ).toBeVisible();

          const title = getDashboardCard(page).getByRole("link", {
            name: "GUI Question",
            exact: true,
          });
          await title.hover();
          await expect(title).toHaveAttribute("href", /\/question#/);
          await title.click();

          // make sure the query builder filter is present
          await expect(
            queryBuilderFiltersPanel(page).getByText("Category is Doohickey", {
              exact: true,
            }),
          ).toBeVisible();

          // make sure the results match
          await expect(
            queryBuilderMain(page).getByText("42", { exact: true }),
          ).toBeVisible();
          await expect.poll(() => page.url()).toContain("/question#");
        });
      });

      test.describe("as a user without access to underlying data", () => {
        test.beforeEach(async ({ page, mb }) => {
          const cardQuery = waitForTitleDrillQuery(page);
          await mb.signIn("nodata");
          await page.reload();
          await cardQuery;
        });

        test("should let you click through the title to the query builder with the parameter filter showing in the query builder", async ({
          page,
        }) => {
          // make sure query results are correct
          await expect(
            getDashboardCard(page).getByText("42", { exact: true }),
          ).toBeVisible();

          const title = getDashboardCard(page).getByRole("link", {
            name: "GUI Question",
            exact: true,
          });
          await title.hover();
          await expect(title).toHaveAttribute(
            "href",
            /\/question\?category=Doohickey&id=#/,
          );
          await title.click();

          // make sure the results match
          await expect(
            queryBuilderMain(page).getByText("42", { exact: true }),
          ).toBeVisible();
          await expect
            .poll(() => page.url())
            .toContain(`/question/${questionId}-gui-question?category=Doohickey&id=#`);

          // update the parameter filter to a new value
          await filterWidget(page).filter({ hasText: "Doohickey" }).first().click();
          const popup = dashboardParametersPopover(page);
          await popup.getByText("Doohickey", { exact: true }).click();
          await popup.getByText("Gadget", { exact: true }).click();
          await popup.getByText("Update filter", { exact: true }).click();

          // rerun the query with the newly set filter
          let cardQuery = waitForTitleDrillQuery(page);
          await page.getByTestId("run-button").first().click();
          await cardQuery;

          // make sure the results reflect the new filter
          await expect(
            queryBuilderMain(page).getByText("53", { exact: true }),
          ).toBeVisible();

          // make sure the set parameter filter persists after a page refresh
          cardQuery = waitForTitleDrillQuery(page);
          await page.reload();
          await cardQuery;

          await expect(
            queryBuilderMain(page).getByText("53", { exact: true }),
          ).toBeVisible();

          // make sure the unset id parameter works
          await filterWidget(page).last().click();
          const idPopup = dashboardParametersPopover(page);
          await fieldValuesCombobox(idPopup).pressSequentially("5");
          await idPopup.getByText("Add filter", { exact: true }).click();

          // rerun the query with the newly set filter
          cardQuery = waitForTitleDrillQuery(page);
          await page.getByTestId("run-button").first().click();
          await cardQuery;

          await expect(
            queryBuilderMain(page).getByText("1", { exact: true }),
          ).toBeVisible();
        });
      });
    },
  );

  test.describe(
    "on a nested simple question with a connected dashboard parameter",
    () => {
      const questionDetails = {
        name: "GUI Question",
        query: {
          "source-table": PRODUCTS_ID,
        },
      };
      const baseNestedQuestionName = "Nested GUI Question";

      const idFilter = { name: "ID", slug: "id", id: "f2bf003c", type: "id" };

      const dashboardDetails = {
        name: "Nested question dashboard",
        parameters: [idFilter],
      };

      let dashboardId: number;

      test.beforeEach(async ({ mb }) => {
        await mb.restore();
        await mb.signInAsAdmin();

        const { id: questionId } = await createQuestion(mb.api, questionDetails);

        const { id: nestedQuestionId } = await createQuestion(mb.api, {
          name: baseNestedQuestionName,
          query: {
            "source-table": `card__${questionId}`,
          },
        });

        const dashboard = await createDashboard(mb.api, dashboardDetails);
        dashboardId = dashboard.id;

        await addOrUpdateDashboardCard(mb.api, {
          card_id: nestedQuestionId,
          dashboard_id: dashboardId,
          card: {
            parameter_mappings: [
              {
                parameter_id: idFilter.id,
                card_id: nestedQuestionId,
                target: ["dimension", ["field", PRODUCTS.ID, null]],
              },
            ],
          },
        });
      });

      test("should lead you to a table question with filtered ID (metabase#17213)", async ({
        page,
        mb,
      }) => {
        const productRecordId = 3;
        await visitDashboardWithParams(page, mb.api, dashboardId, {
          id: productRecordId,
        });

        const title = getDashboardCard(page).getByRole("link", {
          name: baseNestedQuestionName,
          exact: true,
        });
        await title.hover();
        await expect(title).toHaveAttribute("href", /\/question#/);
        await title.click();

        await expect(
          appBar(page).getByText(
            new RegExp(`Started from ${baseNestedQuestionName}`),
          ),
        ).toBeVisible();
        await expect(
          page
            .getByTestId("question-row-count")
            .getByText("Showing 1 row", { exact: true }),
        ).toBeVisible();

        await expect(page.getByTestId("object-detail")).toHaveCount(0);
        await expect.poll(() => page.url()).toContain("/question#");
      });
    },
  );

  test.describe("on various charts", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("titles become actual HTML anchors on focus and on hover", async ({
      page,
      mb,
    }) => {
      const { dashboard, questions } = await createDashboardWithQuestions(
        mb.api,
        {
          dashboardName: "Dashboard with aggregated Q2",
          questions: [
            {
              name: "Line chart",
              display: "line",
              query: {
                "source-table": ORDERS_ID,
                aggregation: [["count"]],
                breakout: [
                  ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
                ],
                limit: 5,
              },
            },
            {
              name: "Row chart",
              display: "row",
              query: {
                "source-table": ORDERS_ID,
                aggregation: [["count"]],
                breakout: [
                  ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
                ],
                limit: 5,
              },
            },
            {
              name: "Map chart",
              display: "map",
              query: {
                "source-table": PEOPLE_ID,
                limit: 5,
              },
            },
            {
              name: "Funnel chart",
              display: "funnel",
              query: {
                "source-table": PEOPLE_ID,
                aggregation: [["count"]],
                breakout: [["field", PEOPLE.SOURCE]],
                limit: 5,
              },
            },
          ],
          cards: [
            { row: 0, col: 0, size_x: 6, size_y: 6 },
            { row: 0, col: 6, size_x: 6, size_y: 6 },
            { row: 6, col: 0, size_x: 6, size_y: 6 },
            { row: 6, col: 6, size_x: 6, size_y: 6 },
          ],
        },
      );

      await visitDashboard(page, mb.api, dashboard.id);

      // make cursor start from a place where subsequent hover() calls
      // won't make the cursor move over the other cards during test
      // (which would interfere with assertions)
      await page.getByTestId("sidebar-toggle").hover();

      const lineChartTitle = getDashboardCard(page, 0).getByRole("link", {
        name: "Line chart",
        exact: true,
      });
      const rowChartTitle = getDashboardCard(page, 1).getByRole("link", {
        name: "Row chart",
        exact: true,
      });
      const mapChartTitle = getDashboardCard(page, 2).getByRole("link", {
        name: "Map chart",
        exact: true,
      });
      const funnelChartTitle = getDashboardCard(page, 3).getByRole("link", {
        name: "Funnel chart",
        exact: true,
      });

      await assertTitleHrefOnFocus(lineChartTitle, {
        href: `/question/${questions[0].id}-line-chart`,
      });
      await assertTitleHrefOnFocus(rowChartTitle, {
        href: `/question/${questions[1].id}-row-chart`,
      });
      await assertTitleHrefOnHover(mapChartTitle, {
        href: `/question/${questions[2].id}-map-chart`,
      });
      await assertTitleHrefOnHover(funnelChartTitle, {
        href: `/question/${questions[3].id}-funnel-chart`,
      });
    });

    async function assertTitleHrefOnFocus(
      title: Locator,
      { href }: { href: string },
    ) {
      await expect(title).toHaveAttribute("href", "#");
      await title.focus();
      await expect(title).toHaveAttribute("href", href);
    }

    async function assertTitleHrefOnHover(
      title: Locator,
      { href }: { href: string },
    ) {
      await expect(title).toHaveAttribute("href", "#");
      await title.hover();
      await expect(title).toHaveAttribute("href", href);
    }
  });

  test.describe("multiple series", () => {
    const question1Details = {
      name: "Q1",
      query: {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [["field", PEOPLE.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    };

    const question2Details = {
      name: "Q2",
      query: {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [["field", PEOPLE.BIRTH_DATE, { "temporal-unit": "year" }]],
      },
      display: "line",
    };

    const dateParameter = {
      id: "date",
      name: "Date",
      slug: "date",
      type: "date/all-options",
      default: "1970-01-01~2025-01-01",
    };

    const dashboardDetails = {
      parameters: [dateParameter],
    };

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsNormalUser();
    });

    test("should use parameters mapped to each card for a multi-series dashcard", async ({
      page,
      mb,
    }) => {
      const { id, card_id, dashboard_id } = await createQuestionAndDashboard(
        mb.api,
        {
          questionDetails: question1Details,
          dashboardDetails,
        },
      );
      const { id: card_2_id } = await createQuestion(mb.api, question2Details);
      await mb.api.put(`/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            series: [{ id: card_2_id }],
            row: 0,
            col: 0,
            size_x: 16,
            size_y: 8,
            parameter_mappings: [
              {
                parameter_id: dateParameter.id,
                card_id,
                target: ["dimension", ["field", PEOPLE.CREATED_AT, null]],
              },
              {
                parameter_id: dateParameter.id,
                card_id: card_2_id,
                target: ["dimension", ["field", PEOPLE.BIRTH_DATE, null]],
              },
            ],
          },
        ],
      });
      await visitDashboard(page, mb.api, dashboard_id);

      // click on a dot in the second series and drill thru
      await cartesianChartCircles(page).nth(20).click();
      await popover(page).getByText("See these People", { exact: true }).click();

      // make sure the parameter mapping for the second series was used
      await expect(
        queryBuilderFiltersPanel(page).getByText(
          "Birth Date is Jan 1, 1970 – Jan 1, 2025",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        queryBuilderFiltersPanel(page).getByText(/Created At/),
      ).toHaveCount(0);
    });
  });
});
