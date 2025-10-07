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
      .findByLabelText("Allow people to drill through on data points")
      .should("be.checked");

    cy.log("drill-through should be enabled in the preview");
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("110.93").click();
      cy.findByText("Filter by this value").should("be.visible");
    });

    cy.log("turn off drill-through");
    getEmbedSidebar()
      .findByLabelText("Allow people to drill through on data points")
      .click()
      .should("not.be.checked");

    cy.log("drill-through should be disabled in the preview");
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("110.93").click();
      cy.findByText("Filter by this value").should("not.exist");
    });

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,theme=default,auth=user_session,drills=false,withDownloads=false,withTitle=true",
    });

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

    H.getSimpleEmbedIframeContent()
      .findByTestId("export-as-pdf-button")
      .should("be.visible");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,theme=default,auth=user_session,drills=true,withDownloads=true,withTitle=true",
    });

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

    H.getSimpleEmbedIframeContent()
      .findByText("Orders in a dashboard")
      .should("not.exist");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,theme=default,auth=user_session,drills=true,withDownloads=false,withTitle=false",
    });

    codeBlock().should("contain", 'with-title="false"');
  });

  it("toggles drill-through for charts", () => {
    navigateToEmbedOptionsStep({
      experience: "chart",
      resourceName: QUESTION_NAME,
    });

    getEmbedSidebar()
      .findByLabelText("Allow people to drill through on data points")
      .should("be.checked");

    cy.log("drill-through should be disabled by default in chart preview");
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("18,760").click();
      cy.findByText("See these Orders").should("exist");
    });

    cy.log("turn off drill-through");
    getEmbedSidebar()
      .findByLabelText("Allow people to drill through on data points")
      .click()
      .should("not.be.checked");

    cy.log("drill-through should be disabled in chart preview");
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("18,760").click();
      cy.findByText("See these Orders").should("not.exist");
    });

    cy.log("allow downloads should be visible when drills are off (EMB-712)");
    getEmbedSidebar().findByLabelText("Allow downloads").should("be.visible");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get code").click();
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

    H.getSimpleEmbedIframeContent()
      .findByTestId("question-download-widget-button")
      .should("be.visible");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,theme=default,auth=user_session,drills=true,withDownloads=true,withTitle=true,isSaveEnabled=false",
    });

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

    H.getSimpleEmbedIframeContent()
      .findByText("Orders, Count")
      .should("not.exist");

    cy.log("set drills to false");
    getEmbedSidebar()
      .findByLabelText("Allow people to drill through on data points")
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
    getEmbedSidebar().findByText("Get code").click();
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
  });

  ["exploration", "chart"].forEach((experience) => {
    it(`toggles save button for ${experience}`, () => {
      navigateToEmbedOptionsStep(
        experience === "chart"
          ? { experience: "chart", resourceName: QUESTION_NAME }
          : { experience: "exploration" },
      );

      if (experience === "exploration") {
        cy.log("visualize a question to enable the save button");
        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("Orders").click();
          cy.findByText("Visualize").click();
        });
      }

      getEmbedSidebar()
        .findByLabelText("Allow people to save new questions")
        .should("not.be.checked");

      cy.log("save button should be hidden by default");
      H.getSimpleEmbedIframeContent().findByText("Save").should("not.exist");

      cy.log("turn on save option");
      getEmbedSidebar()
        .findByLabelText("Allow people to save new questions")
        .click()
        .should("be.checked");

      if (experience === "chart") {
        cy.log("select a different visualization to enable the save button");
        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("Table").click();
          H.popover().findByText("Number").click();
        });
      }

      H.getSimpleEmbedIframeContent().within(() => {
        cy.findByText("Save").should("be.visible");
      });

      cy.log("snippet should be updated");
      getEmbedSidebar().findByText("Get code").click();

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_options_completed",
        event_detail:
          experience === "chart"
            ? "settings=custom,theme=default,auth=user_session,drills=true,withDownloads=false,withTitle=true,isSaveEnabled=true"
            : "settings=custom,theme=default,auth=user_session,isSaveEnabled=true",
      });

      codeBlock().should("contain", 'is-save-enabled="true"');
    });
  });

  it("can toggle read-only setting for browser", () => {
    navigateToEmbedOptionsStep({
      experience: "browser",
      resourceName: "First collection",
    });

    getEmbedSidebar()
      .findByLabelText("Allow editing dashboards and questions")
      .should("not.be.checked");

    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("New dashboard").should("not.exist");
    });

    cy.log("turn on editing (set read-only to false)");
    getEmbedSidebar()
      .findByLabelText("Allow editing dashboards and questions")
      .click()
      .should("be.checked");

    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("New dashboard").should("be.visible");
    });

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,theme=default,auth=user_session,readOnly=false",
    });

    codeBlock().should("contain", 'read-only="false"');
  });

  it("can change brand color and reset colors", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    cy.log("brand color should be visible");
    getEmbedSidebar().within(() => {
      cy.findByText("Brand color").should("be.visible");
    });

    cy.log("reset button should not be visible initially");
    getEmbedSidebar().findByLabelText("Reset colors").should("not.exist");

    cy.log("click on brand color picker");
    cy.findByTestId("brand-color-picker").findByRole("button").click();

    cy.log("change brand color to red");
    H.popover().within(() => {
      cy.findByDisplayValue("#509EE2")
        .should("be.visible")
        .clear()
        .type("rgb(255, 0, 0)");
    });

    cy.log("table header cell should now be red");
    H.getSimpleEmbedIframeContent()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");

    cy.log("reset button should now be visible");
    getEmbedSidebar().findByLabelText("Reset colors").should("be.visible");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,theme=custom,auth=user_session,drills=true,withDownloads=false,withTitle=true",
    });

    codeBlock().should("contain", '"theme": {');
    codeBlock().should("contain", '"colors": {');
    codeBlock().should("contain", '"brand": "#FF0000"');

    cy.log("go back to embed options step");
    getEmbedSidebar().findByText("Back").click();

    cy.log("click reset button");
    getEmbedSidebar().findByLabelText("Reset colors").click();

    cy.log("table header should be back to default blue");
    H.getSimpleEmbedIframeContent()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(80, 158, 226)");

    cy.log("reset button should be hidden again");
    getEmbedSidebar().findByLabelText("Reset colors").should("not.exist");

    cy.log("snippet should not contain theme colors");
    getEmbedSidebar().findByText("Get code").click();
    codeBlock().should("not.contain", '"theme": {');

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });
  });

  it("derives colors for dark theme palette", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    cy.log("click on brand color picker");
    cy.findByTestId("brand-color-picker").findByRole("button").click();

    H.popover().within(() => {
      cy.findByDisplayValue("#509EE2").clear().type("#BD51FD");
    });

    cy.log("change primary text color");
    cy.findByTestId("text-primary-color-picker").findByRole("button").click();
    H.popover().within(() => {
      cy.findByDisplayValue("#303D46").clear().type("#F1F1F1");
    });

    cy.log("change background color");
    cy.findByTestId("background-color-picker").findByRole("button").click();
    H.popover().within(() => {
      cy.findByDisplayValue("#FFFFFF").clear().type("#121212");
    });

    cy.log("verify the preview reflects the dark theme");
    H.getSimpleEmbedIframeContent()
      .findByTestId("dashboard")
      .should("have.css", "background-color", "rgb(18, 18, 18)");

    cy.log("check that derived colors are applied to snippet");
    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,theme=custom,auth=user_session,drills=true,withDownloads=false,withTitle=true",
    });

    // derived-colors-for-embed-flow.unit.spec.ts contains the tests for other derived colors.
    cy.log("dark mode colors should be derived");
    codeBlock().should("contain", '"background-hover": "rgb(27, 27, 27)"');
    codeBlock().should("contain", '"text-secondary": "rgb(169, 169, 169)"');
    codeBlock().should("contain", '"brand-hover": "rgba(189, 81, 253, 0.5)"');
  });
});
