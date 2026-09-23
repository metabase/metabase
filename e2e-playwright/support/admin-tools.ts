/**
 * Spec-local helpers for the admin-tools port
 * (e2e/test/scenarios/admin/tools/tools.cy.spec.ts).
 *
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9). Shared surface (modal/popover/icon, text matchers,
 * factories) is imported read-only.
 */
import type { Page } from "@playwright/test";
import dayjs from "dayjs";

import type { MetabaseApi } from "./api";
import { createNativeQuestion, type NativeQuestionDetails } from "./factories";
import { expect } from "./fixtures";
import { icon, modal, popover } from "./ui";

/** Loose Task shape — the FE tolerates arbitrary task_details JSON. */
export type MockTask = {
  id: number;
  db_id: number;
  duration: number;
  started_at: string;
  ended_at: string;
  task: string;
  task_details: unknown;
  status: string;
  logs: unknown;
  run_id: number | null;
  [key: string]: unknown;
};

/** Port of createMockTask (metabase-types/api/mocks/task.ts). */
export function createMockTask(task?: Partial<MockTask>): MockTask {
  return {
    id: 1,
    db_id: 1,
    duration: 100,
    started_at: "2023-03-04T01:45:26.005475-08:00",
    ended_at: "2023-03-04T01:45:26.518597-08:00",
    task: "A task",
    task_details: null,
    status: "success",
    logs: task?.logs ?? null,
    run_id: task?.run_id ?? null,
    ...task,
  };
}

/**
 * The FE formats downloaded-log timestamps with `dayjs(ts).format()`
 * (frontend/.../Logs/utils.ts `formatTs`). Mirror it so the downloaded-file
 * comparison is timezone-agnostic in the same way the Cypress spec's
 * formatTimestamp was.
 */
export function formatTimestamp(timestamp: string): string {
  return dayjs(timestamp).format();
}

// === task/task-run filter widgets (spec-local getters) ===

export function getFilterByRun(page: Page) {
  return page.getByPlaceholder("Filter by run type");
}

export function getFilterByStartedAt(page: Page) {
  return page.getByTestId("task-run-date-picker");
}

export function getFilterByEntity(page: Page) {
  return page.getByPlaceholder("Filter by entity");
}

export function getFilterByStatus(page: Page) {
  return page.getByPlaceholder("Filter by status");
}

/** Port of the spec-local selectStartedAt. */
export async function selectStartedAt(page: Page, label: string) {
  await getFilterByStartedAt(page).click();
  await popover(page).getByPlaceholder("Started at").click();
  await popover(page).getByRole("option", { name: label, exact: true }).click();
  await getFilterByStartedAt(page).click();
}

/**
 * Port of the spec-local assertFilterByEntityTooltipText. The Cypress version
 * used `.trigger("mouseenter", { force: true })` — a synthetic dispatch, since
 * the target is a disabled Select input whose pointer-events would otherwise
 * swallow a real hover (see MEMORY: disabled inputs eat headless hover). Mirror
 * that with dispatchEvent rather than a real hover.
 */
export async function assertFilterByEntityTooltipText(page: Page, text: string) {
  await getFilterByEntity(page).dispatchEvent("mouseenter");
  await expect(page.getByRole("tooltip")).toHaveText(text);
}

// === erroring-questions helpers ===

/**
 * Port of `H.createNativeQuestion(details, { loadMetadata: true })` for a
 * deliberately-broken question. loadMetadata visits the freshly-created card
 * and waits for its query — which for this question ERRORS, and that recorded
 * failure is exactly what makes it appear on the Erroring-questions tool.
 * visitQuestion (ui.ts) can't be reused: its query_metadata wait never
 * resolves for a card with no result_metadata, so wait on the card query
 * (any status) instead.
 */
export async function createErroringQuestion(
  page: Page,
  api: MetabaseApi,
  details: NativeQuestionDetails,
) {
  const card = await createNativeQuestion(api, details);
  const queryResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.match(
        new RegExp(`^/api/card/.*\\b${card.id}/query$`),
      ) !== null,
  );
  await page.goto(`/question/${card.id}`);
  await queryResponse;
  return card;
}

/** Port of the erroring-questions describe's fixQuestion. */
export async function fixQuestion(page: Page, name: string) {
  await page
    .getByTestId("visualization-root")
    .getByText(name, { exact: true })
    .click();

  await page.getByText("Open Editor", { exact: true }).click();

  await icon(page, "variable").click();
  await page.getByPlaceholder("Enter a default value…").fill("Foo");

  await page.getByText("Save", { exact: true }).click();

  await modal(page).getByRole("button", { name: "Save", exact: true }).click();
}

/** Port of the erroring-questions describe's selectQuestion. */
export async function selectQuestion(page: Page, name: string) {
  const checkbox = page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::tr[1]")
    .getByRole("checkbox");
  await checkbox.click();
  await expect(checkbox).toBeChecked();
}
