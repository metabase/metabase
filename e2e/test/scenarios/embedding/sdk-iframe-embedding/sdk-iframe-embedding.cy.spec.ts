import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    cy.signOut();
  });

  it("displays a dashboard", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
    });

    cy.wait("@getDashCardQuery");

    frame.within(() => {
      cy.findByText("Orders in a dashboard").should("be.visible");
      cy.findByText("Orders").should("be.visible");
      H.assertTableRowsCount(2000);
    });
  });

  it("displays a question", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      questionId: ORDERS_QUESTION_ID,
    });

    cy.wait("@getCardQuery");

    frame.within(() => {
      cy.findByText("Orders").should("be.visible");

      cy.log("1. shows a table");
      H.tableInteractive().within(() => {
        cy.findByText("Total").should("be.visible");
        cy.findByText("37.65").should("be.visible");
      });

      cy.findByTestId("chart-type-selector-button").click();

      cy.log("2. can switch to a trend chart");
      cy.findByRole("menu").within(() => {
        cy.findByText("Trend").click();
      });

      cy.findByText("2000").should("be.visible");
    });
  });

  it("displays the exploration template", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      template: "exploration",
    });

    frame.within(() => {
      cy.findByText("Orders").should("be.visible");

      // Wait until the entity picker modal is visible
      frame.contains("Pick your starting data");

      H.popover().within(() => {
        cy.findByText("Orders").click();
      });

      cy.findByRole("button", { name: "Visualize" }).click();

      // Should not show a loading indicator again as the question has not changed (metabase#47564)
      cy.findByTestId("loading-indicator").should("not.exist");

      // Should show a visualization after clicking "Visualize"
      // and should not show an error message (metabase#55398)
      cy.findByText("Question not found").should("not.exist");
      cy.findByText("110.93").should("be.visible"); // table data

      // We hide the "Save" button for now. This will definitely be changed in the future.
      cy.findByRole("button", { name: "Save" }).should("not.exist");
    });
  });
});
