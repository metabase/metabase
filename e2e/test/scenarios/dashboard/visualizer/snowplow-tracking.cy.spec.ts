import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  ACCOUNTS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PRODUCTS_COUNT_BY_CREATED_AT,
} from "e2e/support/test-visualizer-data";

const { H } = cy;

describe("Snowplow tracking", () => {
  describe("add database card", () => {
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

      H.createQuestion(ACCOUNTS_COUNT_BY_CREATED_AT, {
        idAlias: "accountsCountByCreatedAtQuestionId",
        wrapId: true,
      });
    });

    it("should track visualizer related events", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);

      H.editDashboard();
      H.openQuestionsSidebar();
      cy.log("open questions sidebar");
      H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);
      // visualize another way from question list
      H.expectUnstructuredSnowplowEvent({
        event: "visualize_another_way_clicked",
        triggered_from: "question-list",
      });

      H.modal().within(() => {
        // switch to datasets list
        cy.log("switch to datasets list");
        H.switchToAddMoreData();
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_add_more_data_clicked",
          triggered_from: "visualizer-modal",
        });

        // add a dataset
        cy.log("add a dataset");
        H.selectDataset(PRODUCTS_COUNT_BY_CREATED_AT.name);
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_data_changed",
          event_detail: "visualizer_datasource_added",
          triggered_from: "visualizer-modal",
        });

        cy.log("deselect a dataset");
        H.deselectDataset(PRODUCTS_COUNT_BY_CREATED_AT.name);
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_data_changed",
          event_detail: "visualizer_datasource_removed",
          triggered_from: "visualizer-modal",
        });

        // switch to columns list
        cy.log("switch to columns list");
        H.switchToColumnsList();
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_show_columns_clicked",
          triggered_from: "visualizer-modal",
        });

        // deselect a column
        cy.log("deselect a column");
        H.deselectColumnFromColumnsList(
          ORDERS_COUNT_BY_CREATED_AT.name,
          "Count",
        );
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_data_changed",
          event_detail: "visualizer_column_removed",
          triggered_from: "visualizer-modal",
        });

        // select a column
        cy.log("select a column");
        H.selectColumnFromColumnsList(ORDERS_COUNT_BY_CREATED_AT.name, "Count");
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_data_changed",
          event_detail: "visualizer_column_added",
          triggered_from: "visualizer-modal",
        });

        // show settings sidebar
        cy.log("show settings sidebar");
        H.toggleVisualizerSettingsSidebar();
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_settings_clicked",
          triggered_from: "visualizer-modal",
        });

        // change the visualization type
        cy.log("change the visualization type");
        H.selectVisualization("line");
        H.expectUnstructuredSnowplowEvent({
          event: "visualizer_data_changed",
          event_detail: "visualizer_viz_type_changed",
          triggered_from: "visualizer-modal",
        });
      });

      // save the card
      cy.log("save the card");
      H.saveDashcardVisualizerModal({ mode: "create" });
      H.expectUnstructuredSnowplowEvent({
        event: "visualizer_save_clicked",
        triggered_from: "visualizer-modal",
      });

      H.showDashcardVisualizerModal(1);
      // show the table preview
      cy.log("show the table preview");
      cy.findByTestId("visualizer-view-as-table-button").click();
      H.expectUnstructuredSnowplowEvent({
        event: "visualizer_view_as_table_clicked",
        triggered_from: "visualizer-modal",
      });

      cy.findByTestId("visualizer-tabular-preview-modal").within(() => {
        cy.findByLabelText("Close").click();
      });

      cy.log("resets a dataset");
      H.selectVisualization("bar");
      H.resetDataSourceButton(ORDERS_COUNT_BY_CREATED_AT.name).click();
      H.expectUnstructuredSnowplowEvent({
        event: "visualizer_data_changed",
        event_detail: "visualizer_datasource_reset",
        triggered_from: "visualizer-modal",
      });

      // remove a dataset
      cy.log("remove a dataset");
      H.removeDataSource(ORDERS_COUNT_BY_CREATED_AT.name, {
        throughMenu: true,
      });
      H.expectUnstructuredSnowplowEvent(
        {
          event: "visualizer_data_changed",
          event_detail: "visualizer_datasource_removed",
          triggered_from: "visualizer-modal",
        },
        2, // we already removed two datasets before
      );

      // close the modal
      cy.log("close the modal");
      H.closeDashcardVisualizerModal();
      H.expectUnstructuredSnowplowEvent({
        event: "visualizer_close_clicked",
        triggered_from: "visualizer-modal",
      });
    });
  });
});
