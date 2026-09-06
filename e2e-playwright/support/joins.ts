/**
 * Helpers for the joins spec — ports of the join/summarize/filter `H` helpers
 * from e2e-notebook-helpers.ts, e2e-bi-basics-helpers.js, and the
 * notebook-mode branches of e2e-ad-hoc-question-helpers.js. Lives in its own
 * file so the shared support modules stay untouched.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { icon } from "./dashboard-cards";
import {
  entityPickerModal,
  getNotebookStep,
  miniPicker,
  queryBuilderMain,
} from "./notebook";
import { adhocQuestionHash } from "./permissions";
import { SAMPLE_DB_ID } from "./sample-data";
import { popover } from "./ui";

type AdhocQuestion = Parameters<typeof adhocQuestionHash>[0];

/**
 * Port of H.visitQuestionAdhoc's notebook-mode branch: no results render in
 * notebook mode, so the wait is for the sample database schema load rather
 * than a dataset response.
 */
export async function visitQuestionAdhocNotebook(
  page: Page,
  question: AdhocQuestion,
) {
  await page.goto(`/question/notebook#${adhocQuestionHash(question)}`);
  // The schema GET the Cypress helper waited on doesn't reliably fire here
  // (metadata can arrive via other endpoints); readiness signal is the data
  // step having rendered with its table picked.
  await expect(
    getNotebookStep(page, "data").getByTestId("data-step-cell"),
  ).toBeVisible();
}

/** Port of H.openTable({ mode: "notebook" }) (and openOrdersTable etc). */
export function openTableNotebook(page: Page, tableId: number) {
  return visitQuestionAdhocNotebook(page, {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: { "source-table": tableId },
      type: "query",
    },
  });
}

/** Port of H.join: click the "Join data" action button. */
export async function join(page: Page) {
  await page.getByRole("button", { name: "Join data", exact: true }).click();
}

/** Port of H.filter({ mode: "notebook" }). */
export async function filterNotebook(page: Page) {
  await initiateNotebookAction(page, "filter");
}

/** Port of H.summarize({ mode: "notebook" }). */
export async function summarizeNotebook(page: Page) {
  await initiateNotebookAction(page, "sum");
}

/** Port of H.addCustomColumn (always notebook mode). */
export async function addCustomColumn(page: Page) {
  await initiateNotebookAction(page, "add_data");
}

/** Notebook-mode branch of initiateAction (e2e-bi-basics-helpers.js). */
async function initiateNotebookAction(page: Page, iconName: string) {
  await page.getByTestId("action-buttons").locator(`.Icon-${iconName}`).click();
}

export function miniPickerBrowseAll(page: Page): Locator {
  return miniPicker(page).getByText("Browse all", { exact: true });
}

/**
 * Port of H.joinTable: pick a raw table in the join's mini picker, plus
 * optional LHS/RHS columns when the join condition can't be inferred.
 *
 * Expects a join popover to be open! The Cypress helper realTypes into the
 * picker's autofocused search input; here the input is clicked explicitly
 * before typing.
 */
export async function joinTable(
  page: Page,
  tableName: string,
  lhsColumnName?: string,
  rhsColumnName?: string,
) {
  const searchInput = page.getByPlaceholder("Search for tables and more...", {
    exact: true,
  });
  await searchInput.click();
  await page.keyboard.type(tableName);

  // A search fired during the post-restore reindex window returns empty and
  // the picker never re-queries on its own — retype to re-trigger it.
  const result = miniPicker(page).getByText(tableName, { exact: true });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await expect(result).toBeVisible({ timeout: 4000 });
      break;
    } catch {
      await searchInput.fill("");
      await page.keyboard.type(tableName);
    }
  }
  await result.click();

  if (lhsColumnName && rhsColumnName) {
    await popover(page).getByText(lhsColumnName, { exact: true }).click();
    await popover(page).getByText(rhsColumnName, { exact: true }).click();
  }
}

/**
 * Port of H.selectSavedQuestionsToJoin: pick a saved question as the data
 * source and join it with a second saved question. Depends on
 * startNewQuestion() having been called first.
 */
export async function selectSavedQuestionsToJoin(
  page: Page,
  firstQuestionName: string,
  secondQuestionName: string,
) {
  await miniPickerBrowseAll(page).click();
  await entityPickerModal(page)
    .getByText("Our analytics", { exact: true })
    .click();
  const joinedTableMetadata = page.waitForResponse(
    (response) =>
      /^\/api\/table\/[^/]+\/query_metadata$/.test(
        new URL(response.url()).pathname,
      ),
  );
  await entityPickerModal(page)
    .getByText(firstQuestionName, { exact: true })
    .click();
  await joinedTableMetadata;

  // join to the second question
  await icon(page, "join_left_outer").click();

  await miniPickerBrowseAll(page).click();
  await entityPickerModal(page)
    .getByText("Our analytics", { exact: true })
    .click();
  await entityPickerModal(page)
    .getByText(secondQuestionName, { exact: true })
    .click();
}

/** Port of H.selectFilterOperator. */
export async function selectFilterOperator(page: Page, operatorName: string) {
  await page.getByLabel("Filter operator", { exact: true }).click();
  await page
    .getByRole("menu")
    .getByText(operatorName, { exact: true })
    .click();
}

/** Port of H.addSummaryField (aggregation). */
export async function addSummaryField(
  page: Page,
  {
    metric,
    table,
    field,
    stage = 0,
    index = 0,
  }: {
    metric: string;
    table?: string;
    field?: string;
    stage?: number;
    index?: number;
  },
) {
  await getNotebookStep(page, "summarize", { stage, index })
    .getByTestId("aggregate-step")
    .getByTestId("notebook-cell-item")
    .last()
    .click();

  await popover(page).getByText(metric, { exact: true }).click();
  if (table) {
    await popover(page).getByText(table, { exact: true }).click();
  }
  if (field) {
    await popover(page).getByText(field, { exact: true }).click();
  }
}

/** Port of H.addSummaryGroupingField (breakout). */
export async function addSummaryGroupingField(
  page: Page,
  {
    table,
    field,
    stage = 0,
    index = 0,
  }: { table?: string; field: string; stage?: number; index?: number },
) {
  await getNotebookStep(page, "summarize", { stage, index })
    .getByTestId("breakout-step")
    .getByTestId("notebook-cell-item")
    .last()
    .click();

  if (table) {
    await popover(page).getByText(table, { exact: true }).click();
  }
  await popover(page).getByText(field, { exact: true }).click();
}

/**
 * Port of H.assertJoinValid: the visualized table must have columns from both
 * sides of the join. As in Cypress, lhsTable/rhsTable are accepted but only
 * the sample columns are asserted on.
 */
export async function assertJoinValid(
  page: Page,
  {
    lhsSampleColumn,
    rhsSampleColumn,
  }: {
    lhsTable?: string;
    rhsTable?: string;
    lhsSampleColumn: string;
    rhsSampleColumn: string;
  },
) {
  const scope = queryBuilderMain(page);
  await expect(tableHeaderColumnIn(scope, lhsSampleColumn)).toBeVisible();
  await expect(tableHeaderColumnIn(scope, rhsSampleColumn)).toBeVisible();
}

/** Locator-scoped variant of notebook.ts's tableHeaderColumn. */
function tableHeaderColumnIn(scope: Locator, name: string): Locator {
  return scope
    .getByTestId("header-cell")
    .filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
