/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-cards/dashboard-card-resizing.cy.spec.js
 *
 * Notes on the port:
 * - The card resize is React-Grid-Layout (react-draggable), NOT dnd-kit — see
 *   support/dashboard-card-resizing.ts resizeDashboardCard for why it dispatches
 *   synthetic MouseEvents rather than driving a real mouse.
 * - The "default sizes" test's `cy.intercept("POST","/api/card/**\/query")` +
 *   `cy.wait` per added card becomes a waitForResponse registered before each
 *   sidebar click; a `toHaveCount(17)` gate before save anchors the save on the
 *   dashcards actually being applied (the async-card-add / saveDashboard gotcha).
 * - `cy.viewport(w, h)` → page.setViewportSize.
 */
import {
  editDashboard,
  getDashboardCard,
  saveDashboard,
} from "../support/dashboard";
import {
  getDefaultSize,
  getMinSize,
  getTestQuestions,
  resizeDashboardCard,
  resizeHandleCenter,
  startResizeDrag,
} from "../support/dashboard-card-resizing";
import { getDashboardCards, updateDashboardCards } from "../support/dashboard-core";
import {
  createDashboard,
  createDashboardWithQuestions,
  createQuestion,
} from "../support/factories";
import { test, expect } from "../support/fixtures";
import { openQuestionsSidebar } from "../support/revisions";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitDashboard } from "../support/ui";
import { tooltip } from "../support/charts";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const TEST_DASHBOARD_NAME = "Test Dashboard";
const TEST_QUESTION_NAME = "Test Question";

const viewports: [number, number][] = [
  [768, 800],
  [1024, 800],
  [1440, 800],
];

// cy.intercept("POST", "/api/card/**/query") — the ** matches the pivot path
// (/api/card/pivot/:id/query) too, not just /api/card/:id/query.
const isCardQuery = (url: string) =>
  /^\/api\/card\/.+\/query$/.test(new URL(url).pathname);

type DashcardWithSize = {
  card: { display: string };
  size_x: number;
  size_y: number;
};

test.describe("scenarios > dashboard card resizing", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should display all visualization cards with their default sizes", async ({
    page,
    mb,
  }) => {
    const testQuestions = getTestQuestions();
    for (const question of testQuestions) {
      await createQuestion(mb.api, question);
    }
    const { id: dashId } = await createDashboard(mb.api, {});
    await visitDashboard(page, mb.api, dashId);

    await editDashboard(page);
    await openQuestionsSidebar(page);

    // Metabase sorts sidebar questions alphabetically; sort here too so we click
    // top-to-bottom and the sidebar scrolls naturally (matches upstream).
    const sortedCards = [...testQuestions].sort((a, b) =>
      String(a.name).localeCompare(String(b.name)),
    );

    const sidebar = page.getByTestId("add-card-sidebar");
    for (const question of sortedCards) {
      // After each card is added there is a POST /api/card/:id/query; wait for
      // it before adding the next so the save can't race the card-adds.
      const cardQuery = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          isCardQuery(response.url()),
      );
      const label = sidebar.getByLabel(String(question.name), { exact: true });
      await expect(label).toBeVisible();
      await label.click();
      await cardQuery;
    }

    // Anchor the save on the dashcards actually being present (async card-add).
    await expect(getDashboardCards(page)).toHaveCount(sortedCards.length);

    await saveDashboard(page);

    const { dashcards } = (await (
      await mb.api.get(`/api/dashboard/${dashId}`)
    ).json()) as { dashcards: DashcardWithSize[] };

    for (const { card, size_x, size_y } of dashcards) {
      const size = getDefaultSize(card.display);
      expect(size, `default size for ${card.display}`).toBeDefined();
      expect(size_x).toBe(size!.width);
      expect(size_y).toBe(size!.height);
    }
  });

  test("should keep the resize handle connected to the cursor while resizing (metabase#70451)", async ({
    page,
    mb,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      dashboardDetails: {},
      questions: [
        {
          display: "table",
          query: {
            "source-table": ORDERS_ID,
            limit: 10,
          },
        },
      ],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    await editDashboard(page);

    const { targetX, targetY } = await startResizeDrag(getDashboardCard(page), {
      dx: 200,
      dy: 150,
    });

    // After dragging, the resize handle should still be near the cursor position.
    const { x: handleCenterX, y: handleCenterY } = await resizeHandleCenter(
      getDashboardCard(page),
    );

    const maxDrift = 50;
    expect(
      Math.abs(handleCenterX - targetX),
      `Horizontal drift: handle at ${handleCenterX}, cursor at ${targetX}`,
    ).toBeLessThan(maxDrift);
    expect(
      Math.abs(handleCenterY - targetY),
      `Vertical drift: handle at ${handleCenterY}, cursor at ${targetY}`,
    ).toBeLessThan(maxDrift);
  });

  test("should not allow cards to be resized smaller than min height", async ({
    page,
    mb,
  }) => {
    const testQuestions = getTestQuestions();
    const cardIds: number[] = [];
    for (const question of testQuestions) {
      const card = await createQuestion(mb.api, question);
      cardIds.push(card.id);
    }
    const { id: dashId } = await createDashboard(mb.api, {});
    await mb.api.put(`/api/dashboard/${dashId}`, {
      dashcards: cardIds.map((cardId, index) => ({
        id: index,
        card_id: cardId,
        row: index * 10,
        col: 0,
        size_x: 18,
        size_y: 10,
      })),
    });
    await visitDashboard(page, mb.api, dashId);
    await editDashboard(page);

    const { dashcards } = (await (
      await mb.api.get(`/api/dashboard/${dashId}`)
    ).json()) as { dashcards: { card: { display: string } }[] };

    for (let index = 0; index < dashcards.length; index++) {
      const { card } = dashcards[index];
      const size = getDefaultSize(card.display);
      expect(size, `default size for ${card.display}`).toBeDefined();
      await resizeDashboardCard(getDashboardCard(page, index), {
        x: -size!.width * 200,
        y: -size!.height * 200,
      });
    }

    await saveDashboard(page);

    const { dashcards: resized } = (await (
      await mb.api.get(`/api/dashboard/${dashId}`)
    ).json()) as { dashcards: DashcardWithSize[] };

    for (const { card, size_x, size_y } of resized) {
      const size = getMinSize(card.display);
      expect(size, `min size for ${card.display}`).toBeDefined();
      expect(size_x).toBe(size!.width);
      expect(size_y).toBe(size!.height);
    }
  });
});

test.describe("trend charts", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("comparisons that do not fit should only be shown in a tooltip", async ({
    page,
    mb,
  }) => {
    const { dashboard, questions } = await createDashboardWithQuestions(mb.api, {
      dashboardDetails: {},
      questions: [
        {
          display: "smartscalar",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["count"],
              ["sum", ["field", ORDERS.TOTAL, null]],
              [
                "aggregation-options",
                ["*", ["count"], 10000],
                { name: "Mega Count", "display-name": "Mega Count" },
              ],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          visualization_settings: {
            "scalar.comparisons": [
              {
                id: "fecd2c69-4d43-57d0-6d60-6781a54beceb",
                type: "previousPeriod",
              },
              {
                id: "e8b8d831-d2a9-9fd7-17a7-db8b4834ac5a",
                type: "periodsAgo",
                value: 2,
              },
              {
                id: "9712f309-6849-20ba-7cef-54ae899a0e41",
                type: "anotherColumn",
                label: "Sum of Total",
                column: "sum",
              },
            ],
          },
        },
      ],
    });
    const [card] = questions;

    await updateDashboardCards(mb.api, {
      dashboard_id: dashboard.id,
      cards: [{ card_id: card.id, size_x: 4, size_y: 3 }],
    });

    await visitDashboard(page, mb.api, dashboard.id);

    const dashcard = getDashboardCard(page);
    await expect(dashcard.getByText("34.72%")).toBeVisible();
    await expect(dashcard.getByText("36.65%")).toHaveCount(0);
    await expect(dashcard.getByText("98.88%")).toHaveCount(0);

    await dashcard.getByText("34.72%").hover();

    const tip = tooltip(page);
    await expect(tip.getByText("34.72%")).toBeVisible();
    await expect(tip.getByText("36.65%")).toBeVisible();
    await expect(tip.getByText("98.88%")).toBeVisible();
  });
});

test.describe("issue 31701", () => {
  const editEntityLinkContainer = (page: import("@playwright/test").Page) =>
    page.getByTestId("entity-edit-display-link");
  const editCustomLinkContainer = (page: import("@playwright/test").Page) =>
    page.getByTestId("custom-edit-text-link");
  const viewEntityLinkContainer = (page: import("@playwright/test").Page) =>
    page.getByTestId("entity-view-display-link");
  const viewCustomLinkContainer = (page: import("@playwright/test").Page) =>
    page.getByTestId("custom-view-text-link");

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await createQuestion(mb.api, {
      name: TEST_QUESTION_NAME,
      query: {
        "source-table": ORDERS_ID,
      },
    });

    const { id: dashId } = await createDashboard(mb.api, {
      name: TEST_DASHBOARD_NAME,
    });
    await visitDashboard(page, mb.api, dashId);

    await editDashboard(page);

    // Add first link card (connected to an entity).
    await page.getByLabel("Add a link or iframe").click();
    await popover(page).getByText("Link", { exact: true }).click();
    const entityCard = getDashboardCard(page, 0);
    await entityCard.click();
    await page.keyboard.type(TEST_QUESTION_NAME);
    await popover(page)
      .getByTestId("search-result-item-name")
      .first()
      .click();

    // Add second link card (text only).
    await page.getByLabel("Add a link or iframe").click();
    await popover(page).getByText("Link", { exact: true }).click();
    const customCard = getDashboardCard(page, 1);
    await customCard.click();
    await page.keyboard.type(TEST_QUESTION_NAME);
    await page.keyboard.press("Tab");
  });

  test("should prevent link dashboard card overflows (metabase#31701)", async ({
    page,
  }) => {
    // when editing dashboard
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await assertLinkCardOverflow(
        editEntityLinkContainer(page),
        getDashboardCard(page, 0),
      );
      await assertLinkCardOverflow(
        editCustomLinkContainer(page),
        getDashboardCard(page, 1),
      );
    }

    await saveDashboard(page);

    // when viewing a saved dashboard
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await assertLinkCardOverflow(
        viewEntityLinkContainer(page),
        getDashboardCard(page, 0),
      );
      await assertLinkCardOverflow(
        viewCustomLinkContainer(page),
        getDashboardCard(page, 1),
      );
    }
  });
});

async function assertLinkCardOverflow(
  link: import("@playwright/test").Locator,
  card: import("@playwright/test").Locator,
) {
  const linkScrollHeight = await link.evaluate((el) => el.scrollHeight);
  const cardFirstChildScrollHeight = await card.evaluate(
    (el) => (el.firstChild as HTMLElement).scrollHeight,
  );
  expect(linkScrollHeight).toBe(cardFirstChildScrollHeight);
}
