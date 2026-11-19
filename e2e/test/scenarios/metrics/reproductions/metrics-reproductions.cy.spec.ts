const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 79571", () => {
  const METRIC_NAME = "Metric 79571";

  const ORDERS_COUNT_METRIC: StructuredQuestionDetails = {
    name: METRIC_NAME,
    type: "metric",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("logs choosing a metric as a recent selection, offers custom column and join actions on it, and lists it under Recent items (metabase#79571)", () => {
    H.createQuestion(ORDERS_COUNT_METRIC).then(({ body: { id: metricId } }) => {
      cy.intercept("POST", "/api/activity/recents").as("logRecent");

      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText(METRIC_NAME).click();
      });

      cy.wait("@logRecent").then(({ request, response }) => {
        expect(request.body).to.deep.equal({
          model: "metric",
          model_id: metricId,
          context: "selection",
        });
        expect(response?.statusCode).to.eq(204);
      });

      H.getNotebookStep("data").within(() => {
        cy.findByTestId("action-buttons")
          .button("Custom column")
          .should("be.visible");
        cy.findByTestId("action-buttons")
          .button("Join data")
          .should("be.visible");
      });

      // Reopening the picker now surfaces the metric under Recent items
      H.getNotebookStep("data").findByText("Orders").click();
      H.miniPickerHeader().click();
      H.miniPickerBrowseAll().click();
      H.entityPickerModalItem(0, "Recent items").click();
      cy.findByRole("dialog", { name: "Pick your starting data" })
        .findByText(METRIC_NAME)
        .should("exist");
    });
  });
});
