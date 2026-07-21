/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/data-model/source-replacement.cy.spec.ts
 *
 * @external — the whole spec restores the `postgres-writable` snapshot and
 * creates/drops its own tables in the writable QA postgres container
 * (H.queryWritableDB + resyncDatabase on WRITABLE_DB_ID). Gated on
 * PW_QA_DB_ENABLED (the deliberate gate; bare QA_DB_ENABLED leaks truthy from
 * cypress.env.json). Also needs the bleeding-edge token — source replacement is
 * an EE feature.
 *
 * Port notes:
 * - The two beforeEach `cy.intercept(...).as(...)` aliases become
 *   `page.waitForResponse` registrations at the true trigger points (rule 2):
 *   `@dependents` before the click that OPENS the replacement modal,
 *   `@replaceSource` before the confirmation-dialog click. `confirmReplacement`
 *   therefore RETURNS the pending replaceSource response and
 *   `waitForReplacementToComplete` consumes it, keeping the upstream two-call
 *   structure at every call site.
 * - `H.DataModel.visitDataStudioSegments/Measures` hardcode SAMPLE_DB_ID in the
 *   shared port modules, so `support/source-replacement.ts` carries
 *   database-parameterised copies for the writable DB.
 * - `cy.get("@alias")` aliases for created entities / table ids become plain
 *   awaited values.
 * - The absence assertions (`H.main().findByText(SOURCE_ROW_VALUE)
 *   .should("not.exist")`) port as retrying `toHaveCount(0)` — the equivalent
 *   form — and are anchored on the positive `assertTargetRowVisible()` that
 *   precedes them in the original, which is what proves the result grid
 *   actually rendered.
 * - `H.DataModel.SegmentList.get().should("not.contain", ...)` keeps Cypress's
 *   implicit existence assertion on the list as an explicit `toBeVisible()`
 *   anchor before the negated containment check.
 */
import type { Page, Response } from "@playwright/test";

import { type MetabaseApi, resolveToken } from "../support/api";
import { toggleFilterWidgetValues } from "../support/dashboard-card-repros";
import { addOrUpdateDashboardCard } from "../support/dashboard-management";
import { COLLECTION_GROUP, sandboxTable } from "../support/dashboard-repros";
import { filterWidget } from "../support/dashboard";
import { TablePicker, TableSection, visitDataModel } from "../support/data-model";
import {
  DependencyGraph,
  createTransform,
  waitForBackfillComplete,
} from "../support/dependency-graph";
import {
  createDashboard,
  createNativeQuestion,
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { createSegment } from "../support/filter-bulk";
import { expect, test } from "../support/fixtures";
import { MeasureList, createMeasure } from "../support/measures-data-studio";
import { visitMetric } from "../support/metrics";
import { createSnippet } from "../support/native-extras";
import { entityPickerModal, openNotebook } from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import {
  WRITABLE_DB_ID,
  getTableId as getTableIdFor,
  queryWritableDB,
  resyncDatabase,
  tableSectionActionsMenuButton,
} from "../support/schema-viewer";
import { SegmentList } from "../support/segments-data-studio";
import {
  SourceReplacement,
  visitDataStudioMeasures,
  visitDataStudioSegments,
  visitTransform,
  waitForDependents,
  waitForReplaceSource,
} from "../support/source-replacement";
import { getFieldId } from "../support/table-editing";
import { main, popover, visitDashboard, visitQuestion } from "../support/ui";

type ConcreteFieldReference = [
  "field",
  number | string,
  Record<string, unknown> | null,
];

const SOURCE_TABLE = "source_table";
const COMPATIBLE_TARGET = "compatible_target";
const TARGET_EXTRA_COLUMNS = "target_extra_columns";
const TARGET_TYPE_MISMATCH = "target_type_mismatch";
const TARGET_MISSING_COLUMN = "target_missing_column";
const CHILD_TABLE = "child_table";

const ALL_TABLES = [
  SOURCE_TABLE,
  COMPATIBLE_TARGET,
  TARGET_EXTRA_COLUMNS,
  TARGET_TYPE_MISMATCH,
  TARGET_MISSING_COLUMN,
  CHILD_TABLE,
];

const SOURCE_TABLE_LABEL = "Source Table";
const COMPATIBLE_TARGET_LABEL = "Compatible Target";
const TARGET_EXTRA_COLUMNS_LABEL = "Target Extra Columns";
const TARGET_TYPE_MISMATCH_LABEL = "Target Type Mismatch";
const TARGET_MISSING_COLUMN_LABEL = "Target Missing Column";

const SOURCE_ROW_VALUE = "Source Value 1";
const COMPATIBLE_TARGET_ROW_VALUE = "Compatible Target Value";
const ANOTHER_TARGET_ROW_VALUE = "Another Target Row";
const EXTRA_COLUMNS_TARGET_ROW_VALUE = "Extra Columns Target Value";

const CATEGORY_FILTER_ID = "category-filter";

const WRITABLE_SCHEMA_ID = `${WRITABLE_DB_ID}:public`;

type FieldRefScenario = {
  cardId: number;
  amountRef: ConcreteFieldReference;
  categoryRef: ConcreteFieldReference;
};

test.describe(
  "scenarios > data-studio > source replacement",
  { tag: "@external" },
  () => {
    // The QA writable postgres container + the postgres-writable snapshot.
    test.skip(
      !process.env.PW_QA_DB_ENABLED,
      "Requires the writable postgres QA database and its postgres-writable snapshot (set PW_QA_DB_ENABLED)",
    );
    test.skip(
      !resolveToken("bleeding-edge"),
      "Requires the bleeding-edge token (set MB_ALL_FEATURES_TOKEN)",
    );

    // Restore + table DDL + a full schema resync + the async replacement run
    // put these well past the 90s default.
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ mb }) => {
      await dropAllTestTables();

      await mb.restore("postgres-writable");
      await mb.signInAsAdmin();
      await mb.api.activateToken("bleeding-edge");
    });

    test.describe("Successful replacements", () => {
      test("updates all dependent questions on the source table", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        const q1 = await createSourceQuestion(mb.api, "Q1 plain");
        await createSourceQuestion(mb.api, "Q2 filtered", {
          filter: [
            ">",
            ["field", "amount", { "base-type": "type/Decimal" }],
            50,
          ],
        });
        await createSourceQuestion(mb.api, "Q3 count", {
          aggregation: [["count"]],
        });

        await openReplacementModal(page, mb.api, SOURCE_TABLE_LABEL);
        await pickTarget(page, mb.api, COMPATIBLE_TARGET_LABEL);

        // all dependents are listed in the modal
        await SourceReplacement.getDependentsTab(page, 3).click();
        const replacementModal = SourceReplacement.getModal(page);
        await expect(
          replacementModal.getByText("Q1 plain", { exact: true }),
        ).toBeVisible();
        await expect(
          replacementModal.getByText("Q2 filtered", { exact: true }),
        ).toBeVisible();
        await expect(
          replacementModal.getByText("Q3 count", { exact: true }),
        ).toBeVisible();

        const replaced = await confirmReplacement(page);
        await waitForReplacementToComplete(mb.api, replaced);

        // first question now queries the new table
        await visitQuestion(page, q1.id);
        await assertTargetRowVisible(page);
        await expect(
          main(page).getByText(SOURCE_ROW_VALUE, { exact: true }),
        ).toHaveCount(0);
        await openNotebook(page);
        await assertDataSourceIs(page, COMPATIBLE_TARGET_LABEL);
      });

      test("allows replacement when target has extra columns", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        const question = await createSourceQuestion(
          mb.api,
          "Question on source",
        );

        await openReplacementModal(page, mb.api, SOURCE_TABLE_LABEL);
        await pickTarget(page, mb.api, TARGET_EXTRA_COLUMNS_LABEL);

        // column comparison is shown and replace is enabled
        await expect(
          SourceReplacement.getModal(page).getByText("Column comparison", {
            exact: true,
          }),
        ).toBeVisible();

        const replaced = await confirmReplacement(page);
        await waitForReplacementToComplete(mb.api, replaced);

        await visitQuestion(page, question.id);
        await expect(
          main(page)
            .getByText(EXTRA_COLUMNS_TARGET_ROW_VALUE, { exact: true })
            .first(),
        ).toBeVisible({ timeout: 15_000 });

        await openNotebook(page);
        await assertDataSourceIs(page, TARGET_EXTRA_COLUMNS_LABEL);
      });

      test("replaces a joined table without breaking the question", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        const question = await createQuestionJoiningSourceIntoExtraColumns(
          mb.api,
          "Joined question",
        );

        await replaceSourceWithTarget(
          page,
          mb.api,
          SOURCE_TABLE_LABEL,
          COMPATIBLE_TARGET_LABEL,
        );

        // the only extra_columns row (D) now joins the D row from
        // compatible_target
        await visitQuestion(page, question.id);
        await expect(
          main(page)
            .getByText(EXTRA_COLUMNS_TARGET_ROW_VALUE, { exact: true })
            .first(),
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          main(page)
            .getByText(ANOTHER_TARGET_ROW_VALUE, { exact: true })
            .first(),
        ).toBeVisible({ timeout: 15_000 });
      });

      test("updates a model and questions built on it", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        const model = await createSourceModel(mb.api, "Source model");
        const nestedQuestion = await createQuestionOnModel(
          mb.api,
          "Question on model",
          model.id,
        );

        await replaceSourceWithTarget(
          page,
          mb.api,
          SOURCE_TABLE_LABEL,
          COMPATIBLE_TARGET_LABEL,
        );

        // nested question shows data from the new table
        await visitQuestion(page, nestedQuestion.id);
        await assertTargetRowVisible(page);
        await expect(
          main(page).getByText(SOURCE_ROW_VALUE, { exact: true }),
        ).toHaveCount(0);

        // the model's own data source was updated
        await page.goto(`/model/${model.id}/query`);
        await assertDataSourceIs(page, COMPATIBLE_TARGET_LABEL);
      });

      test("updates a metric defined on the source table", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        const sourceTableId = await getTableId(mb.api, SOURCE_TABLE);
        const amountId = await getFieldId(mb.api, {
          tableId: sourceTableId,
          name: "amount",
        });
        const metric = await createQuestion(mb.api, {
          name: "Amount sum metric",
          database: WRITABLE_DB_ID,
          type: "metric",
          query: {
            "source-table": sourceTableId,
            aggregation: [["sum", ["field", amountId, null]]],
          },
        });

        await replaceSourceWithTarget(
          page,
          mb.api,
          SOURCE_TABLE_LABEL,
          COMPATIBLE_TARGET_LABEL,
        );

        // metric now aggregates data from the new table
        await visitMetric(page, metric.id);
        await expect(
          main(page).getByText("800", { exact: true }),
        ).toBeVisible();
      });

      test("updates a dashboard with parameter filters", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        const { dashboard_id, card_id } = await createFilteredDashboardOnSource(
          mb.api,
        );

        await replaceSourceWithTarget(
          page,
          mb.api,
          SOURCE_TABLE_LABEL,
          COMPATIBLE_TARGET_LABEL,
        );

        // dashboard renders with new data
        await visitDashboard(page, mb.api, dashboard_id);
        await expect(
          main(page).getByText(COMPATIBLE_TARGET_ROW_VALUE, { exact: true }),
        ).toBeVisible();

        // filter widget still works after replacement
        await toggleFilterWidgetValues(page, ["C"]);
        await expect(
          main(page).getByText(COMPATIBLE_TARGET_ROW_VALUE, { exact: true }),
        ).toBeVisible();

        // the underlying question's data source was updated
        await visitQuestion(page, card_id);
        await openNotebook(page);
        await assertDataSourceIs(page, COMPATIBLE_TARGET_LABEL);
      });

      test("reassigns segments and measures to the target table", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);

        const sourceTableId = await getTableId(mb.api, SOURCE_TABLE);
        const targetTableId = await getTableId(mb.api, COMPATIBLE_TARGET);

        const segmentId = await createHighAmountSegment(mb.api);
        const segmentQuestion = await createSourceQuestion(
          mb.api,
          "Question using segment",
          { filter: ["segment", segmentId] },
        );
        const measure = await createSourceTotalAmountMeasure(mb.api);

        await openReplacementModal(page, mb.api, SOURCE_TABLE_LABEL);
        await pickTarget(page, mb.api, COMPATIBLE_TARGET_LABEL);

        // dependents tab lists the question, segment, and measure
        await SourceReplacement.getDependentsTab(page, 3).click();
        const replacementModal = SourceReplacement.getModal(page);
        await expect(
          replacementModal.getByText("Question using segment", { exact: true }),
        ).toBeVisible();
        await expect(
          replacementModal.getByText("High amount", { exact: true }),
        ).toBeVisible();
        await expect(
          replacementModal.getByText("Total amount", { exact: true }),
        ).toBeVisible();

        const replaced = await confirmReplacement(page);
        await waitForReplacementToComplete(mb.api, replaced);

        // the dependent question still runs against the target
        await visitQuestion(page, segmentQuestion.id);
        await assertTargetRowVisible(page);

        // segment now shows on the target table in the data model UI
        await visitWritableTableSegments(page, targetTableId);
        await expect(SegmentList.getSegment(page, "High amount")).toBeVisible();

        // segment no longer shows on the source table in the data model UI
        await visitWritableTableSegments(page, sourceTableId);
        await expect(SegmentList.get(page)).toBeVisible();
        await expect(SegmentList.get(page)).not.toContainText("High amount");

        // measure now shows on the target table in the data model UI
        await visitWritableTableMeasures(page, targetTableId);
        await expect(MeasureList.getMeasure(page, "Total amount")).toBeVisible();

        // measure no longer shows on the source table in the data model UI
        await visitWritableTableMeasures(page, sourceTableId);
        await expect(MeasureList.get(page)).toBeVisible();
        await expect(MeasureList.get(page)).not.toContainText("Total amount");

        // measure still aggregates correctly against the target table
        await visitQuestionAdhoc(page, {
          dataset_query: {
            type: "query",
            database: WRITABLE_DB_ID,
            query: {
              "source-table": targetTableId,
              aggregation: [["measure", measure.id]],
            },
          },
        });
        await expect(
          main(page).getByText("800", { exact: true }),
        ).toBeVisible();
      });

      test("updates a transform that sources the replaced table", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        const transform = await createSourceTransform(
          mb.api,
          "Source transform",
        );

        await replaceSourceWithTarget(
          page,
          mb.api,
          SOURCE_TABLE_LABEL,
          COMPATIBLE_TARGET_LABEL,
        );

        // transform now references the new source table
        await visitTransform(page, transform.id);
        await assertDataSourceIs(page, COMPATIBLE_TARGET_LABEL);
      });
    });

    test.describe("Blocked replacements", () => {
      test("blocks replacement when target has a column type mismatch", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        await createSourceQuestion(mb.api, "Question on source");

        await openReplacementModal(page, mb.api, SOURCE_TABLE_LABEL);
        await pickTarget(page, mb.api, TARGET_TYPE_MISMATCH_LABEL);

        const replacementModal = SourceReplacement.getModal(page);
        await expect(
          replacementModal.getByText("Column comparison", { exact: true }),
        ).toBeVisible();
        await expect(
          replacementModal.getByText(
            "This column has a different data type than the original column.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(SourceReplacement.getReplaceButton(page)).toBeDisabled();
      });

      test("blocks replacement when target is missing a required column", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        await createSourceQuestion(mb.api, "Question on source");

        await openReplacementModal(page, mb.api, SOURCE_TABLE_LABEL);
        await pickTarget(page, mb.api, TARGET_MISSING_COLUMN_LABEL);

        const replacementModal = SourceReplacement.getModal(page);
        await expect(
          replacementModal.getByText("Column comparison", { exact: true }),
        ).toBeVisible();
        await expect(
          replacementModal.getByText("This data source isn't compatible.", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(SourceReplacement.getReplaceButton(page)).toBeDisabled();
      });

      test("blocks replacement when source table has foreign keys", async ({
        page,
        mb,
      }) => {
        await createTestTablesWithForeignKey(mb.api);
        await createSourceQuestion(mb.api, "Question on source");

        await openReplacementModal(page, mb.api, SOURCE_TABLE_LABEL);
        await pickTarget(page, mb.api, COMPATIBLE_TARGET_LABEL);

        await expect(
          SourceReplacement.getModal(page).getByText(
            "The original table can't be referenced by a foreign key by another table.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(SourceReplacement.getReplaceButton(page)).toBeDisabled();
      });

      test("blocks replacement when target would create a cycle", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        await createSourceQuestion(mb.api, "Question on source");

        await openReplacementModal(page, mb.api, SOURCE_TABLE_LABEL);

        // pick a question that depends on source_table as the target
        await SourceReplacement.getTargetPickerButton(page).click();
        const picker = entityPickerModal(page);
        await picker
          .getByText("Our analytics", { exact: true })
          .first()
          .click();
        const questionRow = picker.getByText("Question on source", {
          exact: true,
        });
        // The picker list re-renders as the collection items load; gate on the
        // row before clicking it (PORTING "list re-renders under a resolved
        // locator").
        await expect(questionRow).toBeVisible();
        await questionRow.click();

        await expect(
          SourceReplacement.getModal(page).getByText(
            "The replacement data source can't be based on the original data source.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(SourceReplacement.getReplaceButton(page)).toBeDisabled();
      });

      test("blocks replacement when source table has no dependents", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);

        await openReplacementModal(page, mb.api, SOURCE_TABLE_LABEL);
        await pickTarget(page, mb.api, COMPATIBLE_TARGET_LABEL);

        await expect(
          SourceReplacement.getModal(page).getByText(
            "Nothing uses this data source, so there's nothing to replace.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(SourceReplacement.getReplaceButton(page)).toBeDisabled();
      });
    });

    test.describe("Entry points", () => {
      test("opens replacement from the dependency graph and replaces successfully", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        const question = await createSourceQuestion(mb.api, "Graph question");

        // The replacement modal fetches the dependents of the source table
        // exactly once when it opens; wait for the async dependency backfill
        // so the question's dependency row exists by then.
        await waitForBackfillComplete(mb.api);

        const sourceTableId = await getTableId(mb.api, SOURCE_TABLE);
        await page.goto(
          `/data-studio/dependencies?id=${sourceTableId}&type=table`,
        );

        // open replacement modal from the graph info panel
        await DependencyGraph.graph(page)
          .getByLabel(SOURCE_TABLE_LABEL, { exact: true })
          .click();

        const dependents = waitForDependents(page);
        await page
          .getByTestId("graph-info-panel")
          .getByLabel("Replace data source", { exact: true })
          .first()
          .click();

        await expect(
          SourceReplacement.getModal(page).getByText(
            "Find and replace a data source",
            { exact: true },
          ),
        ).toBeVisible();
        await dependents;

        await pickTarget(page, mb.api, COMPATIBLE_TARGET_LABEL);
        const replaced = await confirmReplacement(page);
        await waitForReplacementToComplete(mb.api, replaced);

        await visitQuestion(page, question.id);
        await assertTargetRowVisible(page);
        await expect(
          main(page).getByText(SOURCE_ROW_VALUE, { exact: true }),
        ).toHaveCount(0);
        await openNotebook(page);
        await assertDataSourceIs(page, COMPATIBLE_TARGET_LABEL);
      });
    });

    test.describe("Native queries", () => {
      test("replaces a table referenced in a native SQL question", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        await createSourceQuestion(mb.api, "MBQL dependent");

        const nativeQuestion = await createNativeQuestion(mb.api, {
          name: "Native SQL question",
          database: WRITABLE_DB_ID,
          native: { query: `SELECT id, name, amount FROM ${SOURCE_TABLE}` },
        });

        await replaceSourceWithTarget(
          page,
          mb.api,
          SOURCE_TABLE_LABEL,
          COMPATIBLE_TARGET_LABEL,
        );
        await visitQuestion(page, nativeQuestion.id);
        await assertTargetRowVisible(page);
        await expect(
          main(page).getByText(SOURCE_ROW_VALUE, { exact: true }),
        ).toHaveCount(0);
      });

      // Skipped upstream (it.skip) — kept skipped, verbatim.
      test.skip("replaces a table referenced via a native query snippet", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        await createSourceQuestion(mb.api, "MBQL dependent");

        const snippet = await createSnippet(mb.api, {
          name: "source query",
          content: `SELECT id, name, amount FROM ${SOURCE_TABLE}`,
        });
        const snippetQuestion = await createNativeQuestion(mb.api, {
          name: "Snippet question",
          database: WRITABLE_DB_ID,
          native: {
            query: "SELECT * FROM ({{snippet: source query}}) AS source_data",
            "template-tags": {
              "snippet: source query": {
                id: "snippet-tag-id",
                name: "snippet: source query",
                "display-name": "Source Query",
                type: "snippet",
                "snippet-name": "source query",
                "snippet-id": snippet.id,
              },
            },
          },
        });

        await replaceSourceWithTarget(
          page,
          mb.api,
          SOURCE_TABLE_LABEL,
          COMPATIBLE_TARGET_LABEL,
        );
        await visitQuestion(page, snippetQuestion.id);
        await assertTargetRowVisible(page);
        await expect(
          main(page).getByText(SOURCE_ROW_VALUE, { exact: true }),
        ).toHaveCount(0);
      });
    });

    test.describe("Access control", () => {
      test("non-admin users cannot access source replacement", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        await createSourceQuestion(mb.api, "Question on source");

        await mb.signInAsNormalUser();
        await page.goto("/data-studio/data");
        await expect(
          main(page).getByText("Sorry, you don’t have permission to see that.", {
            exact: true,
          }),
        ).toBeVisible();
      });
    });

    test.describe("Sandboxing", () => {
      test("blocks replacement when the source table has a sandbox policy", async ({
        page,
        mb,
      }) => {
        await createTestTables(mb.api);
        await createSourceQuestion(mb.api, "Question on source");

        const sourceTableId = await getTableId(mb.api, SOURCE_TABLE);
        const categoryFieldId = await getFieldId(mb.api, {
          tableId: sourceTableId,
          name: "category",
        });
        const sandboxQuestion = await createQuestion(mb.api, {
          name: "Sandbox filter question",
          database: WRITABLE_DB_ID,
          query: {
            "source-table": sourceTableId,
            filter: ["=", ["field", categoryFieldId, null], "A"],
          },
        });
        await sandboxTable(mb.api, {
          table_id: sourceTableId,
          card_id: sandboxQuestion.id,
          group_id: COLLECTION_GROUP,
        });

        await openReplacementModal(page, mb.api, SOURCE_TABLE_LABEL);
        await pickTarget(page, mb.api, COMPATIBLE_TARGET_LABEL);

        await expect(
          SourceReplacement.getModal(page).getByText(
            "This table has row or column security policies that block this replacement.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(SourceReplacement.getReplaceButton(page)).toBeDisabled();
      });
    });

    test.describe("Field ref upgrades", () => {
      test.describe(
        "numeric field id on a question directly on the source table",
        () => {
          test("rewrites the card's own filter ref after swap", async ({
            page,
            mb,
          }) => {
            await createTestTables(mb.api);
            const { cardId } = await createQuestionUsingFieldIdRef(mb.api);
            await replaceSourceWithTarget(
              page,
              mb.api,
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );

            await visitQuestion(page, cardId);
            await assertTargetRowVisible(page);
          });

          test("rewrites viz settings column_settings ref keys", async ({
            page,
            mb,
          }) => {
            await createTestTables(mb.api);
            const { cardId, amountRef } = await createQuestionUsingFieldIdRef(
              mb.api,
            );
            await setNestedCardColumnTitle(mb.api, {
              nestedCardId: cardId,
              columnRef: amountRef,
            });
            await replaceSourceWithTarget(
              page,
              mb.api,
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );

            await visitQuestion(page, cardId);
            await assertTargetRowVisible(page);
            await expect(
              main(page).getByText("Renamed Column", { exact: true }),
            ).toBeVisible();
          });

          test("rewrites a dashboard parameter target", async ({
            page,
            mb,
          }) => {
            await createTestTables(mb.api);
            const scenario = await createQuestionUsingFieldIdRef(mb.api);
            const dashboardId = await buildParameterTargetDashboard(
              mb.api,
              scenario,
            );
            await replaceSourceWithTarget(
              page,
              mb.api,
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            await assertParameterTargetStillWorks(page, mb.api, dashboardId);
          });

          test("rewrites dashcard click_behavior parameterMapping", async ({
            page,
            mb,
          }) => {
            await createTestTables(mb.api);
            const scenario = await createQuestionUsingFieldIdRef(mb.api);
            const dashboardId = await buildClickBehaviorDashboard(
              mb.api,
              scenario,
            );
            await replaceSourceWithTarget(
              page,
              mb.api,
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            await assertClickBehaviorStillWorks(page, mb.api, dashboardId);
          });

          test("rewrites a parameter values_source_config card value_field ref", async ({
            page,
            mb,
          }) => {
            await createTestTables(mb.api);
            const scenario = await createQuestionUsingFieldIdRef(mb.api);
            const dashboardId = await buildCardSourcedValuesDashboard(
              mb.api,
              scenario,
            );
            await replaceSourceWithTarget(
              page,
              mb.api,
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            await assertCardSourcedValuesStillWork(page, mb.api, dashboardId);
          });
        },
      );

      test.describe(
        "numeric field id in a nested card on a parent question",
        () => {
          test("rewrites the nested card's filter ref after swap", async ({
            page,
            mb,
          }) => {
            await createTestTables(mb.api);
            const { cardId } = await createNestedQuestionUsingFieldIdRef(
              mb.api,
            );
            await replaceSourceWithTarget(
              page,
              mb.api,
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );

            await visitQuestion(page, cardId);
            await assertTargetRowVisible(page);
          });

          test("rewrites a dashboard parameter target", async ({
            page,
            mb,
          }) => {
            await createTestTables(mb.api);
            const scenario = await createNestedQuestionUsingFieldIdRef(mb.api);
            const dashboardId = await buildParameterTargetDashboard(
              mb.api,
              scenario,
            );
            await replaceSourceWithTarget(
              page,
              mb.api,
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            await assertParameterTargetStillWorks(page, mb.api, dashboardId);
          });

          test("rewrites dashcard click_behavior parameterMapping", async ({
            page,
            mb,
          }) => {
            await createTestTables(mb.api);
            const scenario = await createNestedQuestionUsingFieldIdRef(mb.api);
            const dashboardId = await buildClickBehaviorDashboard(
              mb.api,
              scenario,
            );
            await replaceSourceWithTarget(
              page,
              mb.api,
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            await assertClickBehaviorStillWorks(page, mb.api, dashboardId);
          });

          test("rewrites a parameter values_source_config card value_field ref", async ({
            page,
            mb,
          }) => {
            await createTestTables(mb.api);
            const scenario = await createNestedQuestionUsingFieldIdRef(mb.api);
            const dashboardId = await buildCardSourcedValuesDashboard(
              mb.api,
              scenario,
            );
            await replaceSourceWithTarget(
              page,
              mb.api,
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            await assertCardSourcedValuesStillWork(page, mb.api, dashboardId);
          });
        },
      );

      test.describe(
        "`_2` suffix ref in a nested card whose parent has a same-name join",
        () => {
          test("rewrites the nested card's `_2` filter ref after swap", async ({
            page,
            mb,
          }) => {
            await createTestTables(mb.api);
            const { cardId } = await createNestedQuestionUsingJoinSuffixRef(
              mb.api,
            );
            await replaceSourceWithTarget(
              page,
              mb.api,
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );

            await visitQuestion(page, cardId);
            await assertTargetRowVisible(page);
          });

          test("rewrites a dashboard parameter target", async ({
            page,
            mb,
          }) => {
            await createTestTables(mb.api);
            const scenario = await createNestedQuestionUsingJoinSuffixRef(
              mb.api,
            );
            const dashboardId = await buildParameterTargetDashboard(
              mb.api,
              scenario,
            );
            await replaceSourceWithTarget(
              page,
              mb.api,
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            await assertParameterTargetStillWorks(page, mb.api, dashboardId);
          });

          test("rewrites dashcard click_behavior parameterMapping", async ({
            page,
            mb,
          }) => {
            await createTestTables(mb.api);
            const scenario = await createNestedQuestionUsingJoinSuffixRef(
              mb.api,
            );
            const dashboardId = await buildClickBehaviorDashboard(
              mb.api,
              scenario,
            );
            await replaceSourceWithTarget(
              page,
              mb.api,
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            await assertClickBehaviorStillWorks(page, mb.api, dashboardId);
          });
        },
      );
    });
  },
);

// === setup =========================================================

async function dropAllTestTables() {
  const drops = ALL_TABLES.map(
    (table) => `DROP TABLE IF EXISTS ${table} CASCADE`,
  ).join("; ");
  await queryWritableDB(drops);
}

async function createTestTables(api: MetabaseApi) {
  await dropAllTestTables();

  await queryWritableDB(`
    CREATE TABLE ${SOURCE_TABLE} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount NUMERIC(10,2),
      category VARCHAR(100)
    );
    INSERT INTO ${SOURCE_TABLE} VALUES
      (1, 'Source Value 1', 100.50, 'A'),
      (2, 'Source Value 2', 200.75, 'B');

    CREATE TABLE ${COMPATIBLE_TARGET} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount NUMERIC(10,2),
      category VARCHAR(100)
    );
    INSERT INTO ${COMPATIBLE_TARGET} VALUES
      (10, 'Compatible Target Value', 300.00, 'C'),
      (11, 'Another Target Row', 500.00, 'D');

    CREATE TABLE ${TARGET_EXTRA_COLUMNS} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount NUMERIC(10,2),
      category VARCHAR(100),
      extra_field VARCHAR(50)
    );
    INSERT INTO ${TARGET_EXTRA_COLUMNS} VALUES
      (20, 'Extra Columns Target Value', 400.00, 'D', 'extra');

    CREATE TABLE ${TARGET_TYPE_MISMATCH} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount TEXT,
      category VARCHAR(100)
    );
    INSERT INTO ${TARGET_TYPE_MISMATCH} VALUES
      (30, 'Type Mismatch Value', 'not-a-number', 'E');

    CREATE TABLE ${TARGET_MISSING_COLUMN} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      category VARCHAR(100)
    );
    INSERT INTO ${TARGET_MISSING_COLUMN} VALUES
      (40, 'Missing Column Value', 'F');
  `);

  // Upstream calls H.resyncDatabase({ dbId }) with no `tables`, which returns
  // as soon as the database has ANY synced table — i.e. immediately, since the
  // snapshot's own tables satisfy it. Cypress got away with that because its
  // command queue put ~seconds of latency between the resync and the first
  // getTableId; Playwright's back-to-back API calls do not, and the lookups
  // raced the sync (table found, fields not yet). Wait for the tables this
  // helper just created — the same helper's documented `tables` option.
  await resyncDatabase(api, {
    dbId: WRITABLE_DB_ID,
    tables: [
      SOURCE_TABLE,
      COMPATIBLE_TARGET,
      TARGET_EXTRA_COLUMNS,
      TARGET_TYPE_MISMATCH,
      TARGET_MISSING_COLUMN,
    ],
    retrigger: true,
    // This describe runs at test.describe.configure({ timeout: 300_000 }), so
    // keep the pre-existing 3-minute sync budget rather than inheriting the
    // helper's new default, which is sized for the 90s per-test timeout.
    timeout: 180_000,
  });
}

async function createTestTablesWithForeignKey(api: MetabaseApi) {
  await dropAllTestTables();

  await queryWritableDB(`
    CREATE TABLE ${SOURCE_TABLE} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount NUMERIC(10,2),
      category VARCHAR(100)
    );
    INSERT INTO ${SOURCE_TABLE} VALUES
      (1, 'Source Value 1', 100.50, 'A');

    CREATE TABLE ${COMPATIBLE_TARGET} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount NUMERIC(10,2),
      category VARCHAR(100)
    );
    INSERT INTO ${COMPATIBLE_TARGET} VALUES
      (10, 'Compatible Target Value', 300.00, 'C');

    CREATE TABLE ${CHILD_TABLE} (
      id INTEGER PRIMARY KEY,
      source_id INTEGER REFERENCES ${SOURCE_TABLE}(id),
      label VARCHAR(100)
    );
    INSERT INTO ${CHILD_TABLE} VALUES
      (1, 1, 'child record');
  `);

  // See createTestTables — wait for the freshly created tables, not just "any".
  await resyncDatabase(api, {
    dbId: WRITABLE_DB_ID,
    tables: [SOURCE_TABLE, COMPATIBLE_TARGET, CHILD_TABLE],
    retrigger: true,
    // See createTestTables — same 300s describe, same preserved budget.
    timeout: 180_000,
  });
}

function getTableId(api: MetabaseApi, tableName: string) {
  return getTableIdFor(api, { databaseId: WRITABLE_DB_ID, name: tableName });
}

// === replacement flow ==============================================

async function openReplacementModal(
  page: Page,
  api: MetabaseApi,
  sourceTableLabel: string,
) {
  // The modal fetches the dependents of the source table exactly once when it
  // opens, and the card -> table dependency rows are written by an async
  // backfill job. Wait for the backfill so the modal doesn't race it and show
  // "Nothing uses this data source" for a table that does have dependents.
  await waitForBackfillComplete(api);

  await visitDataModel(page, "data studio");

  await TablePicker.getDatabase(page, "Writable Postgres12").click();

  // Upstream clicks database -> table directly, because on a clean writable
  // postgres the DB has exactly one schema and the picker collapses that level
  // away. The shared QA container on this box has accumulated ~28 schemas from
  // other specs' fixtures (the `multi_schema` test tables: Domestic, Schema
  // A..Z, Wild), so the picker renders a schema level. Expand `public` only
  // when a schema level is actually present — a no-op in the upstream/CI shape.
  await expect
    .poll(
      async () =>
        (await TablePicker.getSchemas(page).count()) +
        (await TablePicker.getTables(page).count()),
      { message: "table picker should expand the database" },
    )
    .toBeGreaterThan(0);
  const publicSchema = TablePicker.getSchema(page, "public");
  if ((await publicSchema.count()) > 0) {
    await publicSchema.first().click();
  }

  const table = TablePicker.getTable(page, sourceTableLabel);
  // The tree re-renders as the schema's tables load; gate on the row.
  await expect(table).toBeVisible();
  await table.click();
  await expect(TableSection.get(page)).toBeVisible();

  await tableSectionActionsMenuButton(page).click();

  // rule 2: register the @dependents wait BEFORE the click that mounts the
  // modal (and so fires the request).
  const dependents = waitForDependents(page);
  await SourceReplacement.getFindAndReplaceButton(page).click();
  await expect(
    SourceReplacement.getModal(page).getByText(
      "Find and replace a data source",
      { exact: true },
    ),
  ).toBeVisible();

  await dependents;
}

async function pickTarget(
  page: Page,
  api: MetabaseApi,
  targetTableLabel: string,
) {
  // The entity picker searches through /api/search, which is index-backed. The
  // target tables are created (and synced) inside the test, so the index can
  // still be catching up when the picker asks — a freshly synced table then
  // simply isn't in the results and the click times out. Poll the backend
  // until the index answers before driving the FE (PORTING: "after any
  // mutation on a search-backed page, poll the backend until the index
  // reflects it BEFORE triggering the FE read").
  await expect
    .poll(
      async () => {
        const response = await api.get(
          `/api/search?q=${encodeURIComponent(targetTableLabel)}&models=table&limit=10`,
          { failOnStatusCode: false },
        );
        if (!response.ok()) {
          return 0;
        }
        // Table search results carry the humanized display name in `name`.
        const body = (await response.json()) as { data?: { name?: string }[] };
        return (body.data ?? []).filter(
          (item) => item.name === targetTableLabel,
        ).length;
      },
      { message: `${targetTableLabel} should be searchable`, timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  await SourceReplacement.getTargetPickerButton(page).click();

  // Cypress: cy.findByTestId("result-item").contains(label).closest("a")
  const link = page
    .getByTestId("result-item")
    .locator("a")
    .filter({ hasText: new RegExp(escapeRegExp(targetTableLabel)) });

  // The OmniPicker switches into its "search results" folder from an effect
  // that watches the DEBOUNCED search query (use-switch-to-search-folder.ts).
  // Typing into a freshly-mounted picker occasionally leaves it on the root
  // list — the input holds the full text and the root merely offers a "Search
  // results for X" link — so the results never render (3/30 tests on one run).
  // Re-nudge by clearing and retyping, the same pattern the editor-completion
  // ports use; the assertion itself is unchanged.
  await expect(async () => {
    const searchBox = entityPickerModal(page).getByRole("searchbox");
    await searchBox.click();
    await searchBox.fill("");
    await searchBox.pressSequentially(targetTableLabel, { delay: 25 });
    await expect(link).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });

  await link.click();
}

/**
 * Port of confirmReplacement. Returns the pending POST
 * /api/ee/replacement/replace-source response — the Cypress `@replaceSource`
 * alias, registered before the click that fires it (rule 2).
 */
async function confirmReplacement(page: Page) {
  const replacementModal = SourceReplacement.getModal(page);
  // The affected-items count comes from an async dependents computation that
  // can exceed the default timeout, so wait longer for the tab.
  await expect(
    replacementModal.getByRole("tab", {
      name: /\d+ items? will be changed/,
    }),
  ).toBeVisible({ timeout: 15_000 });

  await replacementModal
    .getByRole("button", { name: /Replace data source in \d+ item/ })
    .click();

  const confirmationModal = await SourceReplacement.getConfirmationModal(page);
  const replaced = waitForReplaceSource(page);
  await confirmationModal
    .getByRole("button", { name: /Replace data source/ })
    .click();
  return replaced;
}

async function waitForReplacementToComplete(
  api: MetabaseApi,
  replaced: Response,
) {
  const POLL_INTERVAL_MS = 250;
  const POLL_TIMEOUT_MS = 30_000;

  const { run_id } = (await replaced.json()) as { run_id: number };

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const status = await api.get(`/api/ee/replacement/runs/${run_id}`);
    const body = (await status.json()) as { status: string; message?: string };
    if (body.status === "succeeded") {
      return;
    }
    if (body.status === "failed") {
      throw new Error("Replacement failed: " + body.message);
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Replacement polling timed out after ${POLL_TIMEOUT_MS}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

async function replaceSourceWithTarget(
  page: Page,
  api: MetabaseApi,
  sourceTableLabel: string,
  targetTableLabel: string,
) {
  await openReplacementModal(page, api, sourceTableLabel);
  await pickTarget(page, api, targetTableLabel);
  const replaced = await confirmReplacement(page);
  await waitForReplacementToComplete(api, replaced);
}

// === fixtures ======================================================

async function createSourceQuestion(
  api: MetabaseApi,
  name: string,
  queryOverrides: Record<string, unknown> = {},
) {
  const sourceTableId = await getTableId(api, SOURCE_TABLE);
  return createQuestion(api, {
    name,
    database: WRITABLE_DB_ID,
    query: { "source-table": sourceTableId, ...queryOverrides },
  });
}

async function createSourceModel(api: MetabaseApi, name: string) {
  const sourceTableId = await getTableId(api, SOURCE_TABLE);
  return createQuestion(api, {
    name,
    database: WRITABLE_DB_ID,
    type: "model",
    query: { "source-table": sourceTableId },
  });
}

function createQuestionOnModel(
  api: MetabaseApi,
  name: string,
  modelId: number,
) {
  return createQuestion(api, {
    name,
    database: WRITABLE_DB_ID,
    query: { "source-table": `card__${modelId}` },
  });
}

async function createQuestionJoiningSourceIntoExtraColumns(
  api: MetabaseApi,
  name: string,
) {
  const sourceTableId = await getTableId(api, SOURCE_TABLE);
  const extraColumnsTableId = await getTableId(api, TARGET_EXTRA_COLUMNS);
  const sourceCategoryFieldId = await getFieldId(api, {
    tableId: sourceTableId,
    name: "category",
  });
  const extraColumnsCategoryFieldId = await getFieldId(api, {
    tableId: extraColumnsTableId,
    name: "category",
  });

  return createQuestion(api, {
    name,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": extraColumnsTableId,
      joins: [
        {
          alias: SOURCE_TABLE_LABEL,
          "source-table": sourceTableId,
          fields: "all",
          condition: [
            "=",
            ["field", extraColumnsCategoryFieldId, { "base-type": "type/Text" }],
            [
              "field",
              sourceCategoryFieldId,
              { "base-type": "type/Text", "join-alias": SOURCE_TABLE_LABEL },
            ],
          ],
        },
      ],
    },
  });
}

async function createFilteredDashboardOnSource(api: MetabaseApi) {
  const sourceTableId = await getTableId(api, SOURCE_TABLE);
  const categoryFieldId = await getFieldId(api, {
    tableId: sourceTableId,
    name: "category",
  });
  const { cardId, dashboardId } = await createQuestionAndDashboard(api, {
    questionDetails: {
      name: "Filtered question",
      database: WRITABLE_DB_ID,
      query: { "source-table": sourceTableId },
    },
    dashboardDetails: {
      name: "Dashboard with filter",
      parameters: [categoryStringParameter(CATEGORY_FILTER_ID)],
    },
  });
  await addOrUpdateDashboardCard(api, {
    dashboard_id: dashboardId,
    card_id: cardId,
    card: {
      parameter_mappings: [
        {
          parameter_id: CATEGORY_FILTER_ID,
          card_id: cardId,
          target: ["dimension", ["field", categoryFieldId, null]],
        },
      ],
    },
  });
  return { dashboard_id: dashboardId, card_id: cardId };
}

async function createHighAmountSegment(api: MetabaseApi) {
  const sourceTableId = await getTableId(api, SOURCE_TABLE);
  const amountFieldId = await getFieldId(api, {
    tableId: sourceTableId,
    name: "amount",
  });
  const segment = await createSegment(api, {
    name: "High amount",
    definition: {
      type: "query",
      database: WRITABLE_DB_ID,
      query: {
        "source-table": sourceTableId,
        filter: [">", ["field", amountFieldId, null], 50],
      },
    },
  });
  return segment.id;
}

async function createSourceTotalAmountMeasure(api: MetabaseApi) {
  const sourceTableId = await getTableId(api, SOURCE_TABLE);
  const amountFieldId = await getFieldId(api, {
    tableId: sourceTableId,
    name: "amount",
  });
  return createMeasure(api, {
    name: "Total amount",
    definition: {
      "source-table": sourceTableId,
      aggregation: [["sum", ["field", amountFieldId, null]]],
    },
  });
}

async function createSourceTransform(api: MetabaseApi, name: string) {
  const sourceTableId = await getTableId(api, SOURCE_TABLE);
  const amountId = await getFieldId(api, {
    tableId: sourceTableId,
    name: "amount",
  });
  return createTransform(api, {
    name,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "query",
        query: {
          "source-table": sourceTableId,
          filter: [">", ["field", amountId, null], 0],
        },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name: "transform_output",
      schema: "public",
    },
  });
}

async function createQuestionUsingFieldIdRef(
  api: MetabaseApi,
): Promise<FieldRefScenario> {
  const sourceTableId = await getTableId(api, SOURCE_TABLE);
  const amountId = await getFieldId(api, {
    tableId: sourceTableId,
    name: "amount",
  });
  const categoryId = await getFieldId(api, {
    tableId: sourceTableId,
    name: "category",
  });
  const amountRef: ConcreteFieldReference = [
    "field",
    amountId,
    { "base-type": "type/Decimal" },
  ];
  const categoryRef: ConcreteFieldReference = [
    "field",
    categoryId,
    { "base-type": "type/Text" },
  ];
  const card = await createQuestion(api, {
    name: "Question filtered by numeric field id",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": sourceTableId,
      filter: [">", amountRef, 0],
    },
  });
  return { cardId: card.id, amountRef, categoryRef };
}

async function createNestedQuestionUsingFieldIdRef(
  api: MetabaseApi,
): Promise<FieldRefScenario> {
  const sourceTableId = await getTableId(api, SOURCE_TABLE);
  const amountId = await getFieldId(api, {
    tableId: sourceTableId,
    name: "amount",
  });
  const categoryId = await getFieldId(api, {
    tableId: sourceTableId,
    name: "category",
  });
  const amountRef: ConcreteFieldReference = [
    "field",
    amountId,
    { "base-type": "type/Decimal" },
  ];
  const categoryRef: ConcreteFieldReference = [
    "field",
    categoryId,
    { "base-type": "type/Text" },
  ];
  const parent = await createQuestion(api, {
    name: "Parent question on source table",
    database: WRITABLE_DB_ID,
    query: { "source-table": sourceTableId },
  });
  const nested = await createQuestion(api, {
    name: "Nested question filtered by numeric field id",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": `card__${parent.id}`,
      filter: [">", amountRef, 0],
    },
  });
  return { cardId: nested.id, amountRef, categoryRef };
}

async function createNestedQuestionUsingJoinSuffixRef(
  api: MetabaseApi,
): Promise<FieldRefScenario> {
  const amountRef: ConcreteFieldReference = [
    "field",
    "amount_2",
    { "base-type": "type/Decimal" },
  ];
  const categoryRef: ConcreteFieldReference = [
    "field",
    "category_2",
    { "base-type": "type/Text" },
  ];

  const sourceTableId = await getTableId(api, SOURCE_TABLE);
  const sourceCategoryId = await getFieldId(api, {
    tableId: sourceTableId,
    name: "category",
  });
  const joinTableId = await getTableId(api, COMPATIBLE_TARGET);
  const joinCategoryId = await getFieldId(api, {
    tableId: joinTableId,
    name: "category",
  });

  const parent = await createQuestion(api, {
    name: "Parent question with same-name join",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": sourceTableId,
      joins: [
        {
          alias: COMPATIBLE_TARGET_LABEL,
          "source-table": joinTableId,
          fields: "all",
          condition: [
            "=",
            ["field", sourceCategoryId, { "base-type": "type/Text" }],
            [
              "field",
              joinCategoryId,
              {
                "base-type": "type/Text",
                "join-alias": COMPATIBLE_TARGET_LABEL,
              },
            ],
          ],
        },
      ],
    },
  });
  const nested = await createQuestion(api, {
    name: "Nested question filtered by legacy join suffix ref",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": `card__${parent.id}`,
      filter: [">", amountRef, 0],
    },
  });
  return { cardId: nested.id, amountRef, categoryRef };
}

// === dashboards under test =========================================

function visitWritableTableSegments(page: Page, tableId: number) {
  return visitDataStudioSegments(page, {
    databaseId: WRITABLE_DB_ID,
    schemaId: WRITABLE_SCHEMA_ID,
    tableId,
  });
}

function visitWritableTableMeasures(page: Page, tableId: number) {
  return visitDataStudioMeasures(page, {
    databaseId: WRITABLE_DB_ID,
    schemaId: WRITABLE_SCHEMA_ID,
    tableId,
  });
}

async function buildParameterTargetDashboard(
  api: MetabaseApi,
  { cardId, categoryRef }: FieldRefScenario,
) {
  const dashboard = await createDashboard(api, {
    name: "Parameter target dashboard",
    parameters: [categoryStringParameter(CATEGORY_FILTER_ID)],
  });
  await addOrUpdateDashboardCard(api, {
    dashboard_id: dashboard.id,
    card_id: cardId,
    card: {
      parameter_mappings: [
        {
          parameter_id: CATEGORY_FILTER_ID,
          card_id: cardId,
          target: ["dimension", categoryRef],
        },
      ],
    },
  });
  return dashboard.id;
}

async function buildClickBehaviorDashboard(
  api: MetabaseApi,
  { cardId, categoryRef }: FieldRefScenario,
) {
  const dashboard = await createDashboard(api, {
    name: "Click behavior dashboard",
    parameters: [categoryStringParameter(CATEGORY_FILTER_ID)],
  });
  await addOrUpdateDashboardCard(api, {
    dashboard_id: dashboard.id,
    card_id: cardId,
    card: {
      parameter_mappings: [
        {
          parameter_id: CATEGORY_FILTER_ID,
          card_id: cardId,
          target: ["dimension", categoryRef],
        },
      ],
      visualization_settings: {
        click_behavior: crossfilterClickBehavior(CATEGORY_FILTER_ID),
      },
    },
  });
  return dashboard.id;
}

async function buildCardSourcedValuesDashboard(
  api: MetabaseApi,
  { cardId, categoryRef }: FieldRefScenario,
) {
  const dashboard = await createDashboard(api, {
    name: "Card-sourced values dashboard",
    parameters: [
      {
        ...categoryStringParameter(CATEGORY_FILTER_ID),
        values_source_type: "card",
        values_source_config: {
          card_id: cardId,
          value_field: categoryRef,
        },
      },
    ],
  });
  await addOrUpdateDashboardCard(api, {
    dashboard_id: dashboard.id,
    card_id: cardId,
    card: {
      parameter_mappings: [
        {
          parameter_id: CATEGORY_FILTER_ID,
          card_id: cardId,
          target: ["dimension", categoryRef],
        },
      ],
    },
  });
  return dashboard.id;
}

async function assertParameterTargetStillWorks(
  page: Page,
  api: MetabaseApi,
  dashboardId: number,
) {
  await visitDashboard(page, api, dashboardId);
  await assertDashcardHasRows(page, {
    visible: [COMPATIBLE_TARGET_ROW_VALUE, ANOTHER_TARGET_ROW_VALUE],
    hidden: [],
  });
  await toggleFilterWidgetValues(page, ["D"]);
  await assertDashcardHasRows(page, {
    visible: [ANOTHER_TARGET_ROW_VALUE],
    hidden: [COMPATIBLE_TARGET_ROW_VALUE],
  });
}

async function assertClickBehaviorStillWorks(
  page: Page,
  api: MetabaseApi,
  dashboardId: number,
) {
  await visitDashboard(page, api, dashboardId);
  await assertDashcardHasRows(page, {
    visible: [COMPATIBLE_TARGET_ROW_VALUE, ANOTHER_TARGET_ROW_VALUE],
    hidden: [],
  });
  await page
    .getByTestId("dashcard")
    .getByText("D", { exact: true })
    .first()
    .click();
  await expect(filterWidget(page)).toContainText("D");
  await assertDashcardHasRows(page, {
    visible: [ANOTHER_TARGET_ROW_VALUE],
    hidden: [COMPATIBLE_TARGET_ROW_VALUE],
  });
}

async function assertCardSourcedValuesStillWork(
  page: Page,
  api: MetabaseApi,
  dashboardId: number,
) {
  await visitDashboard(page, api, dashboardId);
  await assertDashcardHasRows(page, {
    visible: [COMPATIBLE_TARGET_ROW_VALUE, ANOTHER_TARGET_ROW_VALUE],
    hidden: [],
  });
  await filterWidget(page).click();
  await expect(popover(page).getByText("C", { exact: true })).toBeVisible();
  await expect(popover(page).getByText("D", { exact: true })).toBeVisible();
  await popover(page).getByText("D", { exact: true }).click();
  await popover(page)
    .getByRole("button", { name: "Add filter", exact: true })
    .click();
  await assertDashcardHasRows(page, {
    visible: [ANOTHER_TARGET_ROW_VALUE],
    hidden: [COMPATIBLE_TARGET_ROW_VALUE],
  });
}

function categoryStringParameter(id: string) {
  return { id, type: "string/=", name: "Category", slug: "category" };
}

function crossfilterClickBehavior(parameterId: string) {
  return {
    type: "crossfilter",
    parameterMapping: {
      [parameterId]: {
        id: parameterId,
        source: { id: "category", name: "category", type: "column" },
        target: { id: parameterId, type: "parameter" },
      },
    },
  };
}

async function setNestedCardColumnTitle(
  api: MetabaseApi,
  {
    nestedCardId,
    columnRef,
  }: { nestedCardId: number; columnRef: ConcreteFieldReference },
) {
  // Legacy column_settings keys store refs with null options. See
  // getLegacyColumnKey in frontend/src/metabase-lib/v1/queries/utils/column-key.ts.
  const legacyRef: ConcreteFieldReference = [columnRef[0], columnRef[1], null];
  const columnKey = JSON.stringify(["ref", legacyRef]);
  await api.put(`/api/card/${nestedCardId}`, {
    visualization_settings: {
      column_settings: { [columnKey]: { column_title: "Renamed Column" } },
    },
  });
}

// === assertions ====================================================

async function assertTargetRowVisible(page: Page) {
  // Visiting the question re-runs its query against the writable DB; allow
  // more than the default timeout for the result rows to render.
  await expect(
    main(page).getByText(COMPATIBLE_TARGET_ROW_VALUE, { exact: true }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

async function assertDataSourceIs(page: Page, tableLabel: string) {
  await expect(page.getByTestId("data-step-cell")).toHaveText(tableLabel);
}

async function assertDashcardHasRows(
  page: Page,
  { visible, hidden }: { visible: string[]; hidden: string[] },
) {
  const dashcard = page.getByTestId("dashcard");
  for (const text of visible) {
    await expect(dashcard.getByText(text, { exact: true }).first()).toBeVisible();
  }
  for (const text of hidden) {
    await expect(dashcard.getByText(text, { exact: true })).toHaveCount(0);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
