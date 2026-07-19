/**
 * Spec-local helpers for the dashboard-questions port
 * (e2e/test/scenarios/dashboard/dashboard-questions.cy.spec.js).
 *
 * These are the functions/constants that lived inside the Cypress spec
 * (seedMigrationToolData, selectCollectionItem, the DASHBOARD / QUESTION
 * names) plus a couple of small ports the spec needs that no shared module
 * exposes in the exact shape used here:
 * - commandPaletteSearch with the `viewAll` branch (the shared filters-repros /
 *   search-pagination copies only cover viewAll:false / true respectively);
 * - waitForCardUpdates, the counting side of `cy.wait(Array(n).fill("@updateCard"))`.
 *
 * Per the porting brief this file must NOT edit shared modules — everything
 * shared is imported read-only.
 */
import type { Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import {
  commandPalette,
  commandPaletteButton,
  commandPaletteInput,
} from "./command-palette";
import { updateDashboardCards } from "./dashboard-core";
import {
  createQuestion,
  createQuestionAndDashboard,
} from "./factories";
import { FIRST_COLLECTION_ID, SAMPLE_DATABASE } from "./sample-data";
import { collectionTable } from "./ui";

export const DASHBOARD_ONE = "Dashboard One";
export const DASHBOARD_TWO = "Dashboard Two";

export const QUESTION_ONE = "Question One";
export const QUESTION_TWO = "Question Two";
export const QUESTION_THREE = "Question Three";

/**
 * Local stand-in for createMockDashboardCard (metabase-types/api/mocks): the
 * PUT /api/dashboard only reads id / card_id / layout, so the heavy embedded
 * `card` object the real mock carries is omitted (the shared content factories
 * PUT dashcards the same lean way).
 */
function createMockDashboardCard(
  opts: {
    id: number;
    card_id: number;
    col?: number;
    row?: number;
    size_x?: number;
    size_y?: number;
  },
): Record<string, unknown> {
  return {
    dashboard_id: 1,
    dashboard_tab_id: null,
    row: 0,
    col: 0,
    size_x: 1,
    size_y: 1,
    visualization_settings: {},
    parameter_mappings: [],
    ...opts,
  };
}

/**
 * Port of the spec-local seedMigrationToolData: three questions in First
 * collection, two dashboards, where QUESTION_THREE is a dashcard in BOTH
 * dashboards (id 3 reused) so it is NOT a migration candidate, while
 * QUESTION_ONE / QUESTION_TWO each live in exactly one dashboard.
 */
export async function seedMigrationToolData(api: MetabaseApi) {
  const query = { "source-table": SAMPLE_DATABASE.ORDERS_ID };
  const baseDc = { size_x: 8, size_y: 5 };

  const questionThree = await createQuestion(api, {
    name: QUESTION_THREE,
    query,
    collection_id: FIRST_COLLECTION_ID,
  });
  const questionThreeCard = createMockDashboardCard({
    ...baseDc,
    id: 3,
    card_id: questionThree.id,
    col: 8,
  });

  const dashboardOne = await createQuestionAndDashboard(api, {
    dashboardDetails: {
      name: DASHBOARD_ONE,
      collection_id: FIRST_COLLECTION_ID,
    },
    questionDetails: {
      name: QUESTION_ONE,
      query,
      collection_id: FIRST_COLLECTION_ID,
    },
  });
  await updateDashboardCards(api, {
    dashboard_id: dashboardOne.dashboard_id,
    cards: [
      createMockDashboardCard({ ...baseDc, id: 1, card_id: dashboardOne.card_id }),
      questionThreeCard,
    ],
  });

  const dashboardTwo = await createQuestionAndDashboard(api, {
    dashboardDetails: {
      name: DASHBOARD_TWO,
      collection_id: FIRST_COLLECTION_ID,
    },
    questionDetails: {
      name: QUESTION_TWO,
      query,
      collection_id: FIRST_COLLECTION_ID,
    },
  });
  await updateDashboardCards(api, {
    dashboard_id: dashboardTwo.dashboard_id,
    cards: [
      createMockDashboardCard({ ...baseDc, id: 2, card_id: dashboardTwo.card_id }),
      questionThreeCard,
    ],
  });
}

/**
 * Port of the spec-local selectCollectionItem:
 *   cy.findAllByTestId("collection-entry-name").contains(name)
 *     .parent().parent().findByRole("checkbox").closest("button").click()
 * The Cypress `.parent().parent()` lands on the row; here we scope to the
 * collection-table ROW whose name cell matches exactly (mirrors the shared
 * collections-core selectItemUsingCheckbox), then click the checkbox's
 * enclosing button.
 */
export async function selectCollectionItem(page: Page, name: string) {
  await collectionTable(page)
    .getByRole("row")
    .filter({ has: page.getByText(name, { exact: true }) })
    .getByRole("checkbox")
    .locator("xpath=ancestor::button[1]")
    .click();
}

/**
 * Port of H.commandPaletteSearch(query, viewAll = true): open the palette,
 * type the query, wait for the search response, and (when viewAll) click the
 * "View and filter" link that navigates to the full search page.
 */
export async function commandPaletteSearch(
  page: Page,
  query: string,
  viewAll = true,
) {
  await commandPaletteButton(page).click();
  const search = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/search",
  );
  await commandPaletteInput(page).pressSequentially(query);
  await search;

  if (viewAll) {
    await commandPalette(page)
      .getByRole("link", { name: /View and filter/ })
      .click();
  }
}

/**
 * Counting side of `cy.wait(new Array(count).fill("@updateCard"))` where
 * `@updateCard` is `PUT /api/card/*`: resolves once `count` such responses have
 * been seen. Register BEFORE the triggering action (PORTING rule 2).
 */
export function waitForCardUpdates(page: Page, count: number): Promise<void> {
  let seen = 0;
  return new Promise<void>((resolve) => {
    const handler = (response: Response) => {
      const url = new URL(response.url());
      if (
        response.request().method() === "PUT" &&
        /^\/api\/card\/\d+$/.test(url.pathname)
      ) {
        seen += 1;
        if (seen >= count) {
          page.off("response", handler);
          resolve();
        }
      }
    };
    page.on("response", handler);
  });
}
