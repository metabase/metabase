/**
 * Playwright port of e2e/test/scenarios/filters/filter-bigint.cy.spec.ts
 * ("scenarios > filters > bigint (metabase#5816)").
 *
 * Port notes
 * ----------
 * - THE SUBJECT IS PRECISION. Every value here is outside the JS safe-integer
 *   range (`Number.MAX_SAFE_INTEGER` is 2^53-1; these are ±2^63). The FE keeps
 *   them as `bigint` (metabase/utils/number `parseNumber` → `BigInt(value)`)
 *   and the spec checks that no layer rounds them. So **no value in this port
 *   is ever put through `Number()`** — filter inputs are typed as strings,
 *   assertions compare strings, and the writable-DB rows are inserted as
 *   strings (see support/filter-bigint.ts). Row COUNTS are the only numbers.
 * - 5 of the 11 tests need the writable QA postgres container plus the
 *   `postgres-writable` snapshot (upstream's `setupTables()` /
 *   `@external` tags), so they are gated on PW_QA_DB_ENABLED (PORTING rule 6).
 *   The other 6 build their fixtures from native SQL against the sample DB and
 *   run on the bare jar.
 *   NB upstream tags the id-parameters test `{ tags: "external" }` — without
 *   the `@` the repo's grepTags filter never matches it, but its body calls
 *   `setupTables()` just like the `@external` ones, so it is gated here too.
 * - `H.filter({ mode: "notebook" })` → the shared `filterInNotebook`
 *   (support/metrics.ts) — same `action-buttons` + `.Icon-filter` click.
 * - `H.popover().eq(1)` is the Mantine Select dropdown that opens on top of the
 *   filter picker → `popover(page).nth(1)`. After picking an operator we assert
 *   the dropdown is gone (`toHaveCount(1)`) so the following `popover(page)`
 *   can't hit a strict-mode violation against a still-fading dropdown.
 * - `cy.type()` clicks its subject first (PORTING) — every input here is a real
 *   `<input>`, so the ports click and then `pressSequentially` (character by
 *   character, matching Cypress: `BigIntNumberInput` re-parses on every
 *   keystroke, so the intermediate states are part of what's exercised).
 * - `findByText(x)` with a string is exact in testing-library → `{ exact: true }`
 *   (rule 1). A bare Cypress `findByText` still asserts existence; ported as
 *   `toBeVisible()`.
 * - `H.filterWidget().icon("close")` — the close icon is hover-gated, so the
 *   ports hover the widget first (same as the shared `clearFilterWidget`).
 * - `H.downloadAndAssert` without a callback asserts only that the export
 *   request succeeds; our shared helper additionally parses the file. That is
 *   the shared helper's standing behaviour, not a change made here.
 */
import { expect, test } from "../support/fixtures";
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import { getDashboardCard } from "../support/dashboard";
import { addOrUpdateDashboardCard } from "../support/dashboard-management";
import { filterWidget } from "../support/dashboard-parameters";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import { downloadAndAssert } from "../support/downloads";
import {
  createDashboard,
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
  type NativeQuestionDetails,
} from "../support/factories";
import {
  BIGINT_PK_TABLE_NAME,
  DECIMAL_PK_TABLE_NAME,
  setupTables,
} from "../support/filter-bigint";
import { editDashboardCard } from "../support/filters-repros";
import { filterInNotebook } from "../support/metrics";
import { tableInteractive } from "../support/models";
import {
  assertQueryBuilderRowCount,
  enterCustomColumnDetails,
  getNotebookStep,
  openNotebook,
  queryBuilderMain,
  visualize,
} from "../support/notebook";
import {
  visitEmbeddedPage,
  visitPublicDashboard,
} from "../support/question-saved";
import { WRITABLE_DB_ID, getTableId } from "../support/schema-viewer";
import { visitPublicQuestion } from "../support/sharing";
import { getFieldId } from "../support/table-editing";
import {
  icon,
  modal,
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

const MIN_BIGINT_VALUE = "-9223372036854775808";
const FORMATTED_MIN_BIGINT_VALUE = "-9,223,372,036,854,775,808";
const MAX_BIGINT_VALUE = "9223372036854775807";
const FORMATTED_MAX_BIGINT_VALUE = "9,223,372,036,854,775,807";

const NEGATIVE_DECIMAL_VALUE = "-9223372036854775809";
const FORMATTED_NEGATIVE_DECIMAL_VALUE = "-9,223,372,036,854,775,809";
const POSITIVE_DECIMAL_VALUE = "9223372036854775808";
const FORMATTED_POSITIVE_DECIMAL_VALUE = "9,223,372,036,854,775,808";

const bigIntQuestionDetails: NativeQuestionDetails = {
  name: "SQL NUMBER",
  native: {
    query: `SELECT ${MIN_BIGINT_VALUE} AS NUMBER
UNION ALL
SELECT 0 AS NUMBER
UNION ALL
SELECT ${MAX_BIGINT_VALUE} AS NUMBER`,
    "template-tags": {},
  },
  display: "table",
};

const decimalQuestionDetails: NativeQuestionDetails = {
  name: "SQL NUMBER",
  native: {
    query: `SELECT CAST('${NEGATIVE_DECIMAL_VALUE}' AS DECIMAL) AS NUMBER
UNION ALL
SELECT CAST(0 AS DECIMAL) AS NUMBER
UNION ALL
SELECT CAST('${POSITIVE_DECIMAL_VALUE}' AS DECIMAL) AS NUMBER`,
    "template-tags": {},
  },
  display: "table",
};

const QA_DB_SKIP_REASON =
  "Requires the writable postgres QA container and the postgres-writable snapshot (set PW_QA_DB_ENABLED)";

/** Port of the module-level visitPublicQuestion() wrapper. */
async function visitPublicQuestionAsAdmin(
  page: Page,
  mb: { api: MetabaseApi; signOut(): Promise<void>; signInAsAdmin(): Promise<void> },
  questionId: number,
) {
  await mb.signInAsAdmin();
  await visitPublicQuestion(page, mb, questionId);
}

/** Port of the module-level visitEmbeddedQuestion(). */
async function visitEmbeddedQuestion(
  page: Page,
  mb: { api: MetabaseApi; signOut(): Promise<void> },
  questionId: number,
) {
  await visitEmbeddedPage(page, mb, {
    resource: { question: questionId },
    params: {},
  });
}

/** Port of the module-level visitPublicDashboard() wrapper. */
async function visitPublicDashboardAsAdmin(
  page: Page,
  mb: { api: MetabaseApi; signOut(): Promise<void>; signInAsAdmin(): Promise<void> },
  dashboardId: number,
) {
  await mb.signInAsAdmin();
  await visitPublicDashboard(page, mb, dashboardId);
}

/** Port of the module-level visitEmbeddedDashboard(). */
async function visitEmbeddedDashboard(
  page: Page,
  mb: { api: MetabaseApi; signOut(): Promise<void> },
  dashboardId: number,
) {
  await visitEmbeddedPage(page, mb, {
    resource: { dashboard: dashboardId },
    params: {},
  });
}

/**
 * Port of `H.filterWidget(...).icon("close").click()`. The close icon only
 * renders on hover, so the widget is hovered first (same as the shared
 * clearFilterWidget helper).
 */
async function clearFilterWidgetByName(page: Page, name?: string) {
  const widget = filterWidget(page, name != null ? { name } : {});
  await widget.hover();
  await icon(widget, "close").click();
}

test.describe("scenarios > filters > bigint (metabase#5816)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("query builder + mbql query", async ({ page, mb }) => {
    async function setupQuestion({
      sourceQuestionDetails,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
    }) {
      const card = await createNativeQuestion(mb.api, sourceQuestionDetails);
      const target = await createQuestion(mb.api, {
        name: "MBQL",
        query: { "source-table": `card__${card.id}` },
        display: "table",
      });
      await visitQuestion(page, target.id);
      await openNotebook(page);
    }

    async function testFilter({
      filterOperator,
      setFilterValue,
      filterDisplayName,
      filteredRowCount,
    }: {
      filterOperator: string;
      setFilterValue: () => Promise<void>;
      filterDisplayName: string;
      filteredRowCount: number;
    }) {
      // add a filter
      await filterInNotebook(page);
      await popover(page).getByText("NUMBER", { exact: true }).click();
      await popover(page)
        .getByLabel("Filter operator", { exact: true })
        .click();
      // H.popover().eq(1) — the operator Select dropdown, stacked on top of
      // the filter picker popover.
      await popover(page)
        .nth(1)
        .getByText(filterOperator, { exact: true })
        .click();
      // Settle: with the dropdown still mounted `popover(page)` matches two
      // elements and the calls below would be strict-mode violations.
      await expect(popover(page)).toHaveCount(1);

      await setFilterValue();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await expect(
        getNotebookStep(page, "filter").getByText(filterDisplayName, {
          exact: true,
        }),
      ).toBeVisible();
      await visualize(page);
      await assertQueryBuilderRowCount(page, filteredRowCount);

      // remove the filter
      await openNotebook(page);
      await icon(
        getNotebookStep(page, "filter").getByText(filterDisplayName, {
          exact: true,
        }),
        "close",
      ).click();
    }

    const typeInto = async (
      locatorFactory: () => ReturnType<Page["getByLabel"]>,
      value: string,
    ) => {
      const input = locatorFactory();
      // cy.type() clicks its subject first.
      await input.click();
      await input.pressSequentially(value);
      // NUMBER has field values, so the single-value case renders a
      // MultiAutocomplete (not the plain BigIntNumberInput). A real mousedown
      // on "Add filter" blurs it, the form re-renders, and no click event is
      // ever delivered — PORTING's batch-12 gotcha, observed here verbatim
      // (pill committed, popover still open). Blur explicitly first; harmless
      // for the plain Min/Max text inputs.
      await input.blur();
    };

    async function testFilters({
      sourceQuestionDetails,
      minValue,
      maxValue,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
      minValue: string;
      maxValue: string;
    }) {
      // setup
      await setupQuestion({ sourceQuestionDetails });

      const filterValueInput = () =>
        popover(page).getByLabel("Filter value", { exact: true });
      const minInput = () => popover(page).getByPlaceholder("Min", { exact: true });
      const maxInput = () => popover(page).getByPlaceholder("Max", { exact: true });

      // = operator
      await testFilter({
        filterOperator: "Equal to",
        setFilterValue: () => typeInto(filterValueInput, maxValue),
        filterDisplayName: `NUMBER is equal to ${maxValue}`,
        filteredRowCount: 1,
      });

      // != operator
      await testFilter({
        filterOperator: "Not equal to",
        setFilterValue: () => typeInto(filterValueInput, minValue),
        filterDisplayName: `NUMBER is not equal to ${minValue}`,
        filteredRowCount: 2,
      });

      // > operator
      await testFilter({
        filterOperator: "Greater than",
        setFilterValue: () => typeInto(filterValueInput, minValue),
        filterDisplayName: `NUMBER is greater than ${minValue}`,
        filteredRowCount: 2,
      });

      // >= operator
      await testFilter({
        filterOperator: "Greater than or equal to",
        setFilterValue: () => typeInto(filterValueInput, minValue),
        filterDisplayName: `NUMBER is greater than or equal to ${minValue}`,
        filteredRowCount: 3,
      });

      // < operator
      await testFilter({
        filterOperator: "Less than",
        setFilterValue: () => typeInto(filterValueInput, maxValue),
        filterDisplayName: `NUMBER is less than ${maxValue}`,
        filteredRowCount: 2,
      });

      // <= operator
      await testFilter({
        filterOperator: "Less than or equal to",
        setFilterValue: () => typeInto(filterValueInput, maxValue),
        filterDisplayName: `NUMBER is less than or equal to ${maxValue}`,
        filteredRowCount: 3,
      });

      // between operator - min value
      await testFilter({
        filterOperator: "Between",
        setFilterValue: async () => {
          await typeInto(minInput, minValue);
          await typeInto(maxInput, "0");
        },
        filterDisplayName: `NUMBER is between ${minValue} and 0`,
        filteredRowCount: 2,
      });

      // between operator - max value
      await testFilter({
        filterOperator: "Between",
        setFilterValue: async () => {
          await typeInto(minInput, "0");
          await typeInto(maxInput, maxValue);
        },
        filterDisplayName: `NUMBER is between 0 and ${maxValue}`,
        filteredRowCount: 2,
      });

      // between operator - min and max values
      await testFilter({
        filterOperator: "Between",
        setFilterValue: async () => {
          await typeInto(minInput, minValue);
          await typeInto(maxInput, maxValue);
        },
        filterDisplayName: `NUMBER is between ${minValue} and ${maxValue}`,
        filteredRowCount: 3,
      });
    }

    // BIGINT
    await testFilters({
      sourceQuestionDetails: bigIntQuestionDetails,
      minValue: MIN_BIGINT_VALUE,
      maxValue: MAX_BIGINT_VALUE,
    });

    // DECIMAL
    await testFilters({
      sourceQuestionDetails: decimalQuestionDetails,
      minValue: NEGATIVE_DECIMAL_VALUE,
      maxValue: POSITIVE_DECIMAL_VALUE,
    });
  });

  test("dashboards + mbql query + id parameters", async ({ page, mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
    test.slow();

    let dashboardId = 0;

    async function setupDashboard({
      tableName,
      baseType,
    }: {
      tableName: string;
      baseType: string;
    }) {
      const parameterDetails = {
        id: "b6ed2d71",
        type: "id",
        name: "ID",
        slug: "id",
        sectionId: "id",
      };

      const tableId = await getTableId(mb.api, { name: tableName });
      const fieldId = await getFieldId(mb.api, { tableId, name: "id" });

      const card = await createQuestion(mb.api, {
        name: "MBQL",
        database: WRITABLE_DB_ID,
        query: {
          "source-table": tableId,
          aggregation: [["count"]],
        },
        display: "scalar",
      });
      const dashboard = await createDashboard(mb.api, {
        name: "Dashboard",
        parameters: [parameterDetails],
        enable_embedding: true,
        embedding_params: { [parameterDetails.slug]: "enabled" },
      });
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashboard.id,
        card_id: card.id,
        card: {
          parameter_mappings: [
            {
              parameter_id: parameterDetails.id,
              card_id: card.id,
              target: ["dimension", ["field", fieldId, { "base-type": baseType }]],
            },
          ],
        },
      });
      dashboardId = dashboard.id;
      await visitDashboard(page, mb.api, dashboard.id);
    }

    async function testFilter({
      value,
      withDrillThru,
    }: {
      value: string;
      withDrillThru?: boolean;
    }) {
      // add a filter
      await expect(
        getDashboardCard(page).getByTestId("scalar-value"),
      ).toHaveText("3");
      await filterWidget(page).click();
      const idInput = popover(page).getByPlaceholder("Enter an ID", {
        exact: true,
      });
      await idInput.click();
      await idInput.pressSequentially(value);
      // Blur before clicking: the ID widget is a MultiAutocomplete, and a real
      // mousedown on the button blurs it, re-rendering the form so no click is
      // ever delivered (PORTING, batch-12). Cypress never hit this because its
      // click dispatches at the already-resolved element.
      await idInput.blur();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      await expect(
        getDashboardCard(page).getByTestId("scalar-value"),
      ).toHaveText("1");

      if (withDrillThru) {
        // drill-thru
        await getDashboardCard(page).getByText("MBQL", { exact: true }).click();
        await expect(
          queryBuilderFiltersPanel(page).getByText(`ID is ${value}`, {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          queryBuilderMain(page).getByTestId("scalar-value"),
        ).toHaveText("1");
        await queryBuilderHeader(page)
          .getByLabel("Back to Dashboard", { exact: true })
          .click();
      }

      await clearFilterWidgetByName(page);
    }

    async function testBigIntFilters({
      withDrillThru,
    }: { withDrillThru?: boolean } = {}) {
      await testFilter({ value: MIN_BIGINT_VALUE, withDrillThru });
      await testFilter({ value: MAX_BIGINT_VALUE, withDrillThru });
    }

    async function testDecimalFilters({
      withDrillThru,
    }: { withDrillThru?: boolean } = {}) {
      await testFilter({ value: NEGATIVE_DECIMAL_VALUE, withDrillThru });
      await testFilter({ value: POSITIVE_DECIMAL_VALUE, withDrillThru });
    }

    // create tables
    await setupTables(mb);

    // BIGINT
    await mb.signInAsAdmin();
    await setupDashboard({
      tableName: BIGINT_PK_TABLE_NAME,
      baseType: "type/BigInteger",
    });
    await testBigIntFilters({ withDrillThru: true });
    await visitPublicDashboardAsAdmin(page, mb, dashboardId);
    await testBigIntFilters();
    await visitEmbeddedDashboard(page, mb, dashboardId);
    await testBigIntFilters();

    // DECIMAL
    await mb.signInAsAdmin();
    await setupDashboard({
      tableName: DECIMAL_PK_TABLE_NAME,
      baseType: "type/Decimal",
    });
    await testDecimalFilters({ withDrillThru: true });
    await visitPublicDashboardAsAdmin(page, mb, dashboardId);
    await testDecimalFilters();
    await visitEmbeddedDashboard(page, mb, dashboardId);
    await testDecimalFilters();
  });

  test("dashboards + mbql query + number parameters", async ({ page, mb }) => {
    test.slow();

    let dashboardId = 0;

    const parameters = [
      {
        id: "b6ed2d71",
        type: "number/=",
        name: "Equal to",
        slug: "equal-to",
        sectionId: "number",
      },
      {
        id: "b6ed2d72",
        type: "number/!=",
        name: "Not equal to",
        slug: "not-equal=to",
        sectionId: "number",
      },
      {
        id: "b6ed2d73",
        type: "number/>=",
        name: "Greater than or equal to",
        slug: "greater-than-or-equal-to",
        sectionId: "number",
      },
      {
        id: "b6ed2d74",
        type: "number/<=",
        name: "Less than or equal to",
        slug: "less-than-or-equal-to",
        sectionId: "number",
      },
      {
        id: "b6ed2d75",
        type: "number/between",
        name: "Between",
        slug: "between",
        sectionId: "number",
      },
    ];

    async function setupDashboard({
      sourceQuestionDetails,
      baseType,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
      baseType: string;
    }) {
      await mb.signInAsAdmin();
      const sourceCard = await createNativeQuestion(
        mb.api,
        sourceQuestionDetails,
      );
      const targetCard = await createQuestion(mb.api, {
        name: "MBQL",
        query: {
          "source-table": `card__${sourceCard.id}`,
          aggregation: [["count"]],
        },
        display: "scalar",
      });
      const dashboard = await createDashboard(mb.api, {
        name: "Dashboard",
        parameters,
        enable_embedding: true,
        embedding_params: Object.fromEntries(
          parameters.map((parameter) => [parameter.slug, "enabled"]),
        ),
      });
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashboard.id,
        card_id: targetCard.id,
        card: {
          parameter_mappings: parameters.map((parameter) => ({
            parameter_id: parameter.id,
            card_id: targetCard.id,
            target: [
              "dimension",
              ["field", "NUMBER", { "base-type": baseType }],
            ],
          })),
        },
      });
      dashboardId = dashboard.id;
    }

    async function testFilter({
      parameterName,
      setParameterValue,
      filterDisplayName,
      filterArgsDisplayName,
      filteredRowCount,
      withDrillThru,
    }: {
      parameterName: string;
      setParameterValue: () => Promise<void>;
      filterDisplayName: string;
      filterArgsDisplayName: string;
      filteredRowCount: number;
      withDrillThru?: boolean;
    }) {
      // add a filter
      await expect(
        getDashboardCard(page).getByTestId("scalar-value"),
      ).toHaveText("3");
      await filterWidget(page, { name: parameterName }).click();
      await setParameterValue();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      await expect(
        filterWidget(page, { name: parameterName }).getByText(
          filterArgsDisplayName,
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByTestId("scalar-value"),
      ).toHaveText(String(filteredRowCount));

      if (withDrillThru) {
        // drill-thru
        await getDashboardCard(page).getByText("MBQL", { exact: true }).click();
        await expect(
          queryBuilderFiltersPanel(page).getByText(filterDisplayName, {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          queryBuilderMain(page).getByTestId("scalar-value"),
        ).toHaveText(String(filteredRowCount));
        await queryBuilderHeader(page)
          .getByLabel("Back to Dashboard", { exact: true })
          .click();
      }

      await clearFilterWidgetByName(page, parameterName);
    }

    const typeNumber = async (index: number, value: string) => {
      const input = popover(page)
        .getByPlaceholder("Enter a number", { exact: true })
        .nth(index);
      await input.click();
      await input.pressSequentially(value);
    };

    async function testFilters({
      minValue,
      maxValue,
      formattedMinValue,
      formattedMaxValue,
      withDrillThru,
    }: {
      minValue: string;
      maxValue: string;
      formattedMinValue: string;
      formattedMaxValue: string;
      withDrillThru?: boolean;
    }) {
      // number/= parameter
      await testFilter({
        parameterName: "Equal to",
        setParameterValue: () => typeNumber(0, maxValue),
        filterDisplayName: `NUMBER is equal to ${maxValue}`,
        filterArgsDisplayName: formattedMaxValue,
        filteredRowCount: 1,
        withDrillThru,
      });

      // number/!= parameter
      await testFilter({
        parameterName: "Not equal to",
        setParameterValue: () => typeNumber(0, minValue),
        filterDisplayName: `NUMBER is not equal to ${minValue}`,
        filterArgsDisplayName: formattedMinValue,
        filteredRowCount: 2,
        withDrillThru,
      });

      // number/>= parameter
      await testFilter({
        parameterName: "Greater than or equal to",
        setParameterValue: () => typeNumber(0, minValue),
        filterDisplayName: `NUMBER is greater than or equal to ${minValue}`,
        filterArgsDisplayName: formattedMinValue,
        filteredRowCount: 3,
        withDrillThru,
      });

      // number/<= parameter
      await testFilter({
        parameterName: "Less than or equal to",
        setParameterValue: () => typeNumber(0, maxValue),
        filterDisplayName: `NUMBER is less than or equal to ${maxValue}`,
        filterArgsDisplayName: formattedMaxValue,
        filteredRowCount: 3,
        withDrillThru,
      });

      // number/between parameter - min value
      await testFilter({
        parameterName: "Between",
        setParameterValue: async () => {
          await typeNumber(0, minValue);
          await typeNumber(1, "0");
        },
        filterDisplayName: `NUMBER is between ${minValue} and 0`,
        filterArgsDisplayName: "2 selections",
        filteredRowCount: 2,
        withDrillThru,
      });

      // number/between parameter - max value
      await testFilter({
        parameterName: "Between",
        setParameterValue: async () => {
          await typeNumber(0, "0");
          await typeNumber(1, maxValue);
        },
        filterDisplayName: `NUMBER is between 0 and ${maxValue}`,
        filterArgsDisplayName: "2 selections",
        filteredRowCount: 2,
        withDrillThru,
      });

      // number/between parameter - min and max values
      await testFilter({
        parameterName: "Between",
        setParameterValue: async () => {
          await typeNumber(0, minValue);
          await typeNumber(1, maxValue);
        },
        filterDisplayName: `NUMBER is between ${minValue} and ${maxValue}`,
        filterArgsDisplayName: "2 selections",
        filteredRowCount: 3,
        withDrillThru,
      });
    }

    const testBigIntFilters = ({
      withDrillThru,
    }: { withDrillThru?: boolean } = {}) =>
      testFilters({
        minValue: MIN_BIGINT_VALUE,
        maxValue: MAX_BIGINT_VALUE,
        formattedMinValue: FORMATTED_MIN_BIGINT_VALUE,
        formattedMaxValue: FORMATTED_MAX_BIGINT_VALUE,
        withDrillThru,
      });

    const testDecimalFilters = ({
      withDrillThru,
    }: { withDrillThru?: boolean } = {}) =>
      testFilters({
        minValue: NEGATIVE_DECIMAL_VALUE,
        maxValue: POSITIVE_DECIMAL_VALUE,
        formattedMinValue: FORMATTED_NEGATIVE_DECIMAL_VALUE,
        formattedMaxValue: FORMATTED_POSITIVE_DECIMAL_VALUE,
        withDrillThru,
      });

    // BIGINT
    await mb.signInAsAdmin();
    await setupDashboard({
      sourceQuestionDetails: bigIntQuestionDetails,
      baseType: "type/BigInteger",
    });
    await mb.signInAsNormalUser();
    await visitDashboard(page, mb.api, dashboardId);
    await testBigIntFilters({ withDrillThru: true });
    await visitPublicDashboardAsAdmin(page, mb, dashboardId);
    await testBigIntFilters();
    await visitEmbeddedDashboard(page, mb, dashboardId);
    await testBigIntFilters();

    // DECIMAL
    await mb.signInAsAdmin();
    await setupDashboard({
      sourceQuestionDetails: decimalQuestionDetails,
      baseType: "type/Decimal",
    });
    await mb.signInAsNormalUser();
    await visitDashboard(page, mb.api, dashboardId);
    await testDecimalFilters({ withDrillThru: true });
    await visitPublicDashboardAsAdmin(page, mb, dashboardId);
    await testDecimalFilters();
    await visitEmbeddedDashboard(page, mb, dashboardId);
    await testDecimalFilters();
  });

  test("query builder + native query + variables", async ({ page, mb }) => {
    let questionId = 0;

    async function setupQuestion({
      sourceQuestionDetails,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
    }) {
      const card = await createNativeQuestion(mb.api, sourceQuestionDetails);
      const cardId = card.id;
      const cardTagName = `#${cardId}-sql-number`;
      const cardTagDisplayName = `#${cardId} Sql Number`;

      const parameterDetails = {
        id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
        type: "number/=",
        target: ["variable", ["template-tag", "number"]],
        name: "Number",
        slug: "number",
      };

      const target = await createNativeQuestion(mb.api, {
        name: "SQL",
        display: "scalar",
        native: {
          query: `SELECT COUNT(*) FROM {{#${cardId}-sql-number}} [[WHERE NUMBER = {{number}}]]`,
          "template-tags": {
            [cardTagName]: {
              id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
              name: cardTagName,
              "display-name": cardTagDisplayName,
              type: "card",
              "card-id": cardId,
            },
            number: {
              id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
              name: "number",
              "display-name": "Number",
              type: "number",
            },
          },
        },
        parameters: [parameterDetails],
        enable_embedding: true,
        embedding_params: { [parameterDetails.slug]: "enabled" },
      });
      questionId = target.id;
    }

    async function testFilter({
      value,
      withRunButton,
    }: {
      value: string;
      withRunButton?: boolean;
    }) {
      // add a filter
      await expect(page.getByTestId("scalar-value")).toHaveText("3");
      const textbox = filterWidget(page).getByRole("textbox");
      await textbox.click();
      await textbox.pressSequentially(value);
      await textbox.blur();
      if (withRunButton) {
        await page.getByTestId("run-button").first().click();
      }
      await expect(filterWidget(page).getByRole("textbox")).toHaveValue(value);
      await expect(page.getByTestId("scalar-value")).toHaveText("1");
    }

    // BIGINT
    await mb.signInAsAdmin();
    await setupQuestion({ sourceQuestionDetails: bigIntQuestionDetails });
    await mb.signInAsNormalUser();
    await visitQuestion(page, questionId);
    await testFilter({ value: MAX_BIGINT_VALUE, withRunButton: true });
    await visitPublicQuestionAsAdmin(page, mb, questionId);
    await testFilter({ value: MAX_BIGINT_VALUE });
    await visitEmbeddedQuestion(page, mb, questionId);
    await testFilter({ value: MAX_BIGINT_VALUE });

    // DECIMAL
    await mb.signInAsAdmin();
    await setupQuestion({ sourceQuestionDetails: decimalQuestionDetails });
    await mb.signInAsNormalUser();
    await visitQuestion(page, questionId);
    await testFilter({ value: NEGATIVE_DECIMAL_VALUE, withRunButton: true });
    await visitPublicQuestionAsAdmin(page, mb, questionId);
    await testFilter({ value: NEGATIVE_DECIMAL_VALUE });
    await visitEmbeddedQuestion(page, mb, questionId);
    await testFilter({ value: NEGATIVE_DECIMAL_VALUE });
  });

  test("dashboards + native query + variables", async ({ page, mb }) => {
    let dashboardId = 0;

    const parameterDetails = {
      id: "b6ed2d71",
      type: "number/=",
      name: "Number",
      slug: "number",
      sectionId: "number",
    };

    async function setupDashboard({
      sourceQuestionDetails,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
    }) {
      const card = await createNativeQuestion(mb.api, sourceQuestionDetails);
      const cardId = card.id;
      const cardTagName = `#${cardId}-sql-number`;
      const cardTagDisplayName = `#${cardId} Sql Number`;

      const result = await createNativeQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "SQL",
          native: {
            query: `SELECT COUNT(*) FROM {{#${cardId}-sql-number}} [[WHERE NUMBER = {{number}}]]`,
            "template-tags": {
              [cardTagName]: {
                id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
                name: cardTagName,
                "display-name": cardTagDisplayName,
                type: "card",
                "card-id": cardId,
              },
              number: {
                id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
                name: "number",
                "display-name": "Number",
                type: "number",
              },
            },
          },
          display: "scalar",
        },
        dashboardDetails: {
          name: "Dashboard",
          parameters: [parameterDetails],
          enable_embedding: true,
          embedding_params: { [parameterDetails.slug]: "enabled" },
        },
      });

      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: result.dashboard_id,
        card_id: result.questionId,
        card: {
          parameter_mappings: [
            {
              card_id: result.questionId,
              parameter_id: parameterDetails.id,
              target: ["variable", ["template-tag", "number"]],
            },
          ],
        },
      });
      dashboardId = result.dashboard_id;
    }

    async function testFilter({
      value,
      withDrillThru,
    }: {
      value: string;
      withDrillThru?: boolean;
    }) {
      // add a filter
      await expect(
        getDashboardCard(page).getByTestId("scalar-value"),
      ).toHaveText("3");
      const textbox = filterWidget(page).getByRole("textbox");
      await textbox.click();
      await textbox.pressSequentially(value);
      await textbox.blur();
      await expect(filterWidget(page).getByRole("textbox")).toHaveValue(value);
      await expect(
        getDashboardCard(page).getByTestId("scalar-value"),
      ).toHaveText("1");

      if (withDrillThru) {
        // drill-thru
        await getDashboardCard(page).getByText("SQL", { exact: true }).click();
        await expect(
          queryBuilderMain(page).getByTestId("scalar-value"),
        ).toHaveText("1");
        await expect(filterWidget(page).getByRole("textbox")).toHaveValue(
          value,
        );
        await queryBuilderHeader(page)
          .getByLabel("Back to Dashboard", { exact: true })
          .click();
      }

      await clearFilterWidgetByName(page);
    }

    // BIGINT
    await mb.signInAsAdmin();
    await setupDashboard({ sourceQuestionDetails: bigIntQuestionDetails });
    await mb.signInAsNormalUser();
    await visitDashboard(page, mb.api, dashboardId);
    await testFilter({ value: MAX_BIGINT_VALUE, withDrillThru: true });
    await visitPublicDashboardAsAdmin(page, mb, dashboardId);
    await testFilter({ value: MAX_BIGINT_VALUE });
    await visitEmbeddedDashboard(page, mb, dashboardId);
    await testFilter({ value: MAX_BIGINT_VALUE });

    // DECIMAL
    await mb.signInAsAdmin();
    await setupDashboard({ sourceQuestionDetails: decimalQuestionDetails });
    await mb.signInAsNormalUser();
    await visitDashboard(page, mb.api, dashboardId);
    await testFilter({ value: POSITIVE_DECIMAL_VALUE, withDrillThru: true });
    await visitPublicDashboardAsAdmin(page, mb, dashboardId);
    await testFilter({ value: POSITIVE_DECIMAL_VALUE });
    await visitEmbeddedDashboard(page, mb, dashboardId);
    await testFilter({ value: POSITIVE_DECIMAL_VALUE });
  });

  test("query builder + native query + field filters", async ({ page, mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
    test.slow();

    let questionId = 0;

    async function setupQuestion({
      tableName,
      baseType,
    }: {
      tableName: string;
      baseType: string;
    }) {
      const tableId = await getTableId(mb.api, { name: tableName });
      const fieldId = await getFieldId(mb.api, { tableId, name: "id" });

      const parameterDetails = {
        id: "0dcd2f82-2e7d-4989-9362-5c94744a6585",
        name: "ID",
        slug: "id",
        type: "id",
        target: ["dimension", ["template-tag", "id"]],
      };

      const card = await createNativeQuestion(mb.api, {
        name: "SQL",
        display: "scalar",
        database: WRITABLE_DB_ID,
        native: {
          query: `SELECT COUNT(*) FROM ${tableName} WHERE {{id}}`,
          "template-tags": {
            id: {
              id: parameterDetails.id,
              name: "id",
              "display-name": "ID",
              type: "dimension",
              dimension: ["field", fieldId, { "base-type": baseType }],
              "widget-type": "id",
            },
          },
        },
        parameters: [parameterDetails],
        enable_embedding: true,
        embedding_params: { [parameterDetails.slug]: "enabled" },
      });
      questionId = card.id;
    }

    async function testFilter({
      value,
      withRunButton,
    }: {
      value: string;
      withRunButton?: boolean;
    }) {
      // add a filter
      await expect(page.getByTestId("scalar-value")).toHaveText("3");
      await filterWidget(page).click();
      const idInput = popover(page).getByPlaceholder("Enter an ID", {
        exact: true,
      });
      await idInput.click();
      await idInput.pressSequentially(value);
      // See the MultiAutocomplete blur note on the id-parameters test.
      await idInput.blur();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      if (withRunButton) {
        await page.getByTestId("run-button").first().click();
      }
      await expect(page.getByTestId("scalar-value")).toHaveText("1");
    }

    // create tables
    await setupTables(mb);

    // BIGINT
    await mb.signInAsAdmin();
    await setupQuestion({
      tableName: BIGINT_PK_TABLE_NAME,
      baseType: "type/BigInteger",
    });
    await visitQuestion(page, questionId);
    await testFilter({ value: MAX_BIGINT_VALUE, withRunButton: true });
    await visitPublicQuestionAsAdmin(page, mb, questionId);
    await testFilter({ value: MAX_BIGINT_VALUE });
    await visitEmbeddedQuestion(page, mb, questionId);
    await testFilter({ value: MAX_BIGINT_VALUE });

    // DECIMAL
    await mb.signInAsAdmin();
    await setupQuestion({
      tableName: DECIMAL_PK_TABLE_NAME,
      baseType: "type/Decimal",
    });
    await visitQuestion(page, questionId);
    await testFilter({ value: NEGATIVE_DECIMAL_VALUE, withRunButton: true });
    await visitPublicQuestionAsAdmin(page, mb, questionId);
    await testFilter({ value: NEGATIVE_DECIMAL_VALUE });
    await visitEmbeddedQuestion(page, mb, questionId);
    await testFilter({ value: NEGATIVE_DECIMAL_VALUE });
  });

  test("query builder + expression editor", async ({ page, mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
    test.slow();

    async function setupQuestion({ tableName }: { tableName: string }) {
      const tableId = await getTableId(mb.api, { name: tableName });
      const card = await createQuestion(mb.api, {
        database: WRITABLE_DB_ID,
        query: { "source-table": tableId },
      });
      await visitQuestion(page, card.id);
    }

    async function testExpression({ value }: { value: string }) {
      await assertQueryBuilderRowCount(page, 3);

      await openNotebook(page);
      await getNotebookStep(page, "data")
        .getByRole("button", { name: "Filter", exact: true })
        .click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await enterCustomColumnDetails(page, { formula: `[ID] = ${value}` });
      await page
        .getByRole("button", { name: "Done", exact: true })
        .click();
      await visualize(page);
      await assertQueryBuilderRowCount(page, 1);

      await openNotebook(page);
      await getNotebookStep(page, "filter")
        .getByText(`ID is ${value}`, { exact: true })
        .click();
      await popover(page).getByLabel("Back", { exact: true }).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await enterCustomColumnDetails(page, { formula: `[ID] != ${value}` });
      await page
        .getByRole("button", { name: "Update", exact: true })
        .click();
      await visualize(page);
      await assertQueryBuilderRowCount(page, 2);
    }

    // setup
    await setupTables(mb);

    // BIGINT
    await setupQuestion({ tableName: BIGINT_PK_TABLE_NAME });
    await testExpression({ value: MAX_BIGINT_VALUE });

    // DECIMAL
    await setupQuestion({ tableName: DECIMAL_PK_TABLE_NAME });
    await testExpression({ value: NEGATIVE_DECIMAL_VALUE });
  });

  test("query builder + object detail", async ({ page, mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
    test.slow();

    async function setupQuestion({ tableName }: { tableName: string }) {
      const tableId = await getTableId(mb.api, { name: tableName });
      const card = await createQuestion(mb.api, {
        database: WRITABLE_DB_ID,
        query: { "source-table": tableId },
      });
      await visitQuestion(page, card.id);
    }

    async function testObjectDetail({
      idValue,
      nameValue,
    }: {
      idValue: string;
      nameValue: string;
    }) {
      await tableInteractive(page).getByText(idValue, { exact: true }).click();
      const dialog = modal(page);
      await expect(
        dialog.getByText(idValue, { exact: true }),
      ).not.toHaveCount(0);
      await expect(
        dialog.getByText(nameValue, { exact: true }),
      ).not.toHaveCount(0);
    }

    // setup
    await setupTables(mb);

    // BIGINT
    await setupQuestion({ tableName: BIGINT_PK_TABLE_NAME });
    await testObjectDetail({ idValue: MAX_BIGINT_VALUE, nameValue: "Positive" });

    // DECIMAL
    await setupQuestion({ tableName: DECIMAL_PK_TABLE_NAME });
    await testObjectDetail({
      idValue: NEGATIVE_DECIMAL_VALUE,
      nameValue: "Negative",
    });
  });

  test("query builder + drills", async ({ page, mb }) => {
    async function setupQuestion({
      sourceQuestionDetails,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
    }) {
      const card = await createNativeQuestion(mb.api, sourceQuestionDetails);
      const target = await createQuestion(mb.api, {
        name: "MBQL",
        query: { "source-table": `card__${card.id}` },
        display: "table",
      });
      await visitQuestion(page, target.id);
    }

    async function testDrill({
      value,
      formattedValue,
    }: {
      value: string;
      formattedValue: string;
    }) {
      await assertQueryBuilderRowCount(page, 3);
      await tableInteractive(page)
        .getByText(formattedValue, { exact: true })
        .click();
      await popover(page).getByText("=", { exact: true }).click();
      await expect(
        queryBuilderFiltersPanel(page).getByText(
          `NUMBER is equal to ${value}`,
          { exact: true },
        ),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 1);
    }

    // BIGINT
    await setupQuestion({ sourceQuestionDetails: bigIntQuestionDetails });
    await testDrill({
      value: MAX_BIGINT_VALUE,
      formattedValue: FORMATTED_MAX_BIGINT_VALUE,
    });

    // DECIMAL
    await setupQuestion({ sourceQuestionDetails: decimalQuestionDetails });
    await testDrill({
      value: NEGATIVE_DECIMAL_VALUE,
      formattedValue: FORMATTED_NEGATIVE_DECIMAL_VALUE,
    });
  });

  test("query builder + export", async ({ page, mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
    test.slow();

    let questionId = 0;

    async function setupTableQuestion({ tableName }: { tableName: string }) {
      const tableId = await getTableId(mb.api, { name: tableName });
      const card = await createQuestion(mb.api, {
        name: "MBQL",
        database: WRITABLE_DB_ID,
        query: { "source-table": tableId },
        display: "table",
      });
      questionId = card.id;
      await visitQuestion(page, card.id);
    }

    async function setupNestedQuestion({
      sourceQuestionDetails,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
    }) {
      const source = await createNativeQuestion(mb.api, sourceQuestionDetails);
      const card = await createQuestion(mb.api, {
        name: "MBQL",
        query: { "source-table": `card__${source.id}` },
        display: "table",
      });
      questionId = card.id;
      await visitQuestion(page, card.id);
    }

    async function testExport() {
      await downloadAndAssert(page, {
        fileType: "csv",
        questionId,
        isDashboard: false,
        enableFormatting: true,
      });
    }

    // setup
    await setupTables(mb);

    // BIGINT
    await setupTableQuestion({ tableName: BIGINT_PK_TABLE_NAME });
    await testExport();
    await setupNestedQuestion({ sourceQuestionDetails: bigIntQuestionDetails });
    await testExport();

    // DECIMAL
    await setupTableQuestion({ tableName: DECIMAL_PK_TABLE_NAME });
    await testExport();
    await setupNestedQuestion({
      sourceQuestionDetails: decimalQuestionDetails,
    });
    await testExport();
  });

  test("dashboards + click behavior", async ({ page, mb }) => {
    async function setupDashboard({
      sourceQuestionDetails,
      baseType,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
      baseType: string;
    }) {
      const parameterDetails = {
        id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
        type: "number/=",
        target: ["dimension", ["field", "NUMBER", { "base-type": baseType }]],
        name: "Number",
        slug: "number",
      };

      const vizSettings = {
        column_settings: {
          '["name","NUMBER"]': {
            click_behavior: {
              type: "crossfilter",
              parameterMapping: {
                [parameterDetails.id]: {
                  id: parameterDetails.id,
                  source: { id: "NUMBER", name: "NUMBER", type: "column" },
                  target: { id: parameterDetails.id, type: "parameter" },
                },
              },
            },
          },
        },
      };

      const card = await createNativeQuestion(mb.api, sourceQuestionDetails);
      const result = await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "MBQL",
          query: { "source-table": `card__${card.id}` },
          display: "table",
        },
        dashboardDetails: { parameters: [parameterDetails] },
      });

      await editDashboardCard(mb.api, result, {
        parameter_mappings: [
          {
            card_id: result.questionId,
            parameter_id: parameterDetails.id,
            target: [
              "dimension",
              ["field", "NUMBER", { "base-type": baseType }],
            ],
          },
        ],
        visualization_settings: vizSettings,
      });

      await visitDashboard(page, mb.api, result.dashboard_id);
    }

    async function testClickBehavior({
      formattedMinValue,
      formattedMaxValue,
    }: {
      formattedMinValue: string;
      formattedMaxValue: string;
    }) {
      const dashcard = getDashboardCard(page);
      await expect(dashcard.getByText("0", { exact: true })).toBeVisible();
      await expect(
        dashcard.getByText(formattedMinValue, { exact: true }),
      ).toBeVisible();
      await dashcard.getByText(formattedMaxValue, { exact: true }).click();

      await expect(
        filterWidget(page).getByText(formattedMaxValue, { exact: true }),
      ).toBeVisible();

      // Anti-vacuity anchor (not in the original): the dashcard re-queries
      // after the crossfilter, and `toHaveCount(0)` below would be satisfied by
      // "nothing has re-rendered yet". Gate on the card having finished
      // loading before asserting the min value is gone.
      await expect(
        page
          .getByTestId("dashboard-parameters-and-cards")
          .getByTestId("loading-indicator"),
      ).toHaveCount(0);

      await expect(
        dashcard.getByText(formattedMinValue, { exact: true }),
      ).toHaveCount(0);
      await expect(
        dashcard.getByText(formattedMaxValue, { exact: true }),
      ).toBeVisible();
    }

    // BIGINT
    await setupDashboard({
      sourceQuestionDetails: bigIntQuestionDetails,
      baseType: "type/BigInteger",
    });
    await testClickBehavior({
      formattedMinValue: FORMATTED_MIN_BIGINT_VALUE,
      formattedMaxValue: FORMATTED_MAX_BIGINT_VALUE,
    });

    // DECIMAL
    await setupDashboard({
      sourceQuestionDetails: decimalQuestionDetails,
      baseType: "type/Decimal",
    });
    await testClickBehavior({
      formattedMinValue: FORMATTED_NEGATIVE_DECIMAL_VALUE,
      formattedMaxValue: FORMATTED_POSITIVE_DECIMAL_VALUE,
    });
  });
});
