const { H } = cy;
import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

H.describeWithSnowplow("scenarios > models > revision history", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
    cy.request("PUT", `/api/card/${ORDERS_BY_YEAR_QUESTION_ID}`, {
      name: "Orders Model",
      type: "model",
    });
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should allow reverting to a saved question state and back into a model again", () => {
    H.visitModel(ORDERS_BY_YEAR_QUESTION_ID);

    openRevisionHistory();
    revertTo("You created this");

    H.expectUnstructuredSnowplowEvent({
      event: "revert_version_clicked",
      event_detail: "card",
    });

    cy.location("pathname").should("match", /^\/question\/\d+/);
    H.echartsContainer();

    H.sidesheet().findByRole("tab", { name: "History" }).click();
    revertTo("You edited this");

    cy.location("pathname").should("match", /^\/model\/\d+/);
    cy.get("[data-testid=cell-data]");
  });
});

function openRevisionHistory() {
  H.questionInfoButton().click();
  H.sidesheet().findByRole("tab", { name: "History" }).click();
  cy.findByTestId("saved-question-history-list").should("be.visible");
}

function revertTo(history) {
  const r = new RegExp(history);
  cy.findByText(r).closest("li").findByTestId("question-revert-button").click();
}
