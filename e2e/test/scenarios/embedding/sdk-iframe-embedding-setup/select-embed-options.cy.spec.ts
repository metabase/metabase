import {
  codeBlock,
  getEmbedSidebar,
  navigateToEmbedOptionsStep,
} from "./helpers";

const { H } = cy;

const DASHBOARD_NAME = "Orders in a dashboard";
const QUESTION_NAME = "Orders, Count";

const suiteTitle =
  "scenarios > embedding > sdk iframe embed setup > select embed options";

H.describeWithSnowplow(suiteTitle, () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("toggles drill-throughs for dashboards", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar()
      .findByLabelText("Allow users to drill through on data points")
      .should("be.checked");

    cy.log("drill-through should be enabled in the preview");
    H.getIframeBody().within(() => {
      cy.findByText("110.93").click();
      cy.findByText("Filter by this value").should("be.visible");
    });

    cy.log("turn off drill-through");
    getEmbedSidebar()
      .findByLabelText("Allow users to drill through on data points")
      .click()
      .should("not.be.checked");

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_option_changed",
      event_detail: "isDrillThroughEnabled",
    });

    cy.log("drill-through should be disabled in the preview");
    H.getIframeBody().within(() => {
      cy.findByText("110.93").click();
      cy.findByText("Filter by this value").should("not.exist");
    });

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get Code").click();
    codeBlock().should("contain", 'drills="false"');
  });

  it("toggles downloads for dashboard", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar()
      .findByLabelText("Allow downloads")
      .should("not.be.checked");

    H.getIframeBody().findByTestId("export-as-pdf-button").should("not.exist");

    cy.log("turn on downloads");
    getEmbedSidebar()
      .findByLabelText("Allow downloads")
      .click()
      .should("be.checked");

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_option_changed",
      event_detail: "withDownloads",
    });

    H.getIframeBody().findByTestId("export-as-pdf-button").should("be.visible");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get Code").click();
    codeBlock().should("contain", 'with-downloads="true"');
  });

  it("toggles dashboard title for dashboards", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar()
      .findByLabelText("Show dashboard title")
      .should("be.checked");

    H.getIframeBody().findByText("Orders in a dashboard").should("be.visible");

    cy.log("turn off title");
    getEmbedSidebar()
      .findByLabelText("Show dashboard title")
      .click()
      .should("not.be.checked");

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_option_changed",
      event_detail: "withTitle",
    });

    H.getIframeBody().findByText("Orders in a dashboard").should("not.exist");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get Code").click();
    codeBlock().should("contain", 'with-title="false"');
  });

  it("toggles drill-through for charts", () => {
    navigateToEmbedOptionsStep({
      experience: "chart",
      resourceName: QUESTION_NAME,
    });

    getEmbedSidebar()
      .findByLabelText("Allow users to drill through on data points")
      .should("be.checked");

    cy.log("drill-through should be disabled by default in chart preview");
    H.getIframeBody().within(() => {
      cy.findByText("18,760").click();
      cy.findByText("See these Orders").should("exist");
    });

    cy.log("turn off drill-through");
    getEmbedSidebar()
      .findByLabelText("Allow users to drill through on data points")
      .click()
      .should("not.be.checked");

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_option_changed",
      event_detail: "isDrillThroughEnabled",
    });

    cy.log("drill-through should be disabled in chart preview");
    H.getIframeBody().within(() => {
      cy.findByText("18,760").click();
      cy.findByText("See these Orders").should("not.exist");
    });

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get Code").click();
    codeBlock().should("contain", 'drills="false"');
  });

  it("toggles downloads for charts", () => {
    navigateToEmbedOptionsStep({
      experience: "chart",
      resourceName: QUESTION_NAME,
    });

    getEmbedSidebar()
      .findByLabelText("Allow downloads")
      .should("not.be.checked");

    H.getIframeBody()
      .findByTestId("question-download-widget-button")
      .should("not.exist");

    cy.log("turn on downloads");
    getEmbedSidebar()
      .findByLabelText("Allow downloads")
      .click()
      .should("be.checked");

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_option_changed",
      event_detail: "withDownloads",
    });

    H.getIframeBody()
      .findByTestId("question-download-widget-button")
      .should("be.visible");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get Code").click();
    codeBlock().should("contain", 'with-downloads="true"');
  });

  it("toggles chart title for charts", () => {
    navigateToEmbedOptionsStep({
      experience: "chart",
      resourceName: QUESTION_NAME,
    });

    cy.log("chart title should be visible by default");
    getEmbedSidebar().findByLabelText("Show chart title").should("be.checked");
    H.getIframeBody().findByText("Orders, Count").should("be.visible");

    cy.log("turn off title");
    getEmbedSidebar()
      .findByLabelText("Show chart title")
      .click()
      .should("not.be.checked");

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_option_changed",
      event_detail: "withTitle",
    });

    H.getIframeBody().findByText("Orders, Count").should("not.exist");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get Code").click();
    codeBlock().should("contain", 'with-title="false"');
  });

  it("toggles save button for exploration", () => {
    navigateToEmbedOptionsStep({ experience: "exploration" });

    H.getIframeBody().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("Visualize").click();
    });

    getEmbedSidebar()
      .findByLabelText("Allow users to save new questions")
      .should("be.checked");

    cy.log("save button should be visible by default");
    H.getIframeBody().findByText("Save").should("be.visible");

    cy.log("turn off save option");
    getEmbedSidebar()
      .findByLabelText("Allow users to save new questions")
      .click()
      .should("not.be.checked");

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_option_changed",
      event_detail: "isSaveEnabled",
    });

    H.getIframeBody().findByText("Save").should("not.exist");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get Code").click();
    codeBlock().should("contain", 'is-save-enabled="false"');
  });

  it("can change brand color", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    cy.log("brand color should be visible");
    getEmbedSidebar().within(() => {
      cy.findByText("Brand Color").should("be.visible");
    });

    cy.log("click on brand color picker");
    cy.findByLabelText("#509EE3").click();

    cy.log("change brand color to red");
    H.popover().within(() => {
      cy.findByDisplayValue("#509EE3")
        .should("be.visible")
        .clear()
        .type("rgb(255, 0, 0)");
    });

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_option_changed",
      event_detail: "theme",
    });

    cy.log("table header cell should now be red");
    H.getIframeBody()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get Code").click();

    codeBlock().should("contain", '"theme": {');
    codeBlock().should("contain", '"colors": {');
    codeBlock().should("contain", '"brand": "#FF0000"');
  });
});
