/**
 * Helpers for tests/click-behavior.spec.ts — ports of the spec-local helpers
 * in e2e/test/scenarios/dashboard-cards/click-behavior.cy.spec.js plus the
 * `H` helpers this spec needs that aren't in the spike yet:
 * - H.verifyNotebookQuery              (e2e-notebook-helpers.ts)
 * - H.onNextAnchorClick                (e2e-misc-helpers.js)
 * - H.dashboardParametersPopover, the virtual-card detail builders and
 *   createMockDashboardCard defaults   (e2e-dashboard-helpers.ts / api mocks)
 * - H.updateDashboardCards             (api/updateDashboardCards.ts)
 * - cy.updateCollectionGraph           (commands/permissions/updatePermissions.ts)
 * - H.createQuestionAndDashboard returning the dashcard (the spike's
 *   api.createQuestionAndDashboard only returns ids, and its literal types
 *   don't admit parameters/embedding fields on dashboardDetails)
 */
import { expect } from "@playwright/test";
import type { FrameLocator, Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import { editDashboard, getDashboardCard, saveDashboard } from "./dashboard";
import { icon } from "./dashboard-cards";
import { getNotebookStep } from "./notebook";
import { tableInteractiveBody } from "./question-new";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { popover } from "./ui";

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

// === constants from the Cypress spec ===

export const COUNT_COLUMN_ID = "count";
export const COUNT_COLUMN_NAME = "Count";
export const COUNT_COLUMN_SOURCE = {
  type: "column",
  id: COUNT_COLUMN_ID,
  name: COUNT_COLUMN_NAME,
};
export const CREATED_AT_COLUMN_ID = "CREATED_AT";
export const CREATED_AT_COLUMN_NAME = "Created At: Month";
export const CREATED_AT_COLUMN_SOURCE = {
  type: "column",
  id: CREATED_AT_COLUMN_ID,
  name: CREATED_AT_COLUMN_NAME,
};
export const FILTER_VALUE = "123";
export const POINT_COUNT = 64;
export const POINT_CREATED_AT = "2025-07";
export const POINT_CREATED_AT_FORMATTED = "July 2025";
export const POINT_INDEX = 3;
export const RESTRICTED_COLLECTION_NAME = "Restricted collection";
export const COLUMN_INDEX = {
  CREATED_AT: 0,
  COUNT: 1,
};

// these ids aren't real, but you have to provide unique ids 🙄
export const FIRST_TAB = { id: 900, name: "first" };
export const SECOND_TAB = { id: 901, name: "second" };
export const THIRD_TAB = { id: 902, name: "third" };

export const TARGET_DASHBOARD = {
  name: "Target dashboard",
};

export const QUESTION_LINE_CHART = {
  name: "Line chart",
  display: "line",
  query: {
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
    "source-table": ORDERS_ID,
    limit: 5,
  },
};

export const QUESTION_TABLE = {
  name: "Table",
  display: "table",
  query: QUESTION_LINE_CHART.query,
};

export const OBJECT_DETAIL_CHART = {
  display: "object",
  query: {
    "source-table": ORDERS_ID,
  },
};

export const TARGET_QUESTION = {
  ...QUESTION_LINE_CHART,
  name: "Target question",
};

/**
 * The Cypress spec builds these with createMockActionParameter, which only
 * adds a `type` default on top of the given fields — everything the backend
 * cares about is spelled out here.
 */
export const DASHBOARD_FILTER_TEXT = {
  id: "1",
  name: "Text filter",
  slug: "filter-text",
  type: "string/=",
  sectionId: "string",
};

export const DASHBOARD_FILTER_TIME = {
  id: "2",
  name: "Time filter",
  slug: "filter-time",
  type: "date/month-year",
  sectionId: "date",
};

export const DASHBOARD_FILTER_NUMBER = {
  id: "3",
  name: "Number filter",
  slug: "filter-number",
  type: "number/>=",
  sectionId: "number",
};

export const DASHBOARD_FILTER_TEXT_WITH_DEFAULT = {
  id: "4",
  name: "Text filter with default",
  slug: "filter-with-default",
  type: "string/=",
  sectionId: "string",
  default: "Hello",
};

// `URL` in the Cypress spec — renamed: it shadows the global URL constructor.
export const LINK_URL = "https://metabase.com/";
export const URL_WITH_PARAMS = `${LINK_URL}{{${DASHBOARD_FILTER_TEXT.slug}}}/{{${COUNT_COLUMN_ID}}}/{{${CREATED_AT_COLUMN_ID}}}`;
export const URL_WITH_FILLED_PARAMS = URL_WITH_PARAMS.replace(
  `{{${COUNT_COLUMN_ID}}}`,
  String(POINT_COUNT),
)
  .replace(`{{${CREATED_AT_COLUMN_ID}}}`, POINT_CREATED_AT)
  .replace(`{{${DASHBOARD_FILTER_TEXT.slug}}}`, FILTER_VALUE);

// === instance data the spike's sample-data.ts doesn't export ===

/** Port of NORMAL_USER_ID (cypress_sample_instance_data.js). */
export const NORMAL_USER_ID = (() => {
  const user = SAMPLE_INSTANCE_DATA.users.find(
    ({ email }) => email === "normal@metabase.test",
  );
  if (!user) {
    throw new Error("normal user not found in cypress_sample_instance_data");
  }
  return user.id;
})();

/**
 * Mirrors USER_GROUPS in e2e/support/cypress_data.js (fixed ids baked into
 * the default snapshot — the "collection" group is id 5 in the instance
 * data's groups list).
 */
export const USER_GROUPS = {
  COLLECTION_GROUP: 5,
} as const;

// === generic locators ===

/**
 * The click-behavior sidebar. Cypress used bare cy.get("aside"); the only
 * aside in a dashboard's edit mode lives inside <main> (H.sidebar() is
 * "main aside"), and scoping avoids matching any app-level aside.
 */
export function aside(page: Page): Locator {
  return page.locator("main aside");
}

/** Port of H.dashboardParametersPopover ({ testId: "parameter-value-dropdown" }). */
export function dashboardParametersPopover(page: Page): Locator {
  return page.getByTestId("parameter-value-dropdown");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-sensitive substring matcher (Cypress cy.contains semantics). */
export function caseSensitive(text: string): RegExp {
  return new RegExp(escapeRegExp(text));
}

/**
 * The filter widget whose label is exactly `label` — replaces the Cypress
 * `findAllByTestId("parameter-widget").contains(label).parent()` chain
 * ("Text filter" must not also match "Text filter with default").
 */
export function filterWidgetWithLabel(page: Page, label: string): Locator {
  return page
    .getByTestId("parameter-widget")
    .filter({ has: page.getByText(label, { exact: true }) });
}

/**
 * Port of the repeated `cy.findAllByTestId("parameter-widget")
 * .should("have.length", n).should("contain.text", ...)` chains — Cypress's
 * contain.text concatenates the collection's text, so each expected string
 * only needs to appear in SOME widget.
 */
export async function expectFilterWidgets(
  page: Page,
  count: number,
  ...texts: (string | number)[]
) {
  const widgets = page.getByTestId("parameter-widget");
  await expect(widgets).toHaveCount(count);
  for (const text of texts) {
    await expect(
      widgets.filter({ hasText: caseSensitive(String(text)) }).first(),
    ).toBeVisible();
  }
}

/**
 * Port of the retried `cy.location().should(...)` pathname/search checks —
 * one-shot URL assertions catch transient states (PORTING.md), so poll.
 */
export async function expectLocation(
  page: Page,
  { pathname, search }: { pathname: string; search: string },
) {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return { pathname: url.pathname, search: url.search };
    })
    .toEqual({ pathname, search });
}

// === chart interaction ===

/** Mirrors the dot path from e2e-visual-tests-helpers.js (H.cartesianChartCircle). */
const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";

/**
 * Port of the spec's clickLineChartPoint: click the page at the circle's
 * top-left corner (not the circle itself) so only the voronoi layer receives
 * the click — clicking the dot element hits both it and the voronoi path,
 * with non-deterministic click counts (see the upstream comment).
 */
export async function clickLineChartPoint(
  page: Page,
  scope: Page | FrameLocator = page,
) {
  const circle = scope
    .getByTestId("chart-container")
    .locator(`path[d="${CIRCLE_PATH}"]`)
    .nth(POINT_INDEX);
  await expect(circle).toBeVisible();
  const box = await circle.boundingBox();
  if (!box) {
    throw new Error("chart point has no bounding box");
  }
  await page.mouse.click(box.x, box.y);
}

export async function assertDrillThroughMenuOpen(page: Page) {
  const menu = popover(page);
  await expect(menu).toContainText("See these Orders");
  await expect(menu).toContainText("See this month by week");
  await expect(menu).toContainText("Break out by…");
  await expect(menu).toContainText("Automatic insights…");
  await expect(menu).toContainText("Filter by this value");
}

// === click-behavior sidebar interactions ===

/**
 * Port of H.pickEntity({ path: ["Our analytics", name] }) as used by
 * addDashboardDestination.
 */
async function pickFromOurAnalytics(page: Page, name: string) {
  const picker = page.getByTestId("nested-item-picker");
  await picker
    .getByTestId("item-picker-level-0")
    .getByText("Our analytics", { exact: true })
    .click();
  await picker
    .getByTestId("item-picker-level-1")
    .getByText(name, { exact: true })
    .click();
}

export async function addDashboardDestination(page: Page) {
  await aside(page)
    .getByText("Go to a custom destination", { exact: true })
    .click();
  await aside(page).getByText("Dashboard", { exact: true }).click();
  await pickFromOurAnalytics(page, TARGET_DASHBOARD.name);
}

export async function addUrlDestination(page: Page) {
  await aside(page)
    .getByText("Go to a custom destination", { exact: true })
    .click();
  await aside(page).getByText("URL", { exact: true }).click();
}

export async function addSavedQuestionDestination(page: Page) {
  await aside(page)
    .getByText("Go to a custom destination", { exact: true })
    .click();
  await aside(page).getByText("Saved question", { exact: true }).click();
  await page
    .getByTestId("entity-picker-modal")
    .getByText(TARGET_QUESTION.name, { exact: true })
    .click();
}

export async function addSavedQuestionCreatedAtParameter(page: Page) {
  await aside(page)
    .getByTestId("click-mappings")
    .getByText("Created At", { exact: true })
    .click();
  const dropdown = popover(page);
  await expect(
    dropdown.getByText(COUNT_COLUMN_NAME, { exact: true }),
  ).toHaveCount(0);
  await dropdown.getByText(CREATED_AT_COLUMN_NAME, { exact: true }).click();
}

export async function addSavedQuestionQuantityParameter(page: Page) {
  await aside(page)
    .getByTestId("click-mappings")
    .getByText("Quantity", { exact: true })
    .click();
  const dropdown = popover(page);
  await expect(
    dropdown.getByText(CREATED_AT_COLUMN_NAME, { exact: true }),
  ).toHaveCount(0);
  await dropdown.getByText(COUNT_COLUMN_NAME, { exact: true }).click();
}

export async function addTextParameter(page: Page) {
  await aside(page)
    .getByText(DASHBOARD_FILTER_TEXT.name, { exact: true })
    .click();
  const dropdown = popover(page);
  await expect(
    dropdown.getByText(CREATED_AT_COLUMN_NAME, { exact: true }),
  ).toBeVisible();
  await dropdown.getByText(COUNT_COLUMN_NAME, { exact: true }).click();
}

export async function addTextWithDefaultParameter(page: Page) {
  await aside(page)
    .getByText(DASHBOARD_FILTER_TEXT_WITH_DEFAULT.name, { exact: true })
    .click();
  const dropdown = popover(page);
  await expect(
    dropdown.getByText(CREATED_AT_COLUMN_NAME, { exact: true }),
  ).toBeVisible();
  await dropdown.getByText(COUNT_COLUMN_NAME, { exact: true }).click();
}

export async function addTimeParameter(page: Page) {
  await aside(page)
    .getByText(DASHBOARD_FILTER_TIME.name, { exact: true })
    .click();
  const dropdown = popover(page);
  await expect(
    dropdown.getByText(COUNT_COLUMN_NAME, { exact: true }),
  ).toHaveCount(0);
  await dropdown.getByText(CREATED_AT_COLUMN_NAME, { exact: true }).click();
}

export async function addNumericParameter(page: Page) {
  await aside(page)
    .getByText(DASHBOARD_FILTER_NUMBER.name, { exact: true })
    .click();
  const dropdown = popover(page);
  await expect(
    dropdown.getByText(CREATED_AT_COLUMN_NAME, { exact: true }),
  ).toBeVisible();
  await dropdown.getByText(COUNT_COLUMN_NAME, { exact: true }).click();
}

/** Port of the spec's customizeLinkText (the aside's only textbox). */
export async function customizeLinkText(page: Page, text: string) {
  await aside(page).getByRole("textbox").fill(text);
}

/** Port of getClickMapping: exact-text matches inside unset-click-mappings. */
export function getClickMapping(page: Page, columnName: string): Locator {
  return aside(page)
    .getByTestId("unset-click-mappings")
    .getByText(columnName, { exact: true });
}

export async function verifyAvailableClickTargetColumns(
  page: Page,
  columns: string[],
) {
  await expect(aside(page).getByTestId("click-target-column")).toHaveText(
    columns,
  );
}

// === mapping summaries (cy.contains → case-sensitive substring) ===

export function getCreatedAtToQuestionMapping(page: Page): Locator {
  return aside(page).getByText(
    caseSensitive(
      `${CREATED_AT_COLUMN_NAME} goes to "${TARGET_QUESTION.name}"`,
    ),
  );
}

export function getCountToDashboardMapping(page: Page): Locator {
  return aside(page).getByText(
    caseSensitive(`${COUNT_COLUMN_NAME} goes to "${TARGET_DASHBOARD.name}"`),
  );
}

export function getCreatedAtToUrlMapping(page: Page): Locator {
  return aside(page).getByText(
    caseSensitive(`${CREATED_AT_COLUMN_NAME} goes to URL`),
  );
}

export function getCountToDashboardFilterMapping(page: Page): Locator {
  return aside(page).getByText(
    caseSensitive(`${COUNT_COLUMN_NAME} updates 1 filter`),
  );
}

// === table helpers ===

/** Port of the spec's getTableCell: POINT_INDEX-th row, index-th cell. */
export function getTableCell(page: Page, index: number): Locator {
  return tableInteractiveBody(page)
    .getByRole("row")
    .nth(POINT_INDEX)
    .getByTestId("cell-data")
    .nth(index);
}

export async function testChangingBackToDefaultBehavior(page: Page) {
  await editDashboard(page);

  await getDashboardCard(page).hover();
  await icon(getDashboardCard(page), "click").click();
  await icon(aside(page), "close").first().click();
  await aside(page)
    .getByText("Open the Metabase drill-through menu", { exact: true })
    .click();
  await aside(page).getByRole("button", { name: "Done" }).click();

  await saveDashboard(page);

  await clickLineChartPoint(page);
  await assertDrillThroughMenuOpen(page);
}

export async function verifyVizTypeIsLine(page: Page) {
  await page.getByTestId("viz-type-button").click();
  await expect(
    page.getByTestId("sidebar-content").getByTestId("Line-container"),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("viz-type-button").click();
}

// === parameter mappings (pure data) ===

export const createTextFilterMapping = ({ card_id }: { card_id: number }) => {
  const fieldRef = [
    "field",
    PEOPLE.NAME,
    {
      "base-type": "type/Text",
      "source-field": ORDERS.USER_ID,
    },
  ];

  return {
    card_id,
    parameter_id: DASHBOARD_FILTER_TEXT.id,
    target: ["dimension", fieldRef],
  };
};

export const createTextFilterWithDefaultMapping = ({
  card_id,
}: {
  card_id: number;
}) => {
  const fieldRef = [
    "field",
    PEOPLE.NAME,
    {
      "base-type": "type/Text",
      "source-field": ORDERS.USER_ID,
    },
  ];

  return {
    card_id,
    parameter_id: DASHBOARD_FILTER_TEXT_WITH_DEFAULT.id,
    target: ["dimension", fieldRef],
  };
};

export const createTimeFilterMapping = ({ card_id }: { card_id: number }) => {
  const fieldRef = [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime" },
  ];

  return {
    card_id,
    parameter_id: DASHBOARD_FILTER_TIME.id,
    target: ["dimension", fieldRef],
  };
};

export const createNumberFilterMapping = ({ card_id }: { card_id: number }) => {
  const fieldRef = ["field", ORDERS.QUANTITY, { "base-type": "type/Number" }];

  return {
    card_id,
    parameter_id: DASHBOARD_FILTER_NUMBER.id,
    target: ["dimension", fieldRef],
  };
};

// === dashcard builders (ports of createMockDashboardCard + the virtual-card
// detail builders from e2e-dashboard-helpers.ts, reduced to the fields the
// PUT /api/dashboard payload cares about) ===

export function createMockDashboardCard(
  opts: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 1,
    dashboard_tab_id: null,
    col: 0,
    row: 0,
    card_id: 1,
    size_x: 1,
    size_y: 1,
    visualization_settings: {},
    parameter_mappings: [],
    ...opts,
  };
}

const getNextUnsavedDashboardCardId = (() => {
  let id = 0;
  return () => --id;
})();

function virtualCard(display: string) {
  return {
    name: null,
    display,
    visualization_settings: {},
    dataset_query: {},
    archived: false,
  };
}

export function getTextCardDetails({
  size_y = 6,
  text = "Text card",
}: { size_y?: number; text?: string } = {}) {
  return {
    id: getNextUnsavedDashboardCardId(),
    card_id: null,
    col: 0,
    row: 0,
    size_x: 4,
    size_y,
    visualization_settings: {
      virtual_card: virtualCard("text"),
      text,
    },
  };
}

export function getHeadingCardDetails({
  text = "Heading text details",
}: { text?: string } = {}) {
  return {
    id: getNextUnsavedDashboardCardId(),
    card_id: null,
    col: 0,
    row: 0,
    size_x: 24,
    size_y: 1,
    visualization_settings: {
      virtual_card: virtualCard("heading"),
      "dashcard.background": false,
      text,
    },
  };
}

export function getActionCardDetails() {
  return {
    id: getNextUnsavedDashboardCardId(),
    action_id: undefined,
    card_id: null,
    col: 0,
    row: 0,
    size_x: 4,
    size_y: 1,
    series: [],
    parameter_mappings: undefined,
    visualization_settings: {
      actionDisplayType: "button",
      virtual_card: virtualCard("action"),
      "button.label": undefined,
    },
  };
}

export function getLinkCardDetails({ url = "https://metabase.com" } = {}) {
  return {
    id: getNextUnsavedDashboardCardId(),
    card_id: null,
    col: 0,
    row: 0,
    size_x: 4,
    size_y: 1,
    visualization_settings: {
      virtual_card: virtualCard("link"),
      link: { url },
    },
    parameter_mappings: [],
  };
}

// === API helpers ===

/**
 * Port of H.updateDashboardCards: replaces all the dashboard's cards with
 * the given array (missing ids filled with fresh negative ones).
 */
export async function updateDashboardCards(
  api: MetabaseApi,
  {
    dashboard_id,
    cards,
  }: { dashboard_id: number; cards: Record<string, unknown>[] },
) {
  let id = -1;
  const defaults = () => ({
    id: id--,
    row: 0,
    col: 0,
    size_x: 11,
    size_y: 8,
    visualization_settings: {},
    parameter_mappings: [],
  });
  await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: cards.map((card) => ({ ...defaults(), ...card })),
  });
}

/** Port of cy.updateCollectionGraph: GET the graph, merge, PUT it back. */
export async function updateCollectionGraph(
  api: MetabaseApi,
  groupsCollectionObject: Record<string, Record<string, string>>,
) {
  const response = await api.get("/api/collection/graph");
  const { groups, revision } = (await response.json()) as {
    groups: Record<string, Record<string, string>>;
    revision: number;
  };
  await api.put("/api/collection/graph", {
    groups: { ...groups, ...groupsCollectionObject },
    revision,
  });
}

type QuestionDetails = {
  name?: string;
  display?: string;
  database?: number;
  query?: Record<string, unknown>;
  native?: Record<string, unknown>;
} & Record<string, unknown>;

/**
 * Port of H.createQuestion for arbitrary details (collection_id,
 * enable_embedding, embedding_params). Like upstream, POST /api/card ignores
 * enable_embedding, so a follow-up PUT applies the embedding fields.
 */
export async function createQuestion(
  api: MetabaseApi,
  details: QuestionDetails,
): Promise<{ id: number }> {
  const {
    name = "test question",
    display = "table",
    database = SAMPLE_DB_ID,
    query,
    native,
    enable_embedding,
    embedding_params,
    ...rest
  } = details;
  const dataset_query = native
    ? { type: "native", native, database }
    : { type: "query", query, database };
  const response = await api.post("/api/card", {
    name,
    display,
    visualization_settings: {},
    ...rest,
    dataset_query,
  });
  const card = (await response.json()) as { id: number };
  if (enable_embedding) {
    await api.put(`/api/card/${card.id}`, {
      enable_embedding,
      embedding_params,
    });
  }
  return card;
}

export type DashcardResult = {
  /** The dashcard id. */
  id: number;
  card_id: number;
  dashboard_id: number;
};

/**
 * Port of H.createQuestionAndDashboard — unlike the spike's
 * api.createQuestionAndDashboard it returns the created dashcard (tests need
 * its id) and accepts arbitrary dashboardDetails (parameters, embedding).
 */
export async function createQuestionAndDashboard(
  api: MetabaseApi,
  {
    questionDetails,
    dashboardDetails,
    cardDetails,
  }: {
    questionDetails: QuestionDetails;
    dashboardDetails?: Record<string, unknown>;
    cardDetails?: Record<string, unknown>;
  },
): Promise<DashcardResult> {
  const { id: card_id } = await createQuestion(api, questionDetails);
  const { id: dashboard_id } = await createDashboard(api, dashboardDetails);
  const response = await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
        id: -1,
        card_id,
        row: 0,
        col: 0,
        size_x: 11,
        size_y: 6,
        ...cardDetails,
      },
    ],
  });
  const body = (await response.json()) as { dashcards: { id: number }[] };
  return { id: body.dashcards[0].id, card_id, dashboard_id };
}

/** Port of H.createDashboard accepting arbitrary details. */
export async function createDashboard(
  api: MetabaseApi,
  details: Record<string, unknown> = {},
): Promise<{ id: number }> {
  const response = await api.post("/api/dashboard", {
    name: "Test Dashboard",
    ...details,
  });
  return (await response.json()) as { id: number };
}

export type DashboardWithTabs = {
  id: number;
  tabs: { id: number; name: string }[];
};

/**
 * Port of the spec's createDashboardWithTabsLocal (also covers the one
 * H.createDashboardWithTabs call site): create the dashboard, then PUT it
 * back with the dashcards and tabs attached. Returns the saved dashboard so
 * callers can build tab-slug maps from the real tab ids.
 */
export async function createDashboardWithTabsLocal(
  api: MetabaseApi,
  {
    dashboard = {},
    tabs,
    dashcards = [],
  }: {
    dashboard?: Record<string, unknown>;
    tabs: { id: number; name: string }[];
    dashcards?: Record<string, unknown>[];
  },
): Promise<DashboardWithTabs> {
  const created = await createDashboard(api, dashboard);
  const detailsResponse = await api.get(`/api/dashboard/${created.id}`);
  const details = (await detailsResponse.json()) as Record<string, unknown>;
  const updated = await api.put(`/api/dashboard/${created.id}`, {
    ...details,
    dashcards,
    tabs,
  });
  return (await updated.json()) as DashboardWithTabs;
}

/** Build the `${tabId}-${tabName}` slug map keyed by tab name. */
export function tabSlugMap(
  dashboard: DashboardWithTabs,
): Record<string, string> {
  return Object.fromEntries(
    dashboard.tabs.map((tab) => [tab.name, `${tab.id}-${tab.name}`]),
  );
}

// === anchor-click capture (port of H.onNextAnchorClick) ===

type CapturedAnchor = {
  href: string | null;
  rel: string | null;
  target: string | null;
};

type AnchorCaptureWindow = Window & {
  __capturedAnchor?: CapturedAnchor | null;
};

/**
 * Port of H.onNextAnchorClick: the frontend opens external URLs by creating
 * a dynamic anchor and calling .click() on it (see metabase/lib/dom.js), so
 * patching HTMLAnchorElement.prototype.click both captures the attributes
 * and prevents the navigation — same as the Cypress helper.
 */
export async function captureNextAnchorClick(page: Page) {
  await page.evaluate(() => {
    const win = window as AnchorCaptureWindow;
    win.__capturedAnchor = null;
    const originalClick = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function (
      this: HTMLAnchorElement,
    ) {
      win.__capturedAnchor = {
        href: this.getAttribute("href"),
        rel: this.getAttribute("rel"),
        target: this.getAttribute("target"),
      };
      window.HTMLAnchorElement.prototype.click = originalClick;
    };
  });
}

export async function expectCapturedAnchor(
  page: Page,
  expected: CapturedAnchor,
) {
  await expect
    .poll(() =>
      page.evaluate(() => (window as AnchorCaptureWindow).__capturedAnchor),
    )
    .toEqual(expected);
}

// === port of H.verifyNotebookQuery (e2e-notebook-helpers.ts) ===

type JoinType = "left-join" | "right-join" | "inner-join" | "full-join";

export type NotebookStage = {
  joins?: {
    lhsTable: string;
    rhsTable: string;
    type: JoinType;
    conditions: {
      operator: "=" | ">" | "<" | ">=" | "<=" | "!=";
      lhsColumn: string;
      rhsColumn: string;
    }[];
  }[];
  expressions?: string[];
  filters?: string[];
  aggregations?: string[];
  breakouts?: string[];
  sort?: { column: string; order: "asc" | "desc" }[];
  limit?: number;
};

export async function verifyNotebookQuery(
  page: Page,
  dataSource: string,
  stages: NotebookStage[] = [],
) {
  await expect(
    getNotebookStep(page, "data").getByText(dataSource, { exact: true }),
  ).toBeVisible();

  for (let stageIndex = 0; stageIndex < stages.length; ++stageIndex) {
    const stage = stages[stageIndex];
    await verifyNotebookJoins(page, stageIndex, stage.joins);
    await verifyNotebookExpressions(page, stageIndex, stage.expressions);
    await verifyNotebookFilters(page, stageIndex, stage.filters);
    await verifyNotebookAggregations(
      page,
      stageIndex,
      stage.aggregations,
      stage.breakouts,
    );
    await verifyNotebookBreakouts(
      page,
      stageIndex,
      stage.aggregations,
      stage.breakouts,
    );
    await verifyNotebookSort(page, stageIndex, stage.sort);
    await verifyNotebookLimit(page, stageIndex, stage.limit);
  }
}

function getJoinItems(page: Page, stage: number, index: number): Locator {
  return getNotebookStep(page, "join", { stage, index }).getByTestId(
    "notebook-cell-item",
  );
}

function getExpressionItems(page: Page, stage: number): Locator {
  return getNotebookStep(page, "expression", { stage }).getByTestId(
    "notebook-cell-item",
  );
}

function getFilterItems(page: Page, stage: number): Locator {
  return getNotebookStep(page, "filter", { stage }).getByTestId(
    "notebook-cell-item",
  );
}

function getSummarizeItems(
  page: Page,
  stage: number,
  stepType: "aggregate" | "breakout",
): Locator {
  return getNotebookStep(page, "summarize", { stage })
    .getByTestId(stepType === "aggregate" ? "aggregate-step" : "breakout-step")
    .getByTestId("notebook-cell-item");
}

function getSortItems(page: Page, stage: number): Locator {
  return getNotebookStep(page, "sort", { stage }).getByTestId(
    "notebook-cell-item",
  );
}

async function verifyNotebookJoins(
  page: Page,
  stageIndex: number,
  joins: NotebookStage["joins"],
) {
  const joinTypeIcons: Record<JoinType, string> = {
    "left-join": "join_left_outer",
    "right-join": "join_right_outer",
    "inner-join": "join_inner",
    "full-join": "join_full_outer",
  };

  if (!Array.isArray(joins)) {
    await expect(
      getNotebookStep(page, "join", { stage: stageIndex }),
    ).toHaveCount(0);
    return;
  }

  await expect(
    page.getByTestId(new RegExp(`^step-join-${stageIndex}-\\d+$`)),
  ).toHaveCount(joins.length);

  for (let joinIndex = 0; joinIndex < joins.length; ++joinIndex) {
    const { lhsTable, rhsTable, type, conditions } = joins[joinIndex];
    const step = getNotebookStep(page, "join", {
      stage: stageIndex,
      index: joinIndex,
    });

    await expect(getJoinItems(page, stageIndex, joinIndex).nth(0)).toHaveText(
      lhsTable,
    );
    await expect(getJoinItems(page, stageIndex, joinIndex).nth(1)).toHaveText(
      rhsTable,
    );
    await expect(icon(step, joinTypeIcons[type])).toBeVisible();
    await expect(step.getByTestId(/^join-condition-\d+$/)).toHaveCount(
      conditions.length,
    );

    for (
      let conditionIndex = 0;
      conditionIndex < conditions.length;
      ++conditionIndex
    ) {
      const { operator, lhsColumn, rhsColumn } = conditions[conditionIndex];
      const condition = step.getByTestId(`join-condition-${conditionIndex}`);

      const lhs = condition.getByLabel("Left column", { exact: true });
      await expect(lhs).toContainText(lhsTable);
      await expect(lhs).toContainText(lhsColumn);

      const rhs = condition.getByLabel("Right column", { exact: true });
      await expect(rhs).toContainText(rhsTable);
      await expect(rhs).toContainText(rhsColumn);

      await expect(
        condition.getByLabel("Change operator", { exact: true }),
      ).toHaveText(operator);
    }
  }
}

async function verifyNotebookExpressions(
  page: Page,
  stageIndex: number,
  expressions: string[] | undefined,
) {
  if (!Array.isArray(expressions)) {
    await expect(
      getNotebookStep(page, "expression", { stage: stageIndex }),
    ).toHaveCount(0);
    return;
  }

  // +1 because of the add button
  await expect(getExpressionItems(page, stageIndex)).toHaveCount(
    expressions.length + 1,
  );
  for (let index = 0; index < expressions.length; ++index) {
    await expect(getExpressionItems(page, stageIndex).nth(index)).toHaveText(
      expressions[index],
    );
  }
}

async function verifyNotebookFilters(
  page: Page,
  stageIndex: number,
  filters: string[] | undefined,
) {
  if (!Array.isArray(filters)) {
    await expect(
      getNotebookStep(page, "filter", { stage: stageIndex }),
    ).toHaveCount(0);
    return;
  }

  await expect(getFilterItems(page, stageIndex)).toHaveCount(
    filters.length + 1,
  );
  for (let index = 0; index < filters.length; ++index) {
    await expect(getFilterItems(page, stageIndex).nth(index)).toHaveText(
      filters[index],
    );
  }
}

async function verifyNotebookAggregations(
  page: Page,
  stageIndex: number,
  aggregations: string[] | undefined,
  breakouts: string[] | undefined,
) {
  if (!Array.isArray(aggregations)) {
    if (Array.isArray(breakouts)) {
      await expect(getSummarizeItems(page, stageIndex, "aggregate")).toHaveCount(
        1,
      );
    } else {
      await expect(
        getNotebookStep(page, "summarize", { stage: stageIndex }),
      ).toHaveCount(0);
    }
    return;
  }

  await getNotebookStep(page, "summarize", {
    stage: stageIndex,
  }).scrollIntoViewIfNeeded();
  await expect(getSummarizeItems(page, stageIndex, "aggregate")).toHaveCount(
    aggregations.length + 1,
  );
  for (let index = 0; index < aggregations.length; ++index) {
    await expect(
      getSummarizeItems(page, stageIndex, "aggregate").nth(index),
    ).toHaveText(aggregations[index]);
  }
}

async function verifyNotebookBreakouts(
  page: Page,
  stageIndex: number,
  aggregations: string[] | undefined,
  breakouts: string[] | undefined,
) {
  if (!Array.isArray(breakouts)) {
    if (Array.isArray(aggregations)) {
      await expect(getSummarizeItems(page, stageIndex, "breakout")).toHaveCount(
        1,
      );
    } else {
      await expect(
        getNotebookStep(page, "summarize", { stage: stageIndex }),
      ).toHaveCount(0);
    }
    return;
  }

  await expect(getSummarizeItems(page, stageIndex, "breakout")).toHaveCount(
    breakouts.length + 1,
  );
  for (let index = 0; index < breakouts.length; ++index) {
    await expect(
      getSummarizeItems(page, stageIndex, "breakout").nth(index),
    ).toHaveText(breakouts[index]);
  }
}

async function verifyNotebookSort(
  page: Page,
  stageIndex: number,
  sort: NotebookStage["sort"],
) {
  if (!Array.isArray(sort)) {
    await expect(
      getNotebookStep(page, "sort", { stage: stageIndex }),
    ).toHaveCount(0);
    return;
  }

  await expect(getSortItems(page, stageIndex)).toHaveCount(sort.length + 1);
  for (let index = 0; index < sort.length; ++index) {
    const { column, order } = sort[index];
    const item = getSortItems(page, stageIndex).nth(index);
    await expect(item).toHaveText(column);
    await expect(
      icon(item, order === "asc" ? "arrow_up" : "arrow_down"),
    ).toBeVisible();
  }
}

async function verifyNotebookLimit(
  page: Page,
  stageIndex: number,
  limit: number | undefined,
) {
  if (typeof limit !== "number") {
    await expect(
      getNotebookStep(page, "limit", { stage: stageIndex }),
    ).toHaveCount(0);
    return;
  }

  await expect(
    getNotebookStep(page, "limit", { stage: stageIndex }).getByPlaceholder(
      "Enter a limit",
    ),
  ).toHaveValue(String(limit));
}

// === multi-stage query fixture (verbatim from the Cypress spec) ===

export function createMultiStageQuery(): Record<string, unknown> {
  return {
    "source-query": {
      "source-table": ORDERS_ID,
      joins: [
        {
          strategy: "left-join",
          alias: "Reviews - Product",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
            [
              "field",
              "PRODUCT_ID",
              {
                "base-type": "type/Integer",
                "join-alias": "Reviews - Product",
              },
            ],
          ],
          "source-table": REVIEWS_ID,
        },
      ],
      expressions: {
        Net: [
          "-",
          ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
          ["field", ORDERS.TAX, { "base-type": "type/Float" }],
        ],
      },
      aggregation: [
        ["count"],
        ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
      ],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
        [
          "field",
          PRODUCTS.CATEGORY,
          { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
        ],
        [
          "field",
          PEOPLE.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "year",
            "source-field": ORDERS.USER_ID,
            "original-temporal-unit": "month",
          },
        ],
      ],
    },
    joins: [
      {
        strategy: "left-join",
        alias: "Reviews - Created At: Month",
        condition: [
          "=",
          [
            "field",
            "CREATED_AT",
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
              "original-temporal-unit": "month",
            },
          ],
          [
            "field",
            REVIEWS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
              "join-alias": "Reviews - Created At: Month",
              "original-temporal-unit": "month",
            },
          ],
        ],
        "source-table": REVIEWS_ID,
      },
    ],
    expressions: {
      "5 * Count": [
        "*",
        5,
        ["field", "count", { "base-type": "type/Integer" }],
      ],
    },
    aggregation: [
      ["count"],
      [
        "sum",
        [
          "field",
          REVIEWS.RATING,
          {
            "base-type": "type/Integer",
            "join-alias": "Reviews - Created At: Month",
          },
        ],
      ],
    ],
    breakout: [
      ["field", "PRODUCTS__via__PRODUCT_ID__CATEGORY", { "base-type": "type/Text" }],
      [
        "field",
        REVIEWS.CREATED_AT,
        { "base-type": "type/Text", "join-alias": "Reviews - Created At: Month" },
      ],
    ],
  };
}
