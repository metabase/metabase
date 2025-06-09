import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  ORDERS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PRODUCTS_COUNT_BY_CREATED_AT,
} from "e2e/support/test-visualizer-data";

const { H } = cy;

describe("Snowplow tracking", () => {
  H.describeWithSnowplow("add database card", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.restore();
      cy.signInAsAdmin();
      H.enableTracking();

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");
      cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
        "dashcardQuery",
      );
      cy.intercept("GET", "/api/setting/version-info", {});

      cy.signInAsNormalUser();

      H.createQuestion(ORDERS_COUNT_BY_CREATED_AT, {
        idAlias: "ordersCountByCreatedAtQuestionId",
        wrapId: true,
      });
      H.createQuestion(ORDERS_COUNT_BY_PRODUCT_CATEGORY, {
        idAlias: "ordersCountByProductCategoryQuestionId",
        wrapId: true,
      });
      H.createQuestion(PRODUCTS_COUNT_BY_CREATED_AT, {
        idAlias: "productsCountByCreatedAtQuestionId",
        wrapId: true,
      });
    });

    it("should track visualizer related events", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);

      H.editDashboard();
      H.openQuestionsSidebar();
      H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);
      // visualize another way from question list
      H.expectUnstructuredSnowplowEvent({
        event: "visualize_another_way_clicked",
        triggered_from: "question-list",
      });

      H.modal().within(() => {
        // switch to datasets list
        H.switchToAddMoreData();
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_add_more_data_clicked",
          triggered_from: "visualizer-modal",
        });

        // add a dataset
        H.addDataset(PRODUCTS_COUNT_BY_CREATED_AT.name);
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_data_changed",
          event_detail: "visualizer_datasource_added",
          triggered_from: "visualizer-modal",
          event_data: "card:82", // ideally this would be dynamic
        });

        // deselect a dataset
        H.deselectDataset(PRODUCTS_COUNT_BY_CREATED_AT.name);
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_data_changed",
          event_detail: "visualizer_datasource_removed",
          triggered_from: "visualizer-modal",
          event_data: "card:82", // ideally this would be dynamic
        });

        // select a dataset (i.e. replace other ones with a new one)
        H.selectDataset(ORDERS_COUNT_BY_PRODUCT_CATEGORY.name);
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_data_changed",
          event_detail: "visualizer_datasource_replaced",
          triggered_from: "visualizer-modal",
          event_data: "card:81", // ideally this would be dynamic
        });

        // switch to columns list
        H.switchToColumnsList();
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_show_columns_clicked",
          triggered_from: "visualizer-modal",
        });

        // deselect a column
        H.deselectColumnFromColumnsList(
          ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
          "Count",
        );
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_data_changed",
          event_detail: "visualizer_column_removed",
          triggered_from: "visualizer-modal",
          event_data: "source: card:81, column: count",
        });

        // select a column
        H.selectColumnFromColumnsList(
          ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
          "Count",
        );
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_data_changed",
          event_detail: "visualizer_column_added",
          triggered_from: "visualizer-modal",
          event_data: "source: card:81, column: count",
        });

        // show settings sidebar
        H.toggleVisualizerSettingsSidebar();
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_settings_clicked",
          triggered_from: "visualizer-modal",
        });

        // change the visualization type
        H.selectVisualization("line");
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_data_changed",
          event_detail: "visualizer_viz_type_changed",
          triggered_from: "visualizer-modal",
          event_data: "line",
        });
      });

      // save the card
      H.saveDashcardVisualizerModal({ mode: "create" });
      H.expectUnstructuredSnowplowEvent({
        event: "visualizer_save_clicked",
        triggered_from: "visualizer-modal",
      });

      H.showDashcardVisualizerModal(1);
      // show the table preview
      cy.findByTestId("visualizer-view-as-table-button").click();
      H.expectUnstructuredSnowplowEvent({
        event: "visualizer_view_as_table_clicked",
        triggered_from: "visualizer-modal",
      });

      cy.findByTestId("visualizer-tabular-preview-modal").within(() => {
        cy.findByLabelText("Close").click();
      });

      // close the modal
      H.closeDashcardVisualizerModal();
      H.expectUnstructuredSnowplowEvent({
        event: "visualizer_close_clicked",
        triggered_from: "visualizer-modal",
      });
    });
  });
});
