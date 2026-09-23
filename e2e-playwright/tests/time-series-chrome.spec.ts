/**
 * Playwright port of
 * e2e/test/scenarios/filters/time-series-chrome.cy.spec.ts
 * (no gating tags upstream — runs in OSS and EE).
 *
 * The "time-series chrome" is the date-range/bucket stepper footer below a
 * time-series question: the `timeseries-filter-button` and the
 * `date-filter-picker` (SimpleDateFilterPicker) it opens.
 *
 * Notes on the port:
 * - `H.visitQuestionAdhoc` → the shared support/permissions.ts visitQuestionAdhoc
 *   (it registers the /api/dataset + query_metadata waits the original aliased).
 * - `cy.findByDisplayValue` → the shared filters-repros.ts findByDisplayValue
 *   (matches input/textarea/select current value; getByDisplayValue is missing
 *   from this install's Playwright types).
 * - `cy.wait("@dataset")` after Apply → a /api/dataset waitForResponse
 *   registered before the click.
 * - `cy.button("Apply")` uses findByRole("button", { name }) — the string name
 *   is exact.
 * - The IncludeCurrentSwitch is a Mantine Switch (role=switch input); toggle it
 *   with force (PORTING rule 4). `aria-checked` is spread onto the input, so
 *   getByLabel(...).toHaveAttribute("aria-checked", ...) mirrors the original.
 * - Date-asserting: run under TZ=US/Pacific to match CI.
 */
import { expect, test } from "../support/fixtures";
import { findByDisplayValue } from "../support/filters-repros";
import { visitQuestionAdhoc } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { dateFilterPicker, updateOperator } from "../support/time-series-chrome";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

test.describe("time-series chrome filter widget", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test.describe("smoke tests", () => {
    test.beforeEach(async ({ page }) => {
      await visitQuestionAdhoc(page, {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          type: "query",
        },
      });
    });

    test("should properly display the component and all its operators", async ({
      page,
    }) => {
      const operators = [
        "Previous",
        "Next",
        "Current",
        "Before",
        "After",
        "On",
        "Between",
      ];

      // should display 'All time' as the initially selected operator (metabase#22247)
      await expect(page.getByTestId("timeseries-filter-button")).toHaveText(
        "All time",
      );
      await page.getByTestId("timeseries-filter-button").click();

      await (await findByDisplayValue(dateFilterPicker(page), "All time")).click();

      const listbox = page.getByRole("listbox");
      await expect(
        listbox.getByRole("option", { name: "All time", exact: true }),
      ).toHaveAttribute("aria-selected", "true");

      // Make sure we display all the operators
      for (const operator of operators) {
        await expect(
          listbox.getByRole("option", { name: operator, exact: true }),
        ).toBeVisible();
      }

      const picker = dateFilterPicker(page);
      // Include 'current' interval switch should not be displayed
      await expect(picker.getByLabel(/^Include/)).toHaveCount(0);
      await expect(
        picker.getByRole("button", { name: "Apply", exact: true }),
      ).toBeEnabled();
    });

    test("should stay in sync with the relative date filter", async ({
      page,
    }) => {
      await page.getByTestId("timeseries-filter-button").click();
      await updateOperator(page, "All time", "Previous");

      // Check the state of the time-series chrome
      const picker = dateFilterPicker(page);
      // Top row
      await expect(await findByDisplayValue(picker, "Previous")).toBeVisible();
      await expect(await findByDisplayValue(picker, "30")).toBeVisible();
      await expect(await findByDisplayValue(picker, "days")).toBeVisible();

      // Toggle should be always off initially (hidden input checkbox)
      const includeToday = picker.getByLabel("Include today", { exact: true });
      await expect(includeToday).not.toBeChecked();

      // This is clicking on an actual label in the UI
      await includeToday.click({ force: true });

      await expect(includeToday).toBeChecked();

      const dataset = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/dataset",
      );
      await picker.getByRole("button", { name: "Apply", exact: true }).click();
      await dataset;

      await expect(page.getByTestId("filter-pill")).toHaveText(
        "Created At is in the previous 30 days or today",
      );
      await page.getByTestId("filter-pill").click();

      // Make sure the relative date picker reflects the state of the time-series chrome
      const picker2 = dateFilterPicker(page);
      await expect(
        picker2.getByRole("tab", { name: "Previous", exact: true }),
      ).toHaveAttribute("aria-selected", "true");

      await expect(
        picker2.getByLabel("Include today", { exact: true }),
      ).toBeChecked();

      // Switch should preserve its state after we change the direction
      await picker2.getByRole("tab", { name: "Next", exact: true }).click();
      await expect(
        picker2.getByLabel("Include today", { exact: true }),
      ).toBeChecked();
    });
  });

  test.describe("'Include this' switch", () => {
    test.beforeEach(async ({ page }) => {
      await visitQuestionAdhoc(page, {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
            ],
            filter: [
              "time-interval",
              [
                "field",
                PRODUCTS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                },
              ],
              30,
              "year",
              {
                "include-current": true,
              },
            ],
          },
          type: "query",
        },
      });

      await expect(page.getByTestId("filter-pill")).toHaveText(
        "Created At is in the next 30 years or this year",
      );
      await expect(page.getByTestId("timeseries-filter-button")).toHaveText(
        "Next 30 years or this year",
      );
      await page.getByTestId("timeseries-filter-button").click();
    });

    test("should preserve the state of 'Include current' switch when changing direction or the interval", async ({
      page,
    }) => {
      const picker = dateFilterPicker(page);
      await expect(
        picker.getByLabel("Include this year", { exact: true }),
      ).toHaveAttribute("aria-checked", "true");

      // Change the interval
      await (await findByDisplayValue(picker, "years")).click();
      await page
        .getByRole("listbox")
        .getByRole("option", { name: "quarters", exact: true })
        .click();

      await expect(await findByDisplayValue(picker, "quarters")).toBeVisible();
      await expect(
        picker.getByLabel("Include this quarter", { exact: true }),
      ).toHaveAttribute("aria-checked", "true");

      // Toggle off
      await picker
        .getByLabel("Include this quarter", { exact: true })
        .click({ force: true });

      // Change the direction
      await updateOperator(page, "Next", "Previous");
      await expect(await findByDisplayValue(picker, "Previous")).toBeVisible();
      await expect(
        picker.getByLabel("Include this quarter", { exact: true }),
      ).toHaveAttribute("aria-checked", "false");
    });

    test("should reset the 'Include current' switch state when navigating away from the relative interval date filter", async ({
      page,
    }) => {
      await expect(
        dateFilterPicker(page).getByLabel("Include this year", { exact: true }),
      ).toHaveAttribute("aria-checked", "true");

      await updateOperator(page, "Next", "Current");
      await expect(
        dateFilterPicker(page).getByLabel("Include today", { exact: true }),
      ).toHaveCount(0);

      await updateOperator(page, "Current", "Previous");
      await expect(
        await findByDisplayValue(dateFilterPicker(page), "Previous"),
      ).toBeVisible();
      await expect(
        dateFilterPicker(page).getByLabel("Include this year", { exact: true }),
      ).toHaveAttribute("aria-checked", "false");
    });
  });
});
