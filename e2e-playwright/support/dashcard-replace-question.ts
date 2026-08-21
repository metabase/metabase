/**
 * Helpers for the dashcard-replace-question spec port
 * (dashboard-cards/dashcard-replace-question.cy.spec.js).
 *
 * The spec exercises the dashboard-edit "Replace" action, which swaps the
 * underlying question/model on a dashcard through the entity picker while
 * preserving viz settings, size and parameter mappings.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import {
  mockHeadingDashboardCard,
  mockParameter,
  mockQuestionDashboardCard,
} from "./dashboard-parameters";
import { entityPickerModal } from "./notebook";
import { FIRST_COLLECTION_ID, SAMPLE_DATABASE } from "./sample-data";
import { modal, popover, visitDashboard } from "./ui";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

/** Port of ORDERS_COUNT_QUESTION_ID (cypress_sample_instance_data.js). */
export const ORDERS_COUNT_QUESTION_ID = Number(
  SAMPLE_INSTANCE_DATA.questions.find((q) => q.name === "Orders, Count")!.id,
);

/** USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js) — a fixed id. */
export const ALL_USERS_GROUP = 1;

// === fixture data (ports of the spec's module-level consts) ===

export const PARAMETER = {
  DATE: mockParameter({
    id: "1",
    name: "Created At",
    type: "date/all-options",
    sectionId: "date",
  }),
  CATEGORY: mockParameter({
    id: "2",
    name: "Category",
    type: "string/=",
  }),
  UNUSED: mockParameter({
    id: "3",
    name: "Not mapped to anything",
    type: "number/=",
    sectionId: "number",
  }),

  // Used to reproduce:
  // https://github.com/metabase/metabase/issues/36984
  DATE_2: mockParameter({
    id: "2",
    name: "Created At (2)",
    type: "date/range",
    sectionId: "date",
  }),
};

export const DASHBOARD_CREATE_INFO = {
  parameters: Object.values(PARAMETER),
};

// Question to be used as a reference for filters auto-wiring
export const MAPPED_QUESTION_CREATE_INFO = {
  name: "Question with mapped parameters",
  query: { "source-table": PRODUCTS_ID },
};

export const NEXT_QUESTION_CREATE_INFO = {
  name: "Next question",
  collection_id: FIRST_COLLECTION_ID,
  query: { "source-table": PRODUCTS_ID },
};

export function getDashboardCards(
  mappedQuestionId: number,
): Record<string, unknown>[] {
  const mappedQuestionDashcard = mockQuestionDashboardCard({
    id: 2,
    card_id: mappedQuestionId,
    parameter_mappings: [
      {
        parameter_id: PARAMETER.DATE.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CREATED_AT, null]],
      },
      {
        parameter_id: PARAMETER.DATE_2.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CREATED_AT, null]],
      },
      {
        parameter_id: PARAMETER.CATEGORY.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      },
    ],
    row: 1,
    size_x: 6,
    size_y: 4,
  });

  const targetDashcard = mockQuestionDashboardCard({
    id: 3,
    card_id: ORDERS_COUNT_QUESTION_ID,
    row: 1,
    col: 6,
    size_x: 6,
    size_y: 4,
  });

  return [
    mockHeadingDashboardCard({ id: 1, size_x: 24 }),
    mappedQuestionDashcard,
    targetDashcard,
  ];
}

// === UI helpers (ports of the spec's local functions) ===

/**
 * Port of visitDashboardAndEdit: visit the dashboard then enter edit mode.
 * The Cypress original chained "@dashboardId"; here the id is passed in.
 */
export async function visitDashboardAndEdit(
  page: Page,
  api: MetabaseApi,
  dashboardId: number,
) {
  await visitDashboard(page, api, dashboardId);
  await page.getByLabel("Edit dashboard").click();
}

/** Port of findHeadingDashcard: cy.findAllByTestId("dashcard").eq(0). */
export function findHeadingDashcard(page: Page): Locator {
  return page.getByTestId("dashcard").nth(0);
}

/** Port of findTargetDashcard: cy.findAllByTestId("dashcard").eq(2). */
export function findTargetDashcard(page: Page): Locator {
  return page.getByTestId("dashcard").nth(2);
}

/**
 * Port of replaceQuestion: hover the dashcard, click its "Replace" action,
 * pick a (collection then) question in the entity picker, and wait for the
 * card query that the replacement triggers. cy.wait("@cardQuery") →
 * waitForResponse registered before the triggering click.
 */
export async function replaceQuestion(
  dashcard: Locator,
  {
    nextQuestionName,
    collectionName,
  }: { nextQuestionName: string; collectionName?: string },
) {
  const page = dashcard.page();
  await dashcard.hover();
  // findByLabelText is exact in testing-library.
  await dashcard.getByLabel("Replace", { exact: true }).click();

  const cardQuery = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/.*\/query$/.test(new URL(response.url()).pathname),
  );

  const picker = entityPickerModal(page);
  if (collectionName) {
    await picker.getByText(collectionName, { exact: true }).click();
  }
  await picker.getByText(nextQuestionName, { exact: true }).click();

  await cardQuery;
}

/** Port of assertDashCardTitle: the legend-caption-title has exactly `title`. */
export async function assertDashCardTitle(scope: Locator, title: string) {
  await expect(scope.getByTestId("legend-caption-title")).toHaveText(title);
}

/**
 * Port of overwriteDashCardTitle: open the target dashcard's viz options and
 * rewrite the Title field. The modal Title control is a plain TextInput (not an
 * EditableText), so fill() marks it dirty; blur commits it.
 */
export async function overwriteDashCardTitle(page: Page, textTitle: string) {
  const target = findTargetDashcard(page);
  await target.hover();
  await target.getByLabel("Show visualization options", { exact: true }).click();

  const dialog = modal(page);
  const title = dialog.getByLabel("Title", { exact: true });
  await title.fill(textTitle);
  await title.blur();
  await dialog.getByRole("button", { name: "Done" }).click();
}

/** Port of filterPanel: cy.findByTestId("edit-dashboard-parameters-widget-container"). */
export function filterPanel(page: Page): Locator {
  return page.getByTestId("edit-dashboard-parameters-widget-container");
}

/**
 * Port of connectDashboardFilter: open the filter's mapping, connect it to the
 * dashcard's `columnName`, then click the filter pill again to close it.
 */
export async function connectDashboardFilter(
  dashcard: Locator,
  { filterName, columnName }: { filterName: string; columnName: string },
) {
  const page = dashcard.page();
  await filterPanel(page).getByText(filterName, { exact: true }).click();
  // cy.button(/Select/) — matches the "Select…" button by its text.
  await dashcard.getByRole("button", { name: /Select/ }).click();
  await popover(page).getByText(columnName, { exact: true }).click();
  await filterPanel(page).getByText(filterName, { exact: true }).click();
}

/**
 * Port of assertDashboardFilterMapping: open the filter's mapping and assert
 * the dashcard shows the expected connected column, then close it again.
 */
export async function assertDashboardFilterMapping(
  dashcard: Locator,
  { filterName, expectedColumName }: { filterName: string; expectedColumName: string },
) {
  const page = dashcard.page();
  await filterPanel(page).getByText(filterName, { exact: true }).click();
  await expect(
    dashcard.getByText(expectedColumName, { exact: true }),
  ).toBeVisible();
  await filterPanel(page).getByText(filterName, { exact: true }).click();
}

/**
 * Port of cy.updateCollectionGraph: GET the collection graph, shallow-merge the
 * requested group entries (Object.assign at the group-id level), and PUT it
 * back. Kept local to this spec (the shared copies live in click-behavior.ts /
 * interactive-embedding.ts, both spec-support modules).
 */
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
