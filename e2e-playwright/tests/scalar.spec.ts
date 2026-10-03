/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/scalar.cy.spec.ts
 *
 * The Cypress original uses the `color` npm package to normalize the picked
 * swatch's aria-label (a hex value) into the computed-CSS rgb() form; here a
 * small local hexToRgb does the same without the dependency.
 */
import { openVizSettingsSidebar, tooltip } from "../support/charts";
import { sidebar } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > visualizations > scalar", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow open-ended conditional color ranges", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion({
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "scalar",
    });
    await page.goto(`/question/${id}`);
    await expect(
      page
        .getByTestId("query-visualization-root")
        .getByTestId("scalar-value"),
    ).toBeVisible({ timeout: 20_000 });

    await openVizSettingsSidebar(page);
    await sidebar(page)
      .getByText("Conditional colors", { exact: true })
      .click();

    await page.getByRole("button", { name: /add a range/i }).click();

    const firstMin = page.getByPlaceholder("Min", { exact: true }).nth(0);
    await firstMin.clear();
    await firstMin.blur();
    const firstMax = page.getByPlaceholder("Max", { exact: true }).nth(0);
    await firstMax.fill("1000");
    await firstMax.blur();

    await page.getByRole("button", { name: /add a range/i }).click();

    const secondMin = page.getByPlaceholder("Min", { exact: true }).nth(1);
    await secondMin.fill("1000");
    await secondMin.blur();
    const secondMax = page.getByPlaceholder("Max", { exact: true }).nth(1);
    await secondMax.clear();
    await secondMax.blur();

    await page.getByTestId("color-selector-button").nth(1).click();
    const colorButton = popover(page).getByRole("button").nth(4);
    const color = await colorButton.getAttribute("aria-label");
    await colorButton.click();
    await expect(page.getByTestId("scalar-value")).toHaveCSS(
      "color",
      hexToRgb(color ?? ""),
    );

    await page.getByTestId("scalar-value").hover();
    await expect(tooltip(page)).toContainText("≤ 1000");
    await expect(tooltip(page)).toContainText("≥ 1000");
  });
});

/** "#509ee3" -> "rgb(80, 158, 227)" (the computed-CSS color format). */
function hexToRgb(color: string): string {
  const match = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    throw new Error(`Expected a hex color aria-label, got "${color}"`);
  }
  const hex =
    match[1].length === 3
      ? [...match[1]].map((char) => char + char).join("")
      : match[1];
  const [r, g, b] = [0, 2, 4].map((offset) =>
    parseInt(hex.slice(offset, offset + 2), 16),
  );
  return `rgb(${r}, ${g}, ${b})`;
}
