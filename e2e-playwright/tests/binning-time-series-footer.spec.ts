/**
 * Playwright port of
 * e2e/test/scenarios/binning/reproductions/34688-34690-time-series-footer.cy.spec.js
 *
 * Two reproductions asserting the time-series footer chrome (the
 * `timeseries-filter-button` + `timeseries-bucket-button` stepper) renders for
 * a question that has BOTH a temporal breakout and a non-temporal (category)
 * breakout, regardless of the order the two breakouts appear in:
 *  - metabase#34688 — category breakout BEFORE the temporal breakout
 *  - metabase#34690 — category breakout AFTER the temporal breakout
 *
 * Notes on the port:
 * - `H.createQuestion(..., { visitQuestion: true })` → createQuestion factory
 *   (support/factories.ts) then visitQuestion(page, id) (support/ui.ts).
 * - `should("exist")` → toBeVisible (both footer buttons render visibly once the
 *   question loads).
 * - Date-asserting only insofar as the sample-DB temporal breakout must resolve;
 *   run under TZ=US/Pacific to match CI.
 * - Constants (CREATED_AT_BREAKOUT / CUSTOM_COLUMN_BREAKOUT / BASE_QUERY) are
 *   spec-local, mirroring upstream — no shared helpers needed.
 */
import { createQuestion } from "../support/factories";
import { expect, test } from "../support/fixtures";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { visitQuestion } from "../support/ui";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const CREATED_AT_BREAKOUT = [
  "field",
  PRODUCTS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
  },
];

const CUSTOM_COLUMN_BREAKOUT = [
  "expression",
  "Custom column",
  { "base-type": "type/Text" },
];

const ID_FIELD_REF = ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }];

const BASE_QUERY = {
  "source-table": PRODUCTS_ID,
  expressions: {
    "Custom column": [
      "case",
      [[["<", ID_FIELD_REF, 10], "Foo"]],
      { default: "Bar" },
    ],
  },
  aggregation: [["count"]],
};

test.describe("issues 34688 and 34690", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("shows time series footer when category breakout is before temporal breakout (metabase#34688)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        ...BASE_QUERY,
        breakout: [CUSTOM_COLUMN_BREAKOUT, CREATED_AT_BREAKOUT],
      },
    });
    await visitQuestion(page, id);

    await expect(page.getByTestId("timeseries-filter-button")).toBeVisible();
    await expect(page.getByTestId("timeseries-bucket-button")).toBeVisible();
  });

  test("shows time series footer when there is a category breakout (metabase#34690)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        ...BASE_QUERY,
        breakout: [CREATED_AT_BREAKOUT, CUSTOM_COLUMN_BREAKOUT],
      },
    });
    await visitQuestion(page, id);

    await expect(page.getByTestId("timeseries-filter-button")).toBeVisible();
    await expect(page.getByTestId("timeseries-bucket-button")).toBeVisible();
  });
});
