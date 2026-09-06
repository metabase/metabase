/**
 * Playwright port of e2e/test/scenarios/filters/operators.cy.spec.js
 */
import type { Locator, Page } from "@playwright/test";

import { clauseStepPopover, containsText } from "../support/filters";
import { test, expect } from "../support/fixtures";
import { openTableNotebook } from "../support/joins";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover } from "../support/ui";

const { PRODUCTS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

test.describe("operators in questions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  const expected = {
    text: {
      expected: [
        "Is",
        "Is not",
        "Contains",
        "Does not contain",
        "Is empty",
        "Not empty",
        "Starts with",
        "Ends with",
      ],
      unexpected: ["Is null", "Not null"],
    },
    number: {
      expected: [
        "Equal to",
        "Not equal to",
        "Greater than",
        "Less than",
        "Between",
        "Greater than or equal to",
        "Less than or equal to",
        "Is empty",
        "Not empty",
      ],
      unexpected: ["Is null", "Not null"],
    },
    relativeDates: {
      expected: ["Previous", "Next", "Current"],
      unexpected: ["Is null", "Not null"],
    },
    specificDates: {
      expected: ["Before", "After", "On", "Between"],
      unexpected: ["Is null", "Not null"],
    },
    excludeDates: {
      expected: [
        "Days of the week…",
        "Months of the year…",
        "Quarters of the year…",
        "Hours of the day…",
        "Empty values",
        "Not empty values",
      ],
      unexpected: ["Is null", "Not null"],
    },
    id: {
      expected: ["Is", "Is not", "Is empty", "Not empty"],
      unexpected: ["Is null", "Not null"],
    },
    geo: {
      expected: ["Is", "Is not"],
      unexpected: ["Is null", "Not null"],
    },
  };

  test.describe("fields have proper operators", () => {
    test("text operators", async ({ page }) => {
      await setup(page, PRODUCTS_ID);

      await popover(page).getByText("Title", { exact: true }).click();
      await popover(page).getByText("Is", { exact: true }).click();

      const menu = page.getByRole("menu");
      await assertContains(menu, expected.text.expected);
      await assertNotContains(menu, expected.text.unexpected);
    });

    test("number operators", async ({ page }) => {
      await setup(page, PRODUCTS_ID);

      await popover(page).getByText("Price", { exact: true }).click();
      await popover(page).getByText("Between", { exact: true }).click();

      const menu = page.getByRole("menu");
      await assertContains(menu, expected.number.expected);
      await assertNotContains(menu, expected.number.unexpected);
    });

    test("relative date operators", async ({ page }) => {
      await setup(page, PRODUCTS_ID);

      await popover(page).getByText("Created At", { exact: true }).click();
      await popover(page)
        .getByText("Relative date range…", { exact: true })
        .click();
      await popover(page).getByText("Previous", { exact: true }).click();

      const clausePopover = clauseStepPopover(page);
      await assertContains(clausePopover, expected.relativeDates.expected);
      await assertNotContains(clausePopover, expected.specificDates.expected);
      await assertNotContains(clausePopover, expected.excludeDates.expected);
      await assertNotContains(clausePopover, expected.relativeDates.unexpected);
    });

    test("specific date operators", async ({ page }) => {
      await setup(page, PRODUCTS_ID);

      await popover(page).getByText("Created At", { exact: true }).click();
      await popover(page)
        .getByText("Fixed date range…", { exact: true })
        .click();
      await popover(page).getByText("Between", { exact: true }).click();

      const datePopover = popover(page);
      await assertContains(datePopover, expected.specificDates.expected);
      await assertNotContains(datePopover, expected.relativeDates.expected);
      await assertNotContains(datePopover, expected.excludeDates.expected);
      await assertNotContains(datePopover, expected.specificDates.unexpected);
    });

    test("exclude date operators", async ({ page }) => {
      await setup(page, PRODUCTS_ID);

      await popover(page).getByText("Created At", { exact: true }).click();
      await popover(page).getByText("Exclude…", { exact: true }).click();

      const datePopover = popover(page);
      await assertContains(datePopover, expected.excludeDates.expected);
      await assertNotContains(datePopover, expected.relativeDates.expected);
      await assertNotContains(datePopover, expected.specificDates.expected);
      await assertNotContains(datePopover, expected.excludeDates.unexpected);
    });

    test("id operators", async ({ page }) => {
      await setup(page, PRODUCTS_ID);

      await popover(page).getByText("ID", { exact: true }).click();
      await popover(page).getByText("Is", { exact: true }).click();

      const menu = page.getByRole("menu");
      await assertContains(menu, expected.id.expected);
      await assertNotContains(menu, expected.id.unexpected);
    });

    test("geo operators", async ({ page }) => {
      await setup(page, PEOPLE_ID);

      await popover(page)
        .getByText("State", { exact: true })
        .click({ force: true });
      await popover(page).getByText("Is", { exact: true }).click();

      const menu = page.getByRole("menu");
      await assertContains(menu, expected.geo.expected);
      await assertNotContains(menu, expected.geo.unexpected);
    });
  });
});

async function setup(page: Page, tableId: number) {
  await openTableNotebook(page, tableId);
  await page.getByRole("button", { name: "Filter", exact: true }).click();
}

async function assertContains(scope: Locator, texts: string[]) {
  for (const text of texts) {
    // cy.contains resolves to the first match ("Is" also matches "Is not").
    await expect(containsText(scope, text).first()).toBeVisible();
  }
}

async function assertNotContains(scope: Locator, texts: string[]) {
  for (const text of texts) {
    await expect(containsText(scope, text)).toHaveCount(0);
  }
}
