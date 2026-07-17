/**
 * Helpers for the dashboard-parameters spec port (parameters.cy.spec.js):
 * ports of the parameter-editing H helpers no earlier port needed
 * (filterWidget with isEditing/name, the parameter sidebar controls,
 * setDashCardFilter, moveDashboardFilter, moveDashCardToTab, tab helpers),
 * request counters for the cy.spy() intercept patterns, plus local
 * stand-ins for the metabase-types mocks and the dashboard-creation API
 * helpers that accept dashboardDetails (parameters, embedding flags).
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { getDashboardCard, sidebar } from "./dashboard";
import { icon } from "./dashboard-cards";
import { undoToast } from "./metrics";
import { SAMPLE_DB_ID } from "./sample-data";
import { popover } from "./ui";

// === mock factories (local stand-ins for metabase-types/api/mocks) ===

export type MockParameter = {
  id: string;
  name: string;
  type: string;
  slug: string;
  sectionId?: string;
  default?: unknown;
};

/** Port of createMockParameter (metabase-types/api/mocks/parameters.ts). */
export function mockParameter(opts: Partial<MockParameter>): MockParameter {
  return { id: "1", name: "text", type: "string/=", slug: "text", ...opts };
}

type VirtualCard = {
  id: number;
  name: null;
  display: string;
  visualization_settings: Record<string, unknown>;
  dataset_query: Record<string, unknown>;
  archived: boolean;
};

/** Port of createMockVirtualCard — the UXW-751 test reads its `id`. */
export function mockVirtualCard(opts: { display: string }): VirtualCard {
  return {
    id: 1,
    name: null,
    display: opts.display,
    visualization_settings: {},
    dataset_query: {},
    archived: false,
  };
}

type VirtualDashCardOpts = {
  id?: number;
  dashboard_tab_id?: number;
  col?: number;
  row?: number;
  size_x?: number;
  size_y?: number;
  inline_parameters?: string[];
  parameter_mappings?: Record<string, unknown>[];
  card?: VirtualCard;
  visualization_settings?: Record<string, unknown>;
};

function mockVirtualDashCard(opts: VirtualDashCardOpts): Record<string, unknown> {
  const card = opts.card ?? mockVirtualCard({ display: "text" });
  return {
    id: 1,
    col: 0,
    row: 0,
    size_x: 1,
    size_y: 1,
    card_id: null,
    inline_parameters: null,
    parameter_mappings: [],
    ...opts,
    card,
    visualization_settings: {
      ...opts.visualization_settings,
      virtual_card: card,
    },
  };
}

/** Port of createMockHeadingDashboardCard. */
export function mockHeadingDashboardCard({
  text = "Heading Text",
  ...opts
}: VirtualDashCardOpts & { text?: string } = {}): Record<string, unknown> {
  return mockVirtualDashCard({
    ...opts,
    card: mockVirtualCard({ display: "heading" }),
    visualization_settings: { text },
  });
}

/** Port of createMockTextDashboardCard. */
export function mockTextDashboardCard({
  text = "Body Text",
  ...opts
}: VirtualDashCardOpts & { text?: string } = {}): Record<string, unknown> {
  return mockVirtualDashCard({
    ...opts,
    card: mockVirtualCard({ display: "text" }),
    visualization_settings: { text },
  });
}

/**
 * Port of createMockDashboardCard (question dashcards). The command-palette
 * port of the same mock only types the three keys its spec passes, so this
 * spec keeps its own variant with the full option surface it needs.
 */
export function mockQuestionDashboardCard(
  opts: {
    id?: number;
    card_id: number;
    dashboard_tab_id?: number;
    inline_parameters?: string[];
    parameter_mappings?: Record<string, unknown>[];
  } & Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: 1,
    dashboard_tab_id: null,
    col: 0,
    row: 0,
    size_x: 1,
    size_y: 1,
    visualization_settings: {},
    inline_parameters: null,
    parameter_mappings: [],
    ...opts,
  };
}

// === API helpers ===

export type DashboardDetails = {
  name?: string;
  auto_apply_filters?: boolean;
  enable_embedding?: boolean;
  embedding_type?: string;
  embedding_params?: Record<string, string>;
  dashcards?: Record<string, unknown>[];
} & Record<string, unknown>;

/**
 * Port of H.createDashboard (api/createDashboard.ts): plain details go in
 * the POST; the embedding/auto-apply flags the POST endpoint rejects go in
 * a follow-up PUT, exactly like the Cypress helper.
 */
export async function createDashboard(
  api: MetabaseApi,
  details: DashboardDetails = {},
): Promise<{ id: number }> {
  const {
    name = "Test Dashboard",
    auto_apply_filters,
    enable_embedding,
    embedding_type,
    embedding_params,
    dashcards,
    ...rest
  } = details;
  const response = await api.post("/api/dashboard", { name, ...rest });
  const dashboard = (await response.json()) as { id: number };
  if (
    enable_embedding != null ||
    auto_apply_filters != null ||
    Array.isArray(dashcards)
  ) {
    await api.put(`/api/dashboard/${dashboard.id}`, {
      auto_apply_filters,
      enable_embedding,
      embedding_type,
      embedding_params,
      dashcards,
    });
  }
  return dashboard;
}

/**
 * Port of H.createQuestionAndDashboard — unlike api.createQuestionAndDashboard
 * this passes dashboardDetails through (parameters, embedding flags).
 */
export async function createQuestionAndDashboard(
  api: MetabaseApi,
  {
    questionDetails,
    dashboardDetails,
    cardDetails,
  }: {
    questionDetails: Parameters<MetabaseApi["createQuestion"]>[0];
    dashboardDetails?: DashboardDetails;
    cardDetails?: Record<string, unknown>;
  },
): Promise<{ cardId: number; dashboardId: number; dashcardId: number }> {
  const { id: cardId } = await api.createQuestion(questionDetails);
  const { id: dashboardId } = await createDashboard(api, dashboardDetails);
  const response = await api.put(`/api/dashboard/${dashboardId}`, {
    dashcards: [
      {
        id: -1,
        card_id: cardId,
        row: 0,
        col: 0,
        size_x: 11,
        size_y: 6,
        ...cardDetails,
      },
    ],
  });
  const body = (await response.json()) as { dashcards: { id: number }[] };
  return { cardId, dashboardId, dashcardId: body.dashcards[0].id };
}

/** Port of H.createNativeQuestionAndDashboard, dashboardDetails included. */
export async function createNativeQuestionAndDashboard(
  api: MetabaseApi,
  {
    questionDetails,
    dashboardDetails,
  }: {
    questionDetails: {
      name?: string;
      native: { query: string; "template-tags"?: Record<string, unknown> };
      display?: string;
      database?: number;
    };
    dashboardDetails?: DashboardDetails;
  },
): Promise<{ cardId: number; dashboardId: number; dashcardId: number }> {
  const {
    name = "test question",
    native,
    display = "table",
    database = SAMPLE_DB_ID,
  } = questionDetails;
  const created = await api.post("/api/card", {
    name,
    display,
    visualization_settings: {},
    dataset_query: { type: "native", native, database },
  });
  const { id: cardId } = (await created.json()) as { id: number };
  const { id: dashboardId } = await createDashboard(api, dashboardDetails);
  const response = await api.put(`/api/dashboard/${dashboardId}`, {
    dashcards: [
      { id: -1, card_id: cardId, row: 0, col: 0, size_x: 11, size_y: 6 },
    ],
  });
  const body = (await response.json()) as { dashcards: { id: number }[] };
  return { cardId, dashboardId, dashcardId: body.dashcards[0].id };
}

/**
 * Port of H.createDashboardWithQuestions, reduced to the single-question
 * shape this spec uses.
 */
export async function createDashboardWithQuestions(
  api: MetabaseApi,
  {
    dashboardDetails,
    questions,
  }: {
    dashboardDetails?: DashboardDetails;
    questions: Parameters<MetabaseApi["createQuestion"]>[0][];
  },
): Promise<{ dashboard: { id: number }; questions: { id: number }[] }> {
  const dashboard = await createDashboard(api, dashboardDetails);
  const created: { id: number }[] = [];
  for (const questionDetails of questions) {
    created.push(await api.createQuestion(questionDetails));
  }
  await api.put(`/api/dashboard/${dashboard.id}`, {
    dashcards: created.map((question, index) => ({
      id: -1 - index,
      card_id: question.id,
      row: 0,
      col: 0,
      size_x: 11,
      size_y: 8,
      visualization_settings: {},
      parameter_mappings: [],
    })),
  });
  return { dashboard, questions: created };
}

// === filter widget lookups (ports of e2e-ui-elements-helpers.js) ===

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Port of H.filterWidget({ isEditing, name }). The name filter is Cypress
 * :contains — case-sensitive substring — hence the regex.
 */
export function filterWidget(
  scope: Page | Locator,
  { isEditing = false, name }: { isEditing?: boolean; name?: string } = {},
): Locator {
  const widgets = scope.getByTestId(
    isEditing ? "editing-parameter-widget" : "parameter-widget",
  );
  return name != null
    ? widgets.filter({ hasText: new RegExp(escapeRegExp(name)) })
    : widgets;
}

/** Port of H.clearFilterWidget (the close icon is hover-gated). */
export async function clearFilterWidget(scope: Page | Locator, index = 0) {
  const widget = filterWidget(scope).nth(index);
  await widget.hover();
  await icon(widget, "close").click();
}

/** Port of H.dashboardParametersContainer. */
export function dashboardParametersContainer(page: Page): Locator {
  return page.getByTestId("dashboard-parameters-widget-container");
}

/** Port of H.editingDashboardParametersContainer. */
export function editingDashboardParametersContainer(page: Page): Locator {
  return page.getByTestId("edit-dashboard-parameters-widget-container");
}

// === parameter sidebar (ports of e2e-dashboard-helpers.ts) ===

/** Port of H.dashboardParameterSidebar. */
export function dashboardParameterSidebar(page: Page): Locator {
  return page.getByTestId("dashboard-parameter-sidebar");
}

/** Port of H.applyFilterButton (the auto_apply_filters=false toast). */
export function applyFilterButton(page: Page): Locator {
  return page
    .getByTestId("filter-apply-toast")
    .getByRole("button", { name: "Apply" });
}

/** Port of H.setDashboardParameterName. */
export async function setDashboardParameterName(page: Page, name: string) {
  await dashboardParameterSidebar(page).getByLabel("Label").fill(name);
}

/** Port of H.setDashboardParameterType (findByText("...").next()). */
export async function setDashboardParameterType(page: Page, type: string) {
  await dashboardParameterSidebar(page)
    .locator(":text('Filter or parameter type') + *")
    .click();
  await popover(page).getByText(type, { exact: true }).click();
}

/** Port of H.setDashboardParameterOperator. */
export async function setDashboardParameterOperator(
  page: Page,
  operatorName: string,
) {
  await dashboardParameterSidebar(page)
    .locator(":text('Filter operator') + *")
    .click();
  await popover(page).getByText(operatorName, { exact: true }).click();
}

// === filter creation / wiring ===

/** Port of the shared _setFilter tail (popover type pick + sidebar tweaks). */
async function setFilterDetails(
  page: Page,
  type: string,
  subType?: string | null,
  name?: string,
) {
  await expect(
    popover(page).getByText("Add a filter or parameter"),
  ).toBeVisible();
  await popover(page).getByText(type, { exact: true }).click();

  if (subType) {
    await sidebar(page).locator(":text('Filter operator') + *").click();
    await page.getByRole("listbox").getByText(subType, { exact: true }).click();
  }

  if (name) {
    await sidebar(page).getByLabel("Label").fill(name);
  }
}

/** Port of H.setDashCardFilter (the Add a filter button is hover-gated). */
export async function setDashCardFilter(
  page: Page,
  dashcardIndex: number,
  type: string,
  subType?: string | null,
  name?: string,
) {
  const card = getDashboardCard(page, dashcardIndex);
  await card.hover();
  await card.getByLabel("Add a filter").click({ force: true });
  await setFilterDetails(page, type, subType, name);
}

/**
 * Port of H.selectDashboardFilter. Unlike the dashboard.ts port this keeps
 * Cypress's first-match semantics — the mapping popover repeats column
 * names across FK sections ("Created At" under Order/Product/User).
 */
export async function selectDashboardFilter(
  dashcard: Locator,
  filterName: string,
) {
  await dashcard.getByText("Select…").click();
  await popover(dashcard.page())
    .getByText(filterName, { exact: true })
    .first()
    .click({ force: true });
}

/** Port of H.disconnectDashboardFilter. */
export async function disconnectDashboardFilter(dashcard: Locator) {
  await dashcard.getByLabel("Disconnect").click();
}

/**
 * Port of H.moveDashboardFilter — the parameter sidebar must already be
 * open for the filter being moved.
 */
export async function moveDashboardFilter(
  page: Page,
  destination: string | RegExp,
  { showFilter = false }: { showFilter?: boolean } = {},
) {
  await dashboardParameterSidebar(page)
    .getByPlaceholder("Move filter")
    .click();
  await popover(page)
    .getByText(destination, { exact: typeof destination === "string" })
    .click();
  if (showFilter) {
    await undoToast(page).getByRole("button", { name: "Show filter" }).click();
  }
}

// === dashcard / tab editing (ports of e2e-dashboard-helpers.ts) ===

/** Port of H.addHeadingWhileEditing. */
export async function addHeadingWhileEditing(page: Page, text: string) {
  await page.getByLabel("Add a heading or text box").click();
  await popover(page).getByText("Heading", { exact: true }).click();
  await page
    .getByPlaceholder(
      "You can connect widgets to {{variables}} in heading cards.",
      { exact: true },
    )
    .fill(text);
}

/** Port of H.moveDashCardToTab (hover the card, hover the move icon). */
export async function moveDashCardToTab(
  page: Page,
  { dashcardIndex = 0, tabName }: { dashcardIndex?: number; tabName: string },
) {
  const card = getDashboardCard(page, dashcardIndex);
  await card.hover();
  await icon(card, "move_card").hover();
  await page.getByRole("menu").getByText(tabName, { exact: true }).click();
}

/** Port of H.goToTab. */
export async function goToTab(page: Page, tabName: string) {
  await page.getByRole("tab", { name: tabName, exact: true }).click();
}

/** Port of H.undo (click Undo inside the toast). */
export async function undo(page: Page) {
  await undoToast(page).getByText("Undo", { exact: true }).click();
}

// === request counters (ports of the cy.spy() intercept patterns) ===

export type RequestCounter = { count: () => number };

/**
 * Port of H.spyRequestFinished / cy.spy() interceptors: counts matching
 * requests from registration onwards.
 */
export function countRequests(
  page: Page,
  matches: (method: string, pathname: string) => boolean,
): RequestCounter {
  let count = 0;
  page.on("request", (request) => {
    if (matches(request.method(), new URL(request.url()).pathname)) {
      count += 1;
    }
  });
  return { count: () => count };
}

/** Matcher for POST /api/dashboard/:id/dashcard/:id/card/:id/query. */
export function isDashcardQueryRequest(
  method: string,
  pathname: string,
): boolean {
  return (
    method === "POST" &&
    /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/.test(pathname)
  );
}

/** Register a wait for the dashboard-save PUT so its payload can be read. */
export function waitForDashboardPut(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/dashboard\/\d+$/.test(new URL(response.url()).pathname),
  );
}

// === assertions ===

/** Port of the spec-local isFilterSelected (checkbox state by label). */
export async function expectFilterSelected(
  scope: Locator,
  filter: string,
  selected: boolean,
) {
  const checkbox = scope.getByLabel(filter, { exact: true });
  if (selected) {
    await expect(checkbox).toBeChecked();
  } else {
    await expect(checkbox).not.toBeChecked();
  }
}

/** Port of the isRenderedWithinViewport custom command. */
export async function expectRenderedWithinViewport(locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = locator.page().viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) {
    return;
  }
  expect(box.y).toBeGreaterThan(0);
  expect(box.y + box.height).toBeGreaterThan(0);
  expect(box.y).toBeLessThanOrEqual(viewport.height);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}
