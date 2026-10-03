/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/visualizations-charts-reproductions.cy.spec.js
 *
 * ⚠️ TWO upstream files share this basename. The sibling
 * `visualizations-charts-reproductions.cy.spec.**ts**` (issues 43075, 41133,
 * 45255, …) was ported earlier as
 * `tests/visualizations-charts-reproductions.spec.ts`. THIS file ports the
 * `.cy.spec.**js**` one (issues 16170, 17524, 18061, …) — the two issue sets are
 * completely disjoint. The target filename differs so neither overwrites the
 * other.
 *
 * INFRA TIER
 * ----------
 * Almost none. 24 of the 26 tests run on the bare `default` snapshot with no
 * container at all. The exceptions:
 *  - `issue 16170` (2 tests) is tagged `@mongo` upstream: it restores the
 *    `mongo-5` snapshot and queries database 2 (the mongo-sample container).
 *    Gated on PW_QA_DB_ENABLED per the playbook, and tagged `@mongo` here too.
 *    This is a MONGO dependency, not the writable QA-Postgres/MySQL tier.
 *  - `issue 49160` (2 tests) needs an EE token (`pro-self-hosted`) but no
 *    container.
 *  - `issue 22527` is tagged `@skip` upstream (never runs in CI); ported
 *    faithfully as `test.skip`.
 *
 * PORTING NOTES
 * -------------
 * - `.trigger("mousemove")` on a chart element → a synthetic MouseEvent
 *   dispatch (`triggerMousemove`), never a real hover — ECharts hit-tests the
 *   tooltip from the cursor coordinate and a real hover on a dense series is
 *   refused by Playwright's actionability check (PORTING, waves 12/13).
 * - `.realHover()` on a chart path → `hover({ force: true })`, same reason.
 * - `cy.get("@alias.all").should("have.length", n)` and `cy.spy()` intercepts →
 *   passive `page.on("response")` counters (`countResponses`).
 * - `H.visitQuestionAdhoc` on a NATIVE query autoruns in Cypress
 *   (`runQueryIfNeeded`); the spike's `visitQuestionAdhoc` refuses native
 *   autorun, so those cases use `visitNativeAdhoc` (visit + runNativeQuery),
 *   the faithful equivalent.
 *
 * UPSTREAM ASSERTIONS THAT ARE WEAKER THAN THEY LOOK (ported verbatim, with the
 * analysis inline at each site — NOT silently strengthened):
 *  - issue 20548's `assertOnLegendItemFrequency`: `cy.contains()` always yields
 *    exactly one element, so `should("have.length", frequency)` can only ever
 *    pass for frequency === 1.
 *  - issue 27279's x-axis tick check: `H.echartsContainer().get("text")` —
 *    `cy.get()` RESETS the subject, so the echartsContainer scope is dead code,
 *    and the following `.contains(regex)` yields only the FIRST match. The
 *    `compareValuesInOrder` loop therefore checks exactly one of the four ticks.
 *  - issue 33208's `H.saveSavedQuestion("top category")`: the helper takes no
 *    parameters (e2e-misc-helpers.js:382), so the question is never renamed.
 */
import { expect, test } from "../support/fixtures";
import { chartPathWithFillColor } from "../support/binning";
import { echartsContainer, leftSidebar, openVizSettingsSidebar, tooltip } from "../support/charts";
import { filterSimple } from "../support/filter";
import { editDashboardCard } from "../support/filters-repros";
import {
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { addSummaryField, addSummaryGroupingField, selectFilterOperator } from "../support/joins";
import { removeSummaryGroupingField } from "../support/documents-core";
import { openSeriesSettings, triggerMousemove } from "../support/line-chart";
import { summarize, tableInteractive } from "../support/models";
import {
  assertQueryBuilderRowCount,
  openNotebook,
  queryBuilderMain,
  visualize,
} from "../support/notebook";
import { focusNativeEditor } from "../support/native-editor";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { editDashboard, filterWidget, getDashboardCard, saveDashboard } from "../support/dashboard";
import { icon, modal, popover, queryBuilderHeader, visitDashboard, visitQuestion } from "../support/ui";
import { selectDataset, switchToAddMoreData } from "../support/visualizer-basics";
import { assertEChartsTooltip, echartsTooltip, saveSavedQuestion } from "../support/viz-charts-repros";
import {
  MONGO_SKIP_REASON,
  cartesianChartCircles,
  countResponses,
  testPairedTooltipValues,
  toggleFieldSelectElement,
  visitAdhoc,
  visitAdhocNotebook,
  visitNativeAdhoc,
  withDatabase,
} from "../support/visualizations-charts-reproductions";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;
const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;
const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;
const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

const externalDatabaseId = 2;

test.describe("issue 16170", { tag: "@mongo" }, () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, MONGO_SKIP_REASON);

  async function replaceMissingValuesWith(page: import("@playwright/test").Page, value: string) {
    const select = page
      .locator('[data-field-title="Replace missing values with"]')
      .getByTestId("chart-setting-select");

    // The first click on this Mantine Select intermittently does NOT open the
    // dropdown — measured 1/3 runs opened on the first click, 2/3 needed a
    // second. `aria-expanded` is null in both states, so there is no DOM signal
    // to gate on beforehand; re-nudge in a toPass loop, the pattern PORTING
    // prescribes for widget state with no signal. Cypress's command-queue
    // latency covered the window. Mechanism unconfirmed — most likely the
    // widget popover is still settling and its dismiss handler swallows the
    // freshly-opened dropdown — recorded as unexplained rather than asserted.
    // The option click is INSIDE the loop on purpose: the dropdown can also
    // close again between "it is open" and the click, so opening and picking
    // have to be retried together.
    //
    // The Select options render as role="option" OUTSIDE H.popover()'s
    // selector, and the option text div is not the click target (PORTING) —
    // pick the role, not the text.
    const option = page.getByRole("option", { name: value });
    await expect(async () => {
      if (!(await option.isVisible())) {
        await select.click({ timeout: 2000 });
      }
      await option.click({ timeout: 2000 });
    }).toPass({ timeout: 30000 });
    // popover().findByDisplayValue(value) — the Select now reads back `value`.
    await expect(select).toHaveValue(value);

    // click outside popover
    await page.getByTestId("chartsettings-list-container").click();
  }

  async function assertOnTheYAxis(page: import("@playwright/test").Page) {
    await expect(echartsContainer(page).getByText("Count").first()).toBeVisible();
    await expect(echartsContainer(page).getByText("6,000").first()).toBeVisible();
  }

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore("mongo-5");
    await mb.signInAsAdmin();

    const db = await withDatabase(mb.api, externalDatabaseId);
    const ORDERS_FIELDS = db.ORDERS as unknown as Record<string, number>;
    const MONGO_ORDERS_ID = db.ORDERS_ID as unknown as number;

    const { id } = await createQuestion(mb.api, {
      name: "16170",
      query: {
        "source-table": MONGO_ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS_FIELDS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      database: externalDatabaseId,
      display: "line",
    });
    await visitQuestion(page, id);
  });

  for (const replacementValue of ["Zero", "Nothing"]) {
    test(`replace missing values with "${replacementValue}" should work on Mongo (metabase#16170)`, async ({
      page,
    }) => {
      await openVizSettingsSidebar(page);

      await openSeriesSettings(page, "Count");

      await replaceMissingValuesWith(page, replacementValue);

      await assertOnTheYAxis(page);

      const circles = cartesianChartCircles(page);
      await expect(circles).toHaveCount(6);

      // .eq(-2) — the second-to-last circle. Re-nudged: changing the
      // missing-values setting re-renders the chart, and a mousemove dispatched
      // while ECharts is still settling resolves to the wrong data point (1 run
      // in 6 produced a tooltip without the 6,524 row). Re-dispatching is
      // idempotent and the gate is the DISCRIMINATING value — mutation M7
      // (hovering circle 0 instead) still dies here with header "2015", so this
      // tolerates the settle window without weakening the assertion.
      await expect(async () => {
        await triggerMousemove(circles.nth(-2));
        await expect(
          echartsTooltip(page).getByTestId("echarts-tooltip-header"),
        ).toHaveText("2019", { timeout: 2000 });
      }).toPass({ timeout: 20000 });

      await assertEChartsTooltip(page, {
        header: "2019",
        rows: [
          {
            name: "Count",
            value: "6,524",
          },
        ],
      });
    });
  }
});

test.describe("issue 17524", () => {
  const nativeQuestionDetails = {
    native: {
      query:
        "select * from (\nselect 'A' step, 41 users, 42 median union all\nselect 'B' step, 31 users, 32 median union all\nselect 'C' step, 21 users, 22 median union all\nselect 'D' step, 11 users, 12 median\n) x\n[[where users>{{num}}]]\n",
      "template-tags": {
        num: {
          id: "d7f1fb15-c7b8-6051-443d-604b6ed5457b",
          name: "num",
          "display-name": "Num",
          type: "number",
          default: null,
        },
      },
    },
    display: "funnel",
    visualization_settings: {
      "funnel.dimension": "STEP",
      "funnel.metric": "USERS",
    },
  };

  const questionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"], ["sum", ["field", PRODUCTS.PRICE, null]]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
    display: "funnel",
    visualization_settings: {
      "funnel.metric": "count",
      "funnel.dimension": "CATEGORY",
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("scenario 1", () => {
    test.beforeEach(async ({ mb, page }) => {
      const { id } = await createNativeQuestion(mb.api, nativeQuestionDetails);
      await visitQuestion(page, id);
    });

    test("should not alter visualization type when applying filter on a native question (metabase#17524-1)", async ({
      page,
    }) => {
      // cy.type() clicks its subject first (PORTING) — the widget is a wrapper
      // whose click focuses the inner input.
      const widget = filterWidget(page).first();
      await widget.click();
      await page.keyboard.type("1");

      // cy.get("polygon") carries an implicit existence assertion.
      await expect(page.locator("polygon").first()).toBeAttached();

      await icon(page, "play").last().click();

      await expect(page.locator("polygon").first()).toBeAttached();
      await expect(page.getByText("Save", { exact: true })).toHaveCount(0);
    });
  });

  test.describe("scenario 2", () => {
    test.beforeEach(async ({ mb, page }) => {
      const { id } = await createQuestion(mb.api, questionDetails);
      await visitQuestion(page, id);
    });

    test("should not alter visualization type when applying filter on a QB question (metabase#17524-2)", async ({
      page,
    }) => {
      await expect(page.locator("polygon").first()).toBeAttached();

      await filterSimple(page);
      await popover(page).getByText("ID", { exact: true }).first().click();
      await selectFilterOperator(page, "Greater than");
      const filterPopover = popover(page);
      const value = filterPopover.getByLabel("Filter value", { exact: true });
      await value.click();
      await page.keyboard.type("1");
      // MultiAutocomplete/PillsInput blur trap (PORTING): a real mousedown on
      // the submit button blurs the input, which re-renders the form, so the
      // click event is never delivered. Blur first.
      await value.blur();
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();

      await expect(page.locator("polygon").first()).toBeAttached();
    });
  });
});

test.describe("issue 18061", () => {
  const questionDetails = {
    name: "18061",
    query: {
      "source-table": PEOPLE_ID,
      expressions: {
        CClat: [
          "case",
          [
            [
              [">", ["field", PEOPLE.ID, null], 1],
              ["field", PEOPLE.LATITUDE, null],
            ],
          ],
        ],
        CClong: [
          "case",
          [
            [
              [">", ["field", PEOPLE.ID, null], 1],
              ["field", PEOPLE.LONGITUDE, null],
            ],
          ],
        ],
      },
      filter: ["<", ["field", PEOPLE.ID, null], 3],
    },
    display: "map",
    visualization_settings: {
      "map.latitude_column": "CClat",
      "map.longitude_column": "CClong",
    },
  };

  const filter = {
    name: "Category",
    slug: "category",
    id: "749a03b5",
    type: "category",
  };

  const dashboardDetails = { name: "18061D", parameters: [filter] };

  async function addFilter(page: import("@playwright/test").Page, name: string) {
    await filterWidget(page).first().click();
    // cy.contains — case-sensitive substring, first hit.
    await popover(page).getByText(name, { exact: false }).first().click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
  }

  let publicLink: string;
  let questionUrl: string;
  let dashboardUrl: string;
  let dashboardId: number;
  let cardId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashboardCard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    const { dashboard_id, card_id } = dashboardCard;
    dashboardId = dashboard_id;
    cardId = card_id;

    // Enable sharing
    const { uuid } = (await (
      await mb.api.post(`/api/dashboard/${dashboard_id}/public_link`)
    ).json()) as { uuid: string };
    publicLink = `/public/dashboard/${uuid}`;

    questionUrl = `/question/${card_id}`;
    dashboardUrl = `/dashboard/${dashboard_id}`;

    await editDashboardCard(mb.api, dashboardCard, {
      parameter_mappings: [
        {
          parameter_id: filter.id,
          card_id,
          target: ["dimension", ["field", PEOPLE.SOURCE, null]],
        },
      ],
    });
  });

  test.describe("scenario 1: question with a filter", () => {
    test("should handle data sets that contain only null values for longitude/latitude (metabase#18061-1)", async ({
      page,
    }) => {
      // The @getCard / @cardQuery waits the Cypress test performs after
      // visiting the question.
      const getCard = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === `/api/card/${cardId}`,
      );
      const cardQuery = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === `/api/card/${cardId}/query`,
      );
      await page.goto(questionUrl);
      await getCard;
      await cardQuery;

      await page.evaluate(() => {
        (window as unknown as { beforeReload?: boolean }).beforeReload = true;
      });

      await queryBuilderHeader(page)
        .getByTestId("filters-visibility-control")
        .click();
      await page
        .getByTestId("qb-filters-panel")
        .getByText("ID is less than 3", { exact: true })
        .click();

      const input = popover(page).locator('input[value="3"]').first();
      await input.click();
      // cy.type() puts the caret at position 0, so a leading {backspace} would
      // delete nothing — press End first (PORTING, wave 12).
      await page.keyboard.press("End");
      await page.keyboard.press("Backspace");
      await page.keyboard.type("2");
      await popover(page)
        .getByRole("button", { name: "Update filter", exact: true })
        .click();

      await expect(
        queryBuilderMain(page).getByText("Something went wrong", {
          exact: true,
        }),
      ).toHaveCount(0);

      await expect(
        page
          .getByTestId("qb-filters-panel")
          .getByText("ID is less than 2", { exact: true }),
      ).toBeVisible();
      await expect(page.locator("[data-element-id=pin-map]")).toBeVisible();

      // The page must not have reloaded — the marker we set survives.
      expect(
        await page.evaluate(
          () => (window as unknown as { beforeReload?: boolean }).beforeReload,
        ),
      ).toBe(true);
    });
  });

  test.describe("scenario 2: dashboard with a filter", () => {
    test("should handle data sets that contain only null values for longitude/latitude (metabase#18061-2)", async ({
      page,
    }) => {
      const dashCardQueryPath = new RegExp(
        `^/api/dashboard/${dashboardId}/dashcard/\\d+/card/${cardId}/query$`,
      );
      const firstQuery = page.waitForResponse((response) =>
        dashCardQueryPath.test(new URL(response.url()).pathname),
      );
      await page.goto(dashboardUrl);
      await firstQuery;

      const secondQuery = page.waitForResponse((response) =>
        dashCardQueryPath.test(new URL(response.url()).pathname),
      );
      await addFilter(page, "Twitter");
      await secondQuery;

      await expect(
        page.getByText("Something went wrong", { exact: true }),
      ).toHaveCount(0);

      await expect
        .poll(() => new URL(page.url()).search)
        .toBe("?category=Twitter");
    });
  });

  test.describe("scenario 3: publicly shared dashboard with a filter", () => {
    test("should handle data sets that contain only null values for longitude/latitude (metabase#18061-3)", async ({
      page,
    }) => {
      await page.goto(publicLink);

      await expect(page.getByText("18061D", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("18061", { exact: true }).first()).toBeVisible();
      await expect(page.locator("[data-element-id=pin-map]")).toBeVisible();

      await addFilter(page, "Twitter");
      await expect
        .poll(() => new URL(page.url()).search)
        .toBe("?category=Twitter");
      await expect(page.getByTestId("no-results-image").first()).toBeVisible();
      await expect(page.locator("[data-element-id=pin-map]")).toHaveCount(0);
    });
  });
});

test.describe("issue 18063", () => {
  const questionDetails = {
    name: "18063",
    native: {
      query:
        'select null "LATITUDE", null "LONGITUDE", null "COUNT", \'NULL ROW\' "NAME"\nunion all select 55.6761, 12.5683, 1, \'Copenhagen\'\n',
      "template-tags": {},
    },
    display: "map",
  };

  async function selectFieldValue(
    page: import("@playwright/test").Page,
    field: string,
    value: string,
  ) {
    await toggleFieldSelectElement(page, field);
    await popover(page).getByText(value, { exact: true }).first().click();
  }

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createNativeQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    // Select a Pin map
    await openVizSettingsSidebar(page);
    await page
      .getByTestId("chart-settings-widget-map.type")
      .locator('input[value="Region map"]')
      .click();
    await popover(page).getByText("Pin map", { exact: false }).first().click();

    // Click on the popovers to close both popovers that open automatically.
    // Please see: https://github.com/metabase/metabase/issues/18063#issuecomment-927836691
    for (const field of ["Latitude field", "Longitude field"]) {
      await toggleFieldSelectElement(leftSidebar(page), field);
    }
  });

  test("should show the correct tooltip details for pin map even when some locations are null (metabase#18063)", async ({
    page,
  }) => {
    await selectFieldValue(page, "Latitude field", "LATITUDE");
    await selectFieldValue(page, "Longitude field", "LONGITUDE");

    await triggerMousemove(page.locator(".leaflet-marker-icon").first());

    const scope = tooltip(page).first();
    await testPairedTooltipValues(scope, "LATITUDE", "55.68");
    await testPairedTooltipValues(scope, "LONGITUDE", "12.57");
    await testPairedTooltipValues(scope, "COUNT", "1");
    await testPairedTooltipValues(scope, "NAME", "Copenhagen");
  });
});

test.describe("issue 18776", () => {
  const questionDetails = {
    dataset_query: {
      type: "native" as const,
      native: {
        query: `
  select 101002 as "id", 1 as "rate"
  union all select 103017, 2
  union all select 210002, 3`,
      },
      database: SAMPLE_DB_ID,
    },
    display: "bar",
    visualization_settings: {
      "graph.dimensions": ["id"],
      "graph.metrics": ["rate"],
      "graph.x_axis.axis_enabled": false,
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not freeze when opening a timeseries chart with sparse data and without the X-axis", async ({
    page,
  }) => {
    await visitNativeAdhoc(page, questionDetails);
    await expect(
      page.getByText("Visualization", { exact: true }).first(),
    ).toBeVisible();
  });
});

test.describe("issue 20548", () => {
  const questionDetails = {
    name: "20548",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["sum", ["field", PRODUCTS.PRICE, null]], ["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
    display: "bar",
    // We are reversing the order of metrics via API
    visualization_settings: {
      "graph.metrics": ["count", "sum"],
      "graph.dimensions": ["CATEGORY"],
    },
  };

  function waitForDataset(page: import("@playwright/test").Page) {
    return page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
  }

  async function removeAggregationItem(
    page: import("@playwright/test").Page,
    item: string,
  ) {
    const dataset = waitForDataset(page);
    // Upstream is `.contains(item).siblings(".Icon-close")`. `cy.contains`
    // descends to the DEEPEST matching node — the inner
    // `<span class=AggregationName>` — whose sibling is the close Icon
    // (AggregationItem.tsx: both are children of the aggregation-item button).
    // So relative to the button itself the icon is a DESCENDANT, not a sibling.
    await page
      .getByTestId("aggregation-item")
      .filter({ hasText: new RegExp(item) })
      .first()
      .locator(".Icon-close")
      .click();
    await dataset;
  }

  async function addAggregationItem(
    page: import("@playwright/test").Page,
    item: string,
  ) {
    const dataset = waitForDataset(page);
    await page.getByTestId("add-aggregation-button").click();
    await popover(page).getByText(item, { exact: false }).first().click();
    await dataset;
  }

  /**
   * Port of the spec-local assertOnLegendItemFrequency.
   *
   * UPSTREAM WEAKNESS, ported verbatim: `cy.findAllByTestId("legend-item")
   * .contains(item)` yields exactly ONE element (cy.contains is a first-match
   * command), so `should("have.length", frequency)` can only ever pass for
   * frequency === 1 — it does not actually count duplicate legend items, which
   * is what the issue is about. Both call sites pass 1.
   */
  async function assertOnLegendItemFrequency(
    page: import("@playwright/test").Page,
    item: string,
    frequency: number,
  ) {
    await expect(
      page
        .getByTestId("legend-item")
        .filter({ hasText: new RegExp(item) })
        .first(),
    ).toHaveCount(frequency);
  }

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await summarize(page);
  });

  test("should not display duplicate Y-axis after modifying/reordering metrics (metabase#20548)", async ({
    page,
  }) => {
    await removeAggregationItem(page, "Count");
    // Ensure bars of only one series exist
    await expect(chartPathWithFillColor(page, "#88BF4D")).toHaveCount(4);
    await expect(chartPathWithFillColor(page, "#509EE3")).toHaveCount(0);

    await addAggregationItem(page, "Count");
    // Ensure bars of two series exist
    await expect(chartPathWithFillColor(page, "#88BF4D")).toHaveCount(4);
    await expect(chartPathWithFillColor(page, "#509EE3")).toHaveCount(4);

    // Although the test already fails on the previous step, let's add some more assertions to prevent future regressions
    await assertOnLegendItemFrequency(page, "Count", 1);
    await assertOnLegendItemFrequency(page, "Sum of Price", 1);

    await openVizSettingsSidebar(page);
    // H.sidebar() is cy.get("main aside").
    await expect(
      page.locator("main aside").locator('input[value="Count"]').first(),
    ).toBeVisible();
  });
});

test.describe("issue 21452", () => {
  const questionDetails = {
    dataset_query: {
      type: "query" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["cum-sum", ["field", ORDERS.QUANTITY, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      database: 1,
    },
    display: "line",
  };

  let datasetCount: { count: number };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // The "@dataset" alias H.visitQuestionAdhoc registers — the test's final
    // `cy.get("@dataset.all").should("have.length", 1)` counts every response
    // it saw, so the recorder must be installed before the visit.
    datasetCount = countResponses(
      page,
      ({ method, pathname }) =>
        method === "POST" && pathname === "/api/dataset",
    );

    await visitAdhoc(page, questionDetails);

    await openVizSettingsSidebar(page);
  });

  test("should not fire POST request after every character during display name change (metabase#21452)", async ({
    page,
  }) => {
    await openSeriesSettings(page, "Cumulative sum of Quantity");
    const nameInput = popover(page)
      .locator('input[value="Cumulative sum of Quantity"]')
      .first();
    await nameInput.click();
    await nameInput.fill("");
    await page.keyboard.type("Foo");

    await popover(page).getByText("Display type", { exact: true }).click();

    // Dismiss the popup and close settings
    await leftSidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    // trigger("mousemove") is more reliable than realHover
    // maybe related to https://github.com/dmtrKovalenko/cypress-real-events/issues/691
    await triggerMousemove(cartesianChartCircles(page).first());

    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        {
          color: "#88BF4D",
          name: "Foo",
          value: "3,236",
        },
      ],
    });

    expect(datasetCount.count).toBe(1);
  });
});

test.describe("issue 21504", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should format pie chart settings (metabase#21504)", async ({ page }) => {
    await visitAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pie",
    });

    await openVizSettingsSidebar(page);

    await expect(
      leftSidebar(page).getByText("January 2028", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 21665", () => {
  const Q1 = {
    name: "21665 Q1",
    native: { query: "select 1" },
    display: "scalar",
  };

  const Q2 = {
    name: "21665 Q2",
    native: { query: "select 2" },
    display: "scalar",
  };

  let questionId: number;
  let dashboardId: number;
  let dashboardLoaded: { count: number };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { dashboardId: dId, questionId: qId } =
      await createNativeQuestionAndDashboard(mb.api, {
        questionDetails: Q1,
        dashboardDetails: { name: "21665D" },
      });
    questionId = qId;
    dashboardId = dId;

    // The `cy.spy().as("dashboardLoaded")` intercept on
    // `/api/dashboard/${dashboardId}*`. The Cypress glob's `*` does not cross a
    // `/` (minimatch), so it matches the bare resource only — not
    // `/query_metadata` or `/dashcard/...`.
    dashboardLoaded = countResponses(
      page,
      ({ method, pathname }) =>
        method === "GET" && pathname === `/api/dashboard/${dashboardId}`,
    );

    await createNativeQuestion(mb.api, Q2);

    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);

    const card = getDashboardCard(page, 0);
    await card.hover();
    await card.getByLabel("Visualize another way").click();
    await switchToAddMoreData(page);
    await selectDataset(page, Q2.name);
    await modal(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();

    await saveDashboard(page);
  });

  test("multi-series cards shouldnt cause frontend to reload (metabase#21665)", async ({
    mb,
    page,
  }) => {
    // NB: upstream names this editQ2NativeQuery but hands it Q1's id (the
    // @questionId alias) — it is Q1 that gets the broken query. Ported as-is.
    await mb.api.put(`/api/card/${questionId}`, {
      dataset_query: {
        type: "native",
        native: { query: "select order by --" },
        database: 1,
      },
    });

    await visitDashboard(page, mb.api, dashboardId);

    // The dashboard loads twice: once on the initial visit, once on re-visit.
    await expect.poll(() => dashboardLoaded.count).toBe(2);
    await expect(
      page
        .getByTestId("dashcard")
        .getByText(
          "Some columns are missing, this card might not render correctly.",
          { exact: true },
        ),
    ).toBeVisible();
  });
});

test.describe("issue 22527", () => {
  // Upstream tags this describe `@skip`, so it never runs in CI either.
  // Ported faithfully as a skip rather than dropped.
  test.skip(true, "Tagged @skip upstream (metabase#22527)");

  const questionDetails = {
    native: {
      query:
        "select 1 x, 1 y, 20 size\nunion all  select 2 x, 10 y, 10 size\nunion all  select 3 x, -9 y, 6 size\nunion all  select 4 x, 100 y, 30 size\nunion all  select 5 x, -20 y, 70 size",
    },
    display: "scatter",
    visualization_settings: {
      "graph.dimensions": ["X"],
      "graph.metrics": ["Y"],
    },
  };

  async function assertion(page: import("@playwright/test").Page) {
    const circles = page.locator("circle");
    await expect(circles).toHaveCount(5);
    await circles.last().hover({ force: true });

    const scope = popover(page).first();
    await testPairedTooltipValues(scope, "X", "5");
    await testPairedTooltipValues(scope, "Y", "-20");
    await testPairedTooltipValues(scope, "SIZE", "70");
  }

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createNativeQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
  });

  test("should render negative values in a scatter visualziation (metabase#22527)", async ({
    page,
  }) => {
    await assertion(page);

    await openVizSettingsSidebar(page);
    await page
      .getByTestId("sidebar-left")
      .getByText("Data", { exact: true })
      .click();

    await page
      .getByText("Bubble size", { exact: true })
      .locator("xpath=..")
      .getByText("Select a field", { exact: false })
      .first()
      .click();

    await popover(page).getByText(/size/i).first().click();

    await assertion(page);
  });
});

test.describe("issue 25156", () => {
  const questionDetails = {
    name: "25156",
    query: {
      "source-table": REVIEWS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", REVIEWS.CREATED_AT, { "temporal-unit": "year" }],
        ["field", REVIEWS.RATING, null],
      ],
    },
    display: "bar",
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT", "RATING"],
      "graph.metrics": ["count"],
      "graph.x_axis.scale": "linear",
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should handle invalid x-axis scale (metabase#25156)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    // Upstream repeats "2026" — kept verbatim.
    for (const year of ["2025", "2026", "2026", "2027", "2028"]) {
      await expect(echartsContainer(page)).toContainText(year);
    }
  });
});

test.describe("issue 27279", () => {
  const questionDetails = {
    name: "27279",
    native: {
      query:
        "select -3 o, 'F2021' k, 1 v\nunion all select -2, 'V2021', 2\nunion all select -1, 'S2022', 3\nunion all select 0, 'F2022', 4",
      "template-tags": {},
    },
    visualization_settings: {
      "table.pivot_column": "O",
      "table.cell_column": "V",
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should reflect/apply sorting to the x-axis (metabase#27279)", async ({
    mb,
    page,
  }) => {
    const { id } = await createNativeQuestion(mb.api, questionDetails);

    await visitAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": `card__${id}`,
          aggregation: [["sum", ["field", "V", { "base-type": "type/Integer" }]]],
          breakout: [
            ["field", "K", { "base-type": "type/Text" }],
            ["field", "O", { "base-type": "type/Integer" }],
          ],
          "order-by": [["asc", ["field", "O", { "base-type": "type/Integer" }]]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["K", "O"],
        "graph.metrics": ["sum"],
      },
    });

    // compareValuesInOrder(cy.findAllByTestId("legend-item"), legendItems)
    const legendItems = ["-3", "-2", "-1", "0"];
    const legend = page.getByTestId("legend-item");
    await expect(legend).toHaveCount(legendItems.length);
    for (const [index, value] of legendItems.entries()) {
      await expect(legend.nth(index)).toHaveText(value);
    }

    // need to add a single space on either side of the text as it is used as padding
    // in ECharts
    //
    // UPSTREAM WEAKNESS, ported verbatim: the Cypress subject is
    // `H.echartsContainer().get("text").contains(/F2021|V2021|S2022|F2022/)`.
    // `cy.get()` RESETS the subject (so the echartsContainer scope is dead
    // code) and `.contains()` yields only the FIRST match, so the
    // compareValuesInOrder `.each` loop iterates over exactly ONE element and
    // compares it to xAxisTicks[0]. Only " F2021 " is ever asserted.
    const xAxisTicks = ["F2021", "V2021", "S2022", "F2022"].map(
      (str) => ` ${str} `,
    );
    const firstTick = page
      .locator("text")
      .filter({ hasText: /F2021|V2021|S2022|F2022/ })
      .first();
    expect(await firstTick.textContent()).toBe(xAxisTicks[0]);

    // Extra step, just to be overly cautious
    await chartPathWithFillColor(page, "#98D9D9")
      .first()
      .hover({ force: true });

    await assertEChartsTooltip(page, {
      header: "F2021",
      rows: [
        { color: "#98D9D9", name: "-3", value: "1" },
        { color: "#F2A86F", name: "-2", value: "(empty)" },
        { color: "#F9D45C", name: "-1", value: "(empty)" },
        { color: "#509EE3", name: "0", value: "(empty)" },
      ],
    });

    await chartPathWithFillColor(page, "#509EE3").first().hover({ force: true });
    await assertEChartsTooltip(page, {
      header: "F2022",
      rows: [
        { color: "#98D9D9", name: "-3", value: "(empty)" },
        { color: "#F2A86F", name: "-2", value: "(empty)" },
        { color: "#F9D45C", name: "-1", value: "(empty)" },
        { color: "#509EE3", name: "0", value: "4" },
      ],
    });
  });
});

// Test for issue 27427 (static-viz with unused returned column)
// has been moved to backend test in metabase.channel.render.card-test

const addCountGreaterThan2Filter = async (
  page: import("@playwright/test").Page,
) => {
  await openNotebook(page);
  await page
    .getByTestId("action-buttons")
    .last()
    .getByRole("button", { name: "Filter", exact: true })
    .click();
  await popover(page).getByText("Count", { exact: true }).click();
  await selectFilterOperator(page, "Greater than");
  const filterPopover = popover(page);
  const numberInput = filterPopover.getByPlaceholder("Enter a number");
  await numberInput.click();
  await page.keyboard.type("2");
  await filterPopover
    .getByRole("button", { name: "Add filter", exact: true })
    .click();
};

test.describe("issue 32075", () => {
  const testQuery = {
    type: "query" as const,
    query: {
      "source-query": {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PEOPLE.LATITUDE,
            { "base-type": "type/Float", binning: { strategy: "default" } },
          ],
          [
            "field",
            PEOPLE.LONGITUDE,
            { "base-type": "type/Float", binning: { strategy: "default" } },
          ],
        ],
      },
    },
    database: SAMPLE_DB_ID,
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should still display visualization as a map after adding a filter (metabase#32075)", async ({
    page,
  }) => {
    await visitAdhocNotebook(page, { dataset_query: testQuery });

    await visualize(page);
    await addCountGreaterThan2Filter(page);
    await visualize(page);

    await expect(tableInteractive(page)).toHaveCount(0);
    await expect(page.locator("[data-element-id=pin-map]")).toHaveCount(1);
  });

  test("should still display visualization as a map after adding another column to group by", async ({
    page,
  }) => {
    await visitAdhocNotebook(page, { dataset_query: testQuery });

    await visualize(page);
    await openNotebook(page);
    await addSummaryGroupingField(page, { field: "Birth Date" });
    await visualize(page);

    await expect(tableInteractive(page)).toHaveCount(0);
    await expect(page.locator("[data-element-id=pin-map]")).toHaveCount(1);
  });

  test("should still display visualization as a map after adding another aggregation", async ({
    page,
  }) => {
    await visitAdhocNotebook(page, { dataset_query: testQuery });

    await visualize(page);
    await openNotebook(page);
    await addSummaryField(page, { metric: "Average of ...", field: "Longitude" });
    await visualize(page);

    await expect(tableInteractive(page)).toHaveCount(0);
    await expect(page.locator("[data-element-id=pin-map]")).toHaveCount(1);
  });

  test("should change display to default after removing a column to group by when map is not sensible anymore", async ({
    page,
  }) => {
    await visitAdhocNotebook(page, { dataset_query: testQuery });

    await visualize(page);
    await openNotebook(page);
    await removeSummaryGroupingField(page, { field: "Latitude: Auto binned" });
    await visualize(page);

    await expect(page.locator("[data-element-id=pin-map]")).toHaveCount(0);
    await expect(echartsContainer(page)).toHaveCount(1);
  });
});

test.describe("issue 30058", () => {
  const testQuery = {
    type: "query" as const,
    query: {
      "source-query": {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PEOPLE.LATITUDE,
            { "base-type": "type/Float", binning: { strategy: "default" } },
          ],
          [
            "field",
            PEOPLE.LONGITUDE,
            { "base-type": "type/Float", binning: { strategy: "default" } },
          ],
        ],
      },
    },
    database: SAMPLE_DB_ID,
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not crash visualization after adding a filter (metabase#30058)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: testQuery,
      display: "map",
      displayIsLocked: true,
    });

    await addCountGreaterThan2Filter(page);
    await visualize(page);

    await expect(page.locator(".Icon-warning")).toHaveCount(0);
  });
});

test.describe("issue 33208", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const { id } = await createNativeQuestion(mb.api, {
      native: {
        query:
          "select distinct category from products where {{category}} order by category",
        "template-tags": {
          category: {
            type: "dimension",
            name: "category",
            id: "82e3e985-5bd8-4503-a628-15201bad321b",
            "display-name": "Category",
            required: true,
            default: ["Doohickey", "Gizmo"],
            dimension: ["field", PRODUCTS.CATEGORY, null],
            "widget-type": "string/=",
          },
        },
      },
      display: "scalar",
    });
    await visitQuestion(page, id);
  });

  test("should not auto-select chart type when opening a saved native question with parameters that have default values (metabase#33208)", async ({
    page,
  }) => {
    // The default value for the category parameter is ["Doohickey","Gizmo"], which means the query results should have two rows, meaning
    // scalar is not a sensible chart type. Normally the chart type would be automatically changed to table, but this shouldn't happen.
    await expect(page.getByTestId("scalar-value")).toBeVisible();
  });

  test("should not auto-select chart type when saving a native question with parameters that have default values", async ({
    page,
  }) => {
    await page
      .getByTestId("query-builder-main")
      .getByText("Open Editor", { exact: true })
      .click();
    await focusNativeEditor(page);
    await page.keyboard.type(" ");
    // NB: H.saveSavedQuestion() takes no parameters (e2e-misc-helpers.js:382),
    // so upstream's "top category" argument is silently discarded and the
    // question keeps its generated name. Ported faithfully.
    await saveSavedQuestion(page);
    // Upstream is `H.runNativeQuery({ wait: false })` — it clicks Run and waits
    // for NOTHING. The shared runNativeQuery() waits on POST /api/dataset,
    // which a SAVED native question never fires (it runs via
    // /api/card/:id/query — PORTING), so that wait can only time out. Port the
    // no-wait form; the scalar-value assertion below is the real gate.
    await icon(page.getByTestId("native-query-editor-container"), "play").click();
    await expect(page.getByTestId("scalar-value")).toBeVisible();
  });
});

test.describe("issue 43077", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not fire an invalid API request when clicking a legend item on a cartesian chart with multiple aggregations", async ({
    page,
  }) => {
    const cartesianQuestionDetails = {
      dataset_query: {
        type: "query" as const,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.QUANTITY, null]],
            ["sum", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        },
        database: 1,
      },
      display: "line",
    };
    // cy.intercept("/api/card/*", cardRequestSpy) — the glob's `*` does not
    // cross a `/`, so it matches `/api/card/<id>` but not `/api/card/<id>/query`.
    const cardRequests = countResponses(page, ({ pathname }) =>
      /^\/api\/card\/[^/]+$/.test(pathname),
    );

    await visitAdhoc(page, cartesianQuestionDetails);

    await page.getByTestId("legend-item").first().click();

    await page.waitForTimeout(100);
    expect(cardRequests.count).toBe(0);
  });

  test("should not fire an invalid API request when clicking a legend item on a row chart with multiple aggregations", async ({
    page,
  }) => {
    const rowQuestionDetails = {
      dataset_query: {
        type: "query" as const,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.QUANTITY, null]],
            ["sum", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        },
        database: 1,
      },
      display: "row",
    };
    const cardRequests = countResponses(page, ({ pathname }) =>
      /^\/api\/card\/[^/]+$/.test(pathname),
    );

    await visitAdhoc(page, rowQuestionDetails);

    await page.getByTestId("legend-item").first().click();

    await page.waitForTimeout(100);
    expect(cardRequests.count).toBe(0);
  });
});

test.describe("issue 49160", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("pie chart should have a placeholder", async ({ page }) => {
    await visitAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
        },
        database: SAMPLE_DB_ID,
      },
      display: "pie",
    });

    // Shows an empty state that can open the summarize sidebar
    await expect(
      page.getByAltText("pie chart example illustration"),
    ).toBeVisible();
    await page.getByLabel("Open summarize sidebar").click();

    await page.getByLabel("Rating").click();
    await expect(
      echartsContainer(page).getByText("200", { exact: true }),
    ).toBeVisible();
    await expect(
      echartsContainer(page).getByText("Total", { exact: true }),
    ).toBeVisible();
  });

  test("pie chart should work when instance colors have overrides", async ({
    mb,
    page,
  }) => {
    await mb.api.updateSetting("application-colors", {
      "accent0-light": "#98b4ce",
    });

    await visitAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pie",
    });

    await expect(
      echartsContainer(page).getByText("200", { exact: true }),
    ).toBeVisible();

    await openVizSettingsSidebar(page);

    await expect(
      leftSidebar(page).getByText("Gizmo", { exact: true }).first(),
    ).toBeVisible();
  });
});

test.describe("issue 54271", () => {
  const questionDetails = {
    query: {
      "source-table": REVIEWS_ID,
      aggregation: [["count"]],
      breakout: [["field", REVIEWS.REVIEWER, null]],
    },
    display: "line",
    visualization_settings: {
      "graph.dimensions": ["REVIEWER"],
      "graph.metrics": [["count"]],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not crash the app when rendering a line chart with broken viz settings and table metadata (metabase#54271)", async ({
    mb,
    page,
  }) => {
    // broken semantic type - the field cannot be parsed as a date
    await mb.api.put(`/api/field/${REVIEWS.REVIEWER}`, {
      semantic_type: "type/CreationDate",
    });

    // broken viz settings - dimensions cannot have a text column
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    // no clear expectations but the app should not crash
    await assertQueryBuilderRowCount(page, 1076);
  });
});

test.describe("issue 63671", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
        ],
        filter: [
          "between",
          ["field", PRODUCTS.CREATED_AT, null],
          "2028-01-01",
          "2028-12-31",
        ],
      },
      display: "bar",
    });
    await visitQuestion(page, id);
  });

  test("should not show an extra value on bar charts when there is only value on the x axis (metabase#63671)", async ({
    page,
  }) => {
    // Upstream is `findByText("2028").should("have.length", 1)`: the
    // `have.length` half is trivially true (findByText yields one element) —
    // the real assertion is findByText's own "exactly one match, or throw".
    await expect(
      page
        .getByTestId("query-visualization-root")
        .getByText("2028", { exact: true }),
    ).toHaveCount(1);
  });
});
