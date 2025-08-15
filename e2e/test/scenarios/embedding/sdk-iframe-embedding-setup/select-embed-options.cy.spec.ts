import { mockEmbedJsToDevServer } from "e2e/support/helpers";

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
    H.updateSetting("enable-embedding-simple", true);

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    mockEmbedJsToDevServer();
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
    H.getSimpleEmbedIframeContent().within(() => {
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
      event_detail: "drills",
    });

    cy.log("drill-through should be disabled in the preview");
    H.getSimpleEmbedIframeContent().within(() => {
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

    H.getSimpleEmbedIframeContent()
      .findByTestId("export-as-pdf-button")
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

    H.getSimpleEmbedIframeContent()
      .findByTestId("export-as-pdf-button")
      .should("be.visible");

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

    H.getSimpleEmbedIframeContent()
      .findByText("Orders in a dashboard")
      .should("be.visible");

    cy.log("turn off title");
    getEmbedSidebar()
      .findByLabelText("Show dashboard title")
      .click()
      .should("not.be.checked");

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_option_changed",
      event_detail: "withTitle",
    });

    H.getSimpleEmbedIframeContent()
      .findByText("Orders in a dashboard")
      .should("not.exist");

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
    H.getSimpleEmbedIframeContent().within(() => {
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
      event_detail: "drills",
    });

    cy.log("drill-through should be disabled in chart preview");
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("18,760").click();
      cy.findByText("See these Orders").should("not.exist");
    });

    cy.log("allow downloads should be visible when drills are off (EMB-712)");
    getEmbedSidebar().findByLabelText("Allow downloads").should("be.visible");

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

    H.getSimpleEmbedIframeContent()
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

    H.getSimpleEmbedIframeContent()
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
    H.getSimpleEmbedIframeContent()
      .findByText("Orders, Count")
      .should("be.visible");

    cy.log("turn off title");
    getEmbedSidebar()
      .findByLabelText("Show chart title")
      .should("be.checked")
      .click()
      .should("not.be.checked");

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_option_changed",
      event_detail: "withTitle",
    });

    H.getSimpleEmbedIframeContent()
      .findByText("Orders, Count")
      .should("not.exist");

    cy.log("set drills to false");
    getEmbedSidebar()
      .findByLabelText("Allow users to drill through on data points")
      .should("be.checked")
      .click()
      .should("not.be.checked");

    cy.log("chart title state should remain unchecked");
    getEmbedSidebar()
      .findByLabelText("Show chart title")
      .should("not.be.checked");

    cy.log("chart title should remain hidden");
    H.getSimpleEmbedIframeContent()
      .findByText("Orders, Count")
      .should("not.exist");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get Code").click();
    codeBlock().should("contain", 'with-title="false"');

    cy.log("go back to embed options step");
    getEmbedSidebar().findByText("Back").click();

    cy.log("show the chart title");
    getEmbedSidebar()
      .findByLabelText("Show chart title")
      .should("not.be.checked")
      .click()
      .should("be.checked");

    cy.log("chart title should be visible again");
    H.getSimpleEmbedIframeContent()
      .findByText("Orders, Count")
      .should("be.visible");

    H.expectUnstructuredSnowplowEvent(
      {
        event: "embed_wizard_option_changed",
        event_detail: "withTitle",
      },
      2,
    );
  });

  it("toggles save button for exploration", () => {
    navigateToEmbedOptionsStep({ experience: "exploration" });

    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("Visualize").click();
    });

    getEmbedSidebar()
      .findByLabelText("Allow users to save new questions")
      .should("not.be.checked");

    cy.log("save button should be hidden by default");
    H.getSimpleEmbedIframeContent().findByText("Save").should("not.exist");

    cy.log("turn on save option");
    getEmbedSidebar()
      .findByLabelText("Allow users to save new questions")
      .click()
      .should("be.checked");

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_option_changed",
      event_detail: "isSaveEnabled",
    });

    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("Save").should("be.visible");
    });

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get Code").click();
    codeBlock().should("contain", 'is-save-enabled="true"');
  });

  it("can change brand color and reset colors", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    cy.log("brand color should be visible");
    getEmbedSidebar().within(() => {
      cy.findByText("Brand Color").should("be.visible");
    });

    cy.log("reset button should not be visible initially");
    getEmbedSidebar().findByLabelText("Reset colors").should("not.exist");

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
    H.getSimpleEmbedIframeContent()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");

    cy.log("reset button should now be visible");
    getEmbedSidebar().findByLabelText("Reset colors").should("be.visible");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get Code").click();

    codeBlock().should("contain", '"theme": {');
    codeBlock().should("contain", '"colors": {');
    codeBlock().should("contain", '"brand": "#FF0000"');

    cy.log("go back to embed options step");
    getEmbedSidebar().findByText("Back").click();

    cy.log("click reset button");
    getEmbedSidebar().findByLabelText("Reset colors").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_option_changed",
      event_detail: "theme",
    });

    cy.log("table header should be back to default blue");
    H.getSimpleEmbedIframeContent()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(80, 158, 227)");

    cy.log("reset button should be hidden again");
    getEmbedSidebar().findByLabelText("Reset colors").should("not.exist");

    cy.log("snippet should not contain theme colors");
    getEmbedSidebar().findByText("Get Code").click();
    codeBlock().should("not.contain", '"theme": {');
  });
});
