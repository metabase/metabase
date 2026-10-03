/**
 * Playwright port of e2e/test/scenarios/filters/filter-types.cy.spec.js
 */
import { clauseStepPopover } from "../support/filters";
import { test, expect } from "../support/fixtures";
import { filterNotebook, openTableNotebook } from "../support/joins";
import { getNotebookStep, visualize } from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const DATE_SHORTCUT_CASES = [
  {
    title: "today",
    shortcut: "Today",
    expectedDisplayName: "Created At is today",
  },
  {
    title: "yesterday",
    shortcut: "Yesterday",
    expectedDisplayName: "Created At is yesterday",
  },
  {
    title: "previous week",
    shortcut: "Previous week",
    expectedDisplayName: "Created At is in the previous week",
  },
  {
    title: "previous 7 days",
    shortcut: "Previous 7 days",
    expectedDisplayName: "Created At is in the previous 7 days",
  },
  {
    title: "previous 30 days",
    shortcut: "Previous 30 days",
    expectedDisplayName: "Created At is in the previous 30 days",
  },
  {
    title: "previous month",
    shortcut: "Previous month",
    expectedDisplayName: "Created At is in the previous month",
  },
  {
    title: "previous 3 months",
    shortcut: "Previous 3 months",
    expectedDisplayName: "Created At is in the previous 3 months",
  },
  {
    title: "previous 12 months",
    shortcut: "Previous 12 months",
    expectedDisplayName: "Created At is in the previous 12 months",
  },
];

test.describe("scenarios > filters > filter types", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test.describe("date filters", () => {
    test.describe("shortcuts", () => {
      for (const {
        title,
        shortcut,
        expectedDisplayName,
      } of DATE_SHORTCUT_CASES) {
        test(title, async ({ page }) => {
          await openTableNotebook(page, PRODUCTS_ID);
          await filterNotebook(page);

          const popover = clauseStepPopover(page);
          await popover.getByText("Created At", { exact: true }).click();
          await popover.getByText(shortcut, { exact: true }).click();

          await expect(
            getNotebookStep(page, "filter").getByText(expectedDisplayName, {
              exact: true,
            }),
          ).toBeVisible();
          await visualize(page);
          await expect(page.getByTestId("qb-filters-panel")).toBeVisible();
        });
      }
    });
  });
});
