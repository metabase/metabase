/**
 * Playwright port of
 * e2e/test/scenarios/question/detail-visualization-custom-column.cy.spec.ts
 *
 * The single-row "object detail" visualization must render a newly added
 * custom-column value when previewing via Visualize, before the question is
 * saved (metabase#63181).
 *
 * H.createQuestion({ visitQuestion: true }) → createQuestion (factory only
 * creates) + visitQuestion. The expression editor is CodeMirror — entry goes
 * through the shared enterCustomColumnDetails (native keystrokes). cy.button →
 * getByRole("button"). cy.findByText(string) is exact (rule 1). The object
 * detail viz testid is "object-detail" (singular) — distinct from the
 * detail-view page's "object-details".
 */
import { addCustomColumn } from "../support/cc-fields";
import { createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { enterCustomColumnDetails, openNotebook } from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { visitQuestion } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

test.describe(
  "scenarios > question > detail visualization + custom column preview",
  () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("should render a newly added custom column when previewing Detail visualization (metabase#63181)", async ({
      page,
      mb,
    }) => {
      const CUSTOM_COLUMN_NAME = "Tax custom column";

      // Create a simple question and set visualization to "Detail" (Object Detail)
      const { id } = await createQuestion(mb.api, {
        name: "Detail viz with custom column (preview)",
        query: { "source-table": ORDERS_ID },
        display: "object",
      });
      await visitQuestion(page, id);

      // Go to notebook editor and add a simple custom column
      await openNotebook(page);
      await addCustomColumn(page);
      await enterCustomColumnDetails(page, {
        formula: "[Tax]",
        name: CUSTOM_COLUMN_NAME,
      });
      await page.getByRole("button", { name: "Done", exact: true }).click();

      // Click Visualize without saving the question
      await page
        .getByRole("button", { name: "Visualize", exact: true })
        .click();

      // Ensure the Detail visualization renders
      await expect(page.getByTestId("object-detail")).toBeVisible();

      // The newly added custom column should be rendered in the Detail view preview
      await expect(
        page.getByTestId("object-detail").getByText(CUSTOM_COLUMN_NAME, {
          exact: true,
        }),
      ).toBeVisible();
    });
  },
);
