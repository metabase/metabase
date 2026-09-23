/**
 * Helpers for the dashboard-sections spec port
 * (dashboard-cards/dashboard-sections.cy.spec.js): the spec-local helpers
 * addSection / selectQuestion / overwriteDashCardTitle / filterPanel /
 * mapDashCardToFilter / assertPlaceholderCardCanBeDragged. Everything shared
 * is imported read-only from the domain modules.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { pickEntity, selectDashboardFilter, sidebar } from "./dashboard";
import { getDashboardCards } from "./dashboard-core";
import { dashboardGrid } from "./drillthroughs";
import { modal } from "./ui";
import {
  saveDashcardVisualizerModalSettings,
  showDashcardVisualizerModalSettings,
} from "./visualizer-cartesian";

/** Port of H.menu() (e2e-ui-elements-helpers.js): the open Mantine menu. */
function menu(page: Page): Locator {
  return page.getByRole("menu");
}

/** Port of the spec-local filterPanel. */
export function filterPanel(page: Page): Locator {
  return page.getByTestId("edit-dashboard-parameters-widget-container");
}

/**
 * Port of the spec-local addSection. findByLabelText strings are exact
 * (testing-library) → getByLabel({ exact: true }).
 */
export async function addSection(page: Page, name: string) {
  await page.getByLabel("Add section", { exact: true }).click();
  await menu(page).getByLabel(name, { exact: true }).click();
}

/**
 * Port of the spec-local selectQuestion: click the first "Select question"
 * placeholder, pick the question in the entity picker, wait for its card query,
 * then assert it rendered. The @cardQuery intercept (POST on the card-query
 * endpoint) is registered BEFORE the pick that triggers it (PORTING rule 2).
 */
export async function selectQuestion(page: Page, question: string) {
  await dashboardGrid(page)
    .getByText("Select question", { exact: true })
    .first()
    .click({ force: true });

  const cardQuery = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/[^/]+\/query$/.test(new URL(response.url()).pathname),
  );
  await pickEntity(page, { path: ["Our analytics", question] });
  await cardQuery;

  await expect(
    dashboardGrid(page).getByText(question, { exact: true }),
  ).toBeVisible();
}

/**
 * Port of the spec-local overwriteDashCardTitle: open the dashcard's visualizer
 * modal settings, rewrite the Title (cy.findByDisplayValue(original) → fill+blur,
 * since the modal Title is a plain TextInput), then save.
 *
 * cy.findByDisplayValue matches by value regardless of visibility, so this
 * scans the modal's form controls for the one holding `originalTitle` — the
 * shared filters-repros.findByDisplayValue asserts the FIRST control is visible,
 * but the visualizer modal's first control is a hidden "Search" input.
 */
export async function overwriteDashCardTitle(
  page: Page,
  index: number,
  originalTitle: string,
  newTitle: string,
) {
  await showDashcardVisualizerModalSettings(page, index, {
    isVisualizerCard: false,
  });

  const controls = modal(page).locator("input, textarea, select");
  const count = await controls.count();
  let input: Locator | undefined;
  for (let control = 0; control < count; control++) {
    if ((await controls.nth(control).inputValue()) === originalTitle) {
      input = controls.nth(control);
      break;
    }
  }
  if (!input) {
    throw new Error(`No form control with display value "${originalTitle}"`);
  }

  await input.fill(newTitle);
  await input.blur();
  await saveDashcardVisualizerModalSettings(page);
}

/** Port of the spec-local mapDashCardToFilter. */
export async function mapDashCardToFilter(dashcard: Locator, filterName: string) {
  const page = dashcard.page();
  await filterPanel(page).getByText(filterName, { exact: true }).click();
  await selectDashboardFilter(dashcard, filterName);
  await sidebar(page).getByRole("button", { name: "Done" }).click();
}

/**
 * Port of the spec-local assertPlaceholderCardCanBeDragged (metabase#UXW-3387):
 * drag a "Select question" placeholder card and assert some card's left edge
 * moved. Dashcards live in a react-grid-layout (react-draggable) grid, which
 * responds to real DOM mouse events, so a real-mouse drag drives it. Cypress
 * dragged from x:10,y:50 (element-relative) to clientX rect.left+900 /
 * clientY rect.top+200; mirrored here. The final positions are read in an
 * expect.poll so the grid's reflow has time to settle.
 */
export async function assertPlaceholderCardCanBeDragged(page: Page) {
  const cards = getDashboardCards(page);
  const count = await cards.count();

  const initialLeft: number[] = [];
  for (let index = 0; index < count; index++) {
    const box = await cards.nth(index).boundingBox();
    initialLeft.push(box?.x ?? NaN);
  }

  const target = cards.filter({ hasText: "Select question" }).first();
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("Cannot drag a placeholder card without a bounding box");
  }

  await page.mouse.move(box.x + 10, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 900, box.y + 200, { steps: 5 });
  await page.waitForTimeout(100);
  await page.mouse.up();

  await expect
    .poll(async () => {
      const afterLeft: number[] = [];
      for (let index = 0; index < count; index++) {
        const after = await cards.nth(index).boundingBox();
        afterLeft.push(after?.x ?? NaN);
      }
      return afterLeft.some((left, index) => left !== initialLeft[index]);
    })
    .toBe(true);
}
