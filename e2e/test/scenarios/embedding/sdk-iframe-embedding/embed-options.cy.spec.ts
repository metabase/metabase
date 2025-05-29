import {
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed options passthrough", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    cy.signOut();
  });

  it("shows a static question with isDrillThroughEnabled=false", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      questionId: ORDERS_QUESTION_ID,
      isDrillThroughEnabled: false,
    });

    cy.wait("@getCardQuery");

    frame.within(() => {
      cy.log("1. static question must not contain title and toolbar");
      cy.findByText("Orders").should("not.exist");
      cy.findByTestId("interactive-question-result-toolbar").should(
        "not.exist",
      );

      cy.log("2. clicking on the column value should not show the popover");
      cy.findAllByText("37.65").first().should("be.visible").click();
      cy.findByText(/Filter by this value/).should("not.exist");
    });
  });

  it("shows a static dashboard using isDrillThroughEnabled=false, withTitle=false, withDownloads=true", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
      isDrillThroughEnabled: false,
      withTitle: false,
      withDownloads: true,
    });

    cy.wait("@getDashCardQuery");

    frame.within(() => {
      cy.log("1. card title should be visible");
      cy.findByText("Orders").should("be.visible");

      cy.log("2. dashboard title should not exist -- withTitle=false");
      cy.findByText("Orders in a dashboard").should("not.exist");

      cy.log("3. download button should be visible -- withDownloads=true");
      cy.get('[aria-label="Download as PDF"]').should("be.visible");

      cy.log("4. clicking on the column value should not show the popover");
      cy.findAllByText("37.65").first().should("be.visible").click();
      cy.findByText(/Filter by this value/).should("not.exist");
    });
  });

  it("renders an interactive question with isDrillThroughEnabled=true, withTitle=false, withDownloads=true", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      questionId: ORDERS_QUESTION_ID,
      isDrillThroughEnabled: true,
      withDownloads: true,
      withTitle: false,
    });

    cy.wait("@getCardQuery");

    frame.within(() => {
      cy.log("1. card title should not exist");
      cy.findByText("Orders").should("not.exist");

      cy.log("2. download button on the toolbar should be visible");
      cy.get("[aria-label='download icon']").should("be.visible");

      cy.log("3. clicking on the column value should show the popover");
      cy.findAllByText("37.65").first().should("be.visible").click();
      cy.findByText(/Filter by this value/).should("be.visible");

      cy.log("4. clicking on the filter should drill down");
      cy.get('[type="filter"] button').first().click();
      cy.findAllByText("29.8").first().should("be.visible");
    });
  });

  it("renders an interactive dashboard with isDrillThroughEnabled=true, withDownloads=true, withTitle=false", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
      isDrillThroughEnabled: true,
      withDownloads: true,
      withTitle: false,
    });

    cy.wait("@getDashCardQuery");

    frame.within(() => {
      cy.log("1. dashboard title should not exist -- withTitle=false");
      cy.findByText("Orders in a dashboard").should("not.exist");

      cy.log("2. card title should be visible");
      cy.findByText("Orders").should("be.visible");

      cy.log("3. download button should be visible -- withDownloads=true");
      cy.get('[aria-label="Download as PDF"]').should("be.visible");

      cy.log("4. clicking on the column value should show the popover");
      cy.findAllByText("37.65").first().should("be.visible").click();
      cy.findByText(/Filter by this value/).should("be.visible");

      cy.log("5. clicking on the filter should drill down");
      cy.get('[type="filter"] button').first().click();
      cy.findAllByText("29.8").first().should("be.visible");
      cy.findByText("New question").should("be.visible");

      cy.log("6. saving should be disabled in drill-throughs");
      cy.findByText("Save").should("not.exist");
    });
  });

  it("renders the exploration template with isSaveEnabled=true, targetCollection, entityTypes", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      template: "exploration",
      isSaveEnabled: true,
      targetCollection: FIRST_COLLECTION_ID,
      entityTypes: ["table"],
    });

    frame.within(() => {
      cy.findByText("Pick your starting data").should("be.visible");

      H.popover().within(() => {
        cy.findByText("Orders").click();
      });

      cy.findByRole("button", { name: "Visualize" }).click();

      cy.log("1. clicking on the filter should drill down");
      cy.findAllByText("37.65").first().should("be.visible").click();
      cy.findByText(/Filter by this value/).should("be.visible");
      cy.get('[type="filter"] button').first().click();
      cy.findAllByText("29.8").first().should("be.visible");
      cy.findByText("New question").should("be.visible");

      cy.log("2. saving should be enabled");
      cy.findByText("Save").click();

      cy.log(
        "3. we should not see the collection picker as we have a target collection",
      );
      cy.findByText("Where do you want to save this?").should("not.exist");
    });
  });
});
