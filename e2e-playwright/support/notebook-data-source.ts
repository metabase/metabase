/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/question/notebook-data-source.cy.spec.ts.
 *
 * Lives in its own module so the shared support files stay untouched
 * (PORTING.md rule 9). Everything else the port needs is imported read-only
 * from the existing shared modules.
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import { pickEntity } from "./entity-picker";
import { entityPickerModal } from "./notebook";
import { openQuestionActions } from "./models";
import { entityPickerModalItem } from "./question-new";
import { popover } from "./ui";

export const QA_DB_SKIP_REASON =
  "Requires the QA Postgres containers and their postgres-12 / postgres-writable snapshots (set PW_QA_DB_ENABLED)";

export const TOKEN_SKIP_REASON =
  "Requires the pro-self-hosted token (library / published tables are EE-only)";

/** Ports of cypress_sample_instance_data.js lookups. */
export const ORDERS_MODEL_ID = findQuestionId("Orders Model");
export const ORDERS_COUNT_QUESTION_ID = findQuestionId("Orders, Count");
export const SECOND_COLLECTION_ID = findCollectionId("Second collection");

function findQuestionId(name: string): number {
  const question = SAMPLE_INSTANCE_DATA.questions.find(
    (question) => question.name === name,
  );
  if (!question) {
    throw new Error(`Question "${name}" not found in cypress_sample_instance_data`);
  }
  return Number(question.id);
}

function findCollectionId(name: string): number {
  const collection = SAMPLE_INSTANCE_DATA.collections.find(
    (collection) => collection.name === name,
  );
  if (!collection) {
    throw new Error(
      `Collection "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(collection.id);
}

// === the spec's module-level helpers ===

/** Port of the spec-local openDataSelector(). */
export async function openDataSelector(page: Page) {
  await dataStepCell(page).click();
}

export function dataStepCell(page: Page): Locator {
  return page.getByTestId("data-step-cell");
}

/**
 * Click a row in the mini picker, scrolling its virtualized list until the row
 * enters the DOM.
 *
 * The mini picker's item list is a `VirtualizedList` (@tanstack/react-virtual,
 * `data-testid="scroll-container"`), so it holds ~20 rows at a time. Upstream
 * clicks `findByText(name)` directly, which only works while the target is in
 * the initial window — true in CI's freshly-seeded writable container (three
 * schemas), false against the locally shared one, which carries the 26
 * `Schema A`…`Schema Z` schemas that `many_schemas` leaves behind. `Wild`
 * sorts after all of them and is never rendered.
 *
 * This does not weaken anything the test asserts: the row must still exist and
 * be clickable.
 */
export async function clickMiniPickerItem(page: Page, name: string) {
  const picker = page.getByTestId("mini-picker");
  const item = picker.getByText(name, { exact: true });
  const scroller = picker.getByTestId("scroll-container").first();

  await expect(async () => {
    if ((await item.count()) === 0) {
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollTop + element.clientHeight;
      });
    }
    expect(await item.count()).toBeGreaterThan(0);
  }).toPass({ timeout: 20_000 });

  await item.first().click();
}

/**
 * Port of assertDataPickerEntitySelected(level, name):
 * entityPickerModalItem(level, name).should("have.attr", "data-active", "true").
 */
export async function assertDataPickerEntitySelected(
  page: Page,
  level: number,
  name: string,
) {
  await expect(entityPickerModalItem(page, level, name)).toHaveAttribute(
    "data-active",
    "true",
  );
}

/**
 * Port of assertDataPickerEntityNotSelected(level, name):
 * entityPickerModalItem(level, name).should("not.have.attr", "data-active").
 *
 * Cypress's subject resolution (findByText) throws when the row is missing,
 * so the assertion also carries an implicit existence requirement — Playwright's
 * negated toHaveAttribute keeps that (it fails on "element not found" rather
 * than passing vacuously).
 */
export async function assertDataPickerEntityNotSelected(
  page: Page,
  level: number,
  name: string,
) {
  await expect(entityPickerModalItem(page, level, name)).not.toHaveAttribute(
    "data-active",
  );
}

/**
 * Port of the spec-local moveToCollection(collection).
 *
 * Upstream registers `cy.intercept("GET", "/api/collection/tree**")` BEFORE
 * opening the question actions and `cy.wait`s on it after clicking Move.
 * `cy.wait` pops past responses, and the entity picker itself fetches the
 * collection tree when it opens — so the wait may well be satisfied
 * retroactively. Ported as a recorder registered at the same point Cypress
 * registers the intercept, then popped once after the Move click (PORTING's
 * ResponseRecorder shape).
 */
export async function moveToCollection(page: Page, collection: string) {
  const tree = recordCollectionTree(page);

  await openQuestionActions(page);
  const moveItem = popover(page).getByText("Move", { exact: true });
  await expect(moveItem).toBeVisible();
  await moveItem.click();

  const modal = entityPickerModal(page);
  await modal.getByText(collection, { exact: true }).click();
  await modal.getByRole("button", { name: "Move", exact: true }).click();
  await tree.pop();
}

/** Records GET /api/collection/tree* responses from the point of the call. */
export function recordCollectionTree(page: Page) {
  return recordResponses(
    page,
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/collection/tree",
  );
}

/**
 * A minimal port of Cypress's alias queue: responses matching `predicate` are
 * recorded from registration time, and each `pop()` consumes the oldest
 * (waiting for one if the queue is empty).
 */
export function recordResponses(
  page: Page,
  predicate: (response: Response) => boolean,
) {
  const queue: Response[] = [];
  const waiters: ((response: Response) => void)[] = [];

  const handler = (response: Response) => {
    if (!predicate(response)) {
      return;
    }
    const waiter = waiters.shift();
    if (waiter) {
      waiter(response);
    } else {
      queue.push(response);
    }
  };
  page.on("response", handler);

  return {
    pop(timeout = 30_000): Promise<Response> {
      const queued = queue.shift();
      if (queued) {
        return Promise.resolve(queued);
      }
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Timed out waiting for a recorded response")),
          timeout,
        );
        waiters.push((response) => {
          clearTimeout(timer);
          resolve(response);
        });
      });
    },
    dispose() {
      page.off("response", handler);
    },
  };
}

/**
 * Port of H.saveQuestionToCollection(name) → H.saveQuestion(name, undefined,
 * { path: ["Our analytics"] }).
 *
 * The shared support/nested-questions.ts `saveQuestionToCollection` is
 * explicitly a "no-rename subset" and drops the name, which this spec passes
 * ("Beasts"). Ported here with the rename so the fixture matches upstream.
 */
export async function saveQuestionToCollection(
  page: Page,
  name: string,
  path: (string | RegExp)[] = ["Our analytics"],
) {
  const saveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );

  await page
    .getByTestId("qb-header")
    .getByRole("button", { name: "Save", exact: true })
    .click();

  const saveModal = page.getByTestId("save-question-modal");
  await saveModal.getByLabel("Name", { exact: true }).fill(name);
  await saveModal.getByLabel(/Where do you want to save this/).click();
  await pickEntity(page, { path, select: true });
  await saveModal.getByRole("button", { name: "Save", exact: true }).click();

  const body = (await (await saveResponse).json()) as {
    id: number;
    dashboard_id: number | null;
  };

  // Port of checkSavedToCollectionQuestionToast.
  if (!body.dashboard_id) {
    await expect(
      page.getByTestId("toast-undo").getByText(/Saved/i),
    ).toBeVisible();
  }

  return body;
}
