/**
 * Port of e2e/test/scenarios/dashboard/visualizer/snowplow-tracking.cy.spec.ts
 *
 * Snowplow is CAPTURED, not stubbed. PORTING rule 6 ("snowplow helpers → no-op
 * stubs") exists so specs where snowplow is incidental don't need the
 * snowplow-micro container; it cannot apply here, because every assertion in
 * this spec is a snowplow assertion — stubbing would port the single test as a
 * no-op. `installSnowplowCapture` (support/search-snowplow.ts) records the
 * tracker's own POST body at the browser boundary: no container, no shared
 * global store, no cross-slot contention.
 *
 * Intercepts:
 * - `@dataset` / `@cardQuery` / `@dashcardQuery` are registered upstream but
 *   only `@cardQuery` is ever awaited, and only from inside H.selectDataset —
 *   the ported `selectDataset` registers that wait itself. The other two are
 *   never awaited (rule 2: drop never-awaited intercepts).
 * - `GET /api/setting/version-info` → `{}` is a real stub and is ported.
 *
 * H.resetSnowplow() → the capture starts empty and is installed before the
 * first navigation (the tracker is created during app bootstrap).
 * H.enableTracking() → `updateSetting("anon-tracking-enabled", true)`; the
 * capture already forces that setting on client-side, in both
 * `window.MetabaseBootstrap` and `/api/session/properties`.
 */
import {
  ORDERS_DASHBOARD_ID,
} from "../support/sample-data";
import { editDashboard } from "../support/dashboard";
import { expect, test } from "../support/fixtures";
import {
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import type { SnowplowCapture } from "../support/search-snowplow";
import { visitDashboard } from "../support/ui";
import {
  ORDERS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PRODUCTS_COUNT_BY_CREATED_AT,
  clickVisualizeAnotherWay,
  createQuestion,
  deselectColumnFromColumnsList,
  openQuestionsSidebar,
  resetDataSourceButton,
  saveDashcardVisualizerModal,
  selectColumnFromColumnsList,
  selectDataset,
  selectVisualization,
  showDashcardVisualizerModal,
  switchToAddMoreData,
  switchToColumnsList,
} from "../support/visualizer-basics";
import {
  ACCOUNTS_COUNT_BY_CREATED_AT,
  closeDashcardVisualizerModal,
  deselectDataset,
  removeDataSourceThroughMenu,
  toggleVisualizerSettingsSidebar,
} from "../support/visualizer-snowplow-tracking";

test.describe("Snowplow tracking", () => {
  test.describe("add database card", () => {
    let snowplow: SnowplowCapture;

    test.beforeEach(async ({ page, mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      // H.resetSnowplow() + H.enableTracking(): the capture starts empty and
      // forces anon-tracking/snowplow on in the browser.
      snowplow = await installSnowplowCapture(page, mb.baseUrl);

      await page.route(
        (url) => url.pathname === "/api/setting/version-info",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: "{}",
          }),
      );

      await mb.signInAsNormalUser();

      // Created as the normal user, matching the upstream ordering (the
      // creates come after signInAsNormalUser).
      await createQuestion(mb.api, ORDERS_COUNT_BY_CREATED_AT);
      await createQuestion(mb.api, ORDERS_COUNT_BY_PRODUCT_CATEGORY);
      await createQuestion(mb.api, PRODUCTS_COUNT_BY_CREATED_AT);
      await createQuestion(mb.api, ACCOUNTS_COUNT_BY_CREATED_AT);
    });

    test("should track visualizer related events", async ({ page, mb }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

      await editDashboard(page);
      await openQuestionsSidebar(page);
      await clickVisualizeAnotherWay(page, ORDERS_COUNT_BY_CREATED_AT.name);
      // visualize another way from question list
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualize_another_way_clicked",
        triggered_from: "question-list",
      });

      // switch to datasets list
      await switchToAddMoreData(page);
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualizer_add_more_data_clicked",
        triggered_from: "visualizer-modal",
      });

      // add a dataset
      await selectDataset(page, PRODUCTS_COUNT_BY_CREATED_AT.name);
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualizer_data_changed",
        event_detail: "visualizer_datasource_added",
        triggered_from: "visualizer-modal",
      });

      // deselect a dataset
      await deselectDataset(page, PRODUCTS_COUNT_BY_CREATED_AT.name);
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualizer_data_changed",
        event_detail: "visualizer_datasource_removed",
        triggered_from: "visualizer-modal",
      });

      // switch to columns list
      await switchToColumnsList(page);
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualizer_show_columns_clicked",
        triggered_from: "visualizer-modal",
      });

      // deselect a column
      await deselectColumnFromColumnsList(
        page,
        ORDERS_COUNT_BY_CREATED_AT.name,
        "Count",
      );
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualizer_data_changed",
        event_detail: "visualizer_column_removed",
        triggered_from: "visualizer-modal",
      });

      // select a column
      await selectColumnFromColumnsList(
        page,
        ORDERS_COUNT_BY_CREATED_AT.name,
        "Count",
      );
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualizer_data_changed",
        event_detail: "visualizer_column_added",
        triggered_from: "visualizer-modal",
      });

      // show settings sidebar
      await toggleVisualizerSettingsSidebar(page);
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualizer_settings_clicked",
        triggered_from: "visualizer-modal",
      });

      // change the visualization type
      await selectVisualization(page, "line");
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualizer_data_changed",
        event_detail: "visualizer_viz_type_changed",
        triggered_from: "visualizer-modal",
      });

      // save the card
      await saveDashcardVisualizerModal(page, { mode: "create" });
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualizer_save_clicked",
        triggered_from: "visualizer-modal",
      });

      await showDashcardVisualizerModal(page, 1);
      // show the table preview
      await page.getByTestId("visualizer-view-as-table-button").click();
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualizer_view_as_table_clicked",
        triggered_from: "visualizer-modal",
      });

      const tabularPreview = page.getByTestId(
        "visualizer-tabular-preview-modal",
      );
      await tabularPreview.getByLabel("Close").click();
      await expect(tabularPreview).toHaveCount(0);

      // resets a dataset
      await selectVisualization(page, "bar");
      await (
        await resetDataSourceButton(page, ORDERS_COUNT_BY_CREATED_AT.name)
      ).click();
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualizer_data_changed",
        event_detail: "visualizer_datasource_reset",
        triggered_from: "visualizer-modal",
      });

      // remove a dataset
      await removeDataSourceThroughMenu(
        page,
        ORDERS_COUNT_BY_CREATED_AT.name,
      );
      await expectUnstructuredSnowplowEvent(
        snowplow,
        {
          event: "visualizer_data_changed",
          event_detail: "visualizer_datasource_removed",
          triggered_from: "visualizer-modal",
        },
        2, // we already removed two datasets before
      );

      // close the modal
      await closeDashcardVisualizerModal(page);
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "visualizer_close_clicked",
        triggered_from: "visualizer-modal",
      });
      // NB: no "the modal is gone" assertion here, and upstream has none
      // either — closing the visualizer with unsaved changes leaves the modal
      // mounted behind an "Are you sure you want to leave?" confirmation. The
      // event is the subject; the dismissal path is not.
    });
  });
});
