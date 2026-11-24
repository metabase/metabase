import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { ORDERS_COUNT_BY_CREATED_AT } from "e2e/support/test-visualizer-data";

const { H } = cy;

// Which visualizer action fires which event is covered in
// DashboardApp.visualizer.unit.spec.tsx. This test proves that the events
// reach the Snowplow collector and pass its schema validation.
describe("scenarios > visualizer > snowplow tracking", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();

    cy.intercept("GET", "/api/setting/version-info", {});

    cy.signInAsNormalUser();

    H.createQuestion(ORDERS_COUNT_BY_CREATED_AT);
  });

  it("should send visualizer events to the collector", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();
    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);
    H.expectUnstructuredSnowplowEvent({
      event: "visualize_another_way_clicked",
      triggered_from: "question-list",
    });

    H.modal().within(() => {
      // the question is already a line chart, and re-selecting the current
      // type isn't a change
      H.selectVisualization("area");
    });
    H.expectUnstructuredSnowplowEvent({
      event: "visualizer_data_changed",
      event_detail: "visualizer_viz_type_changed",
      triggered_from: "visualizer-modal",
    });

    H.saveDashcardVisualizerModal({ mode: "create" });
    H.expectUnstructuredSnowplowEvent({
      event: "visualizer_save_clicked",
      triggered_from: "visualizer-modal",
    });
  });
});
