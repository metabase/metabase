import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  embedModalEnableEmbedding,
  mockEmbedJsToDevServer,
} from "e2e/support/helpers";

import {
  codeBlock,
  getEmbedSidebar,
  navigateToEmbedOptionsStep,
} from "./helpers";

const { H } = cy;

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const DASHBOARD_NAME = "Orders in a dashboard";
const QUESTION_NAME = "Orders, Count";

const suiteTitle =
  "scenarios > embedding > sdk iframe embed setup > select embed options";

describe("OSS", { tags: "@OSS" }, () => {
  describe(suiteTitle, () => {
    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.enableTracking();
      H.updateSetting("enable-embedding-simple", true);

      cy.intercept("GET", "/api/dashboard/**").as("dashboard");
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");

      mockEmbedJsToDevServer();
    });

    it("should show upsell for Allow subscriptions option", () => {
      navigateToEmbedOptionsStep({
        experience: "dashboard",
        resourceName: DASHBOARD_NAME,
      });

      getEmbedSidebar().findByTestId("upsell-card").should("be.visible");
    });
  });
});

describe("EE without license", () => {
  describe(suiteTitle, () => {
    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.activateToken("starter");
      H.enableTracking();
      H.updateSetting("enable-embedding-simple", true);

      cy.intercept("GET", "/api/dashboard/**").as("dashboard");
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");

      mockEmbedJsToDevServer();
    });

    it("should show upsell banner", () => {
      navigateToEmbedOptionsStep({
        experience: "dashboard",
        resourceName: DASHBOARD_NAME,
      });

      getEmbedSidebar().findByTestId("upsell-card").should("be.visible");
    });
  });
});

describe(suiteTitle, () => {
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

  it("toggles drill-throughs for dashboards when SSO auth method is selected", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
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
        "settings=custom,experience=dashboard,authType=sso,drills=false,withDownloads=false,withSubscriptions=false,withTitle=true,isSaveEnabled=false,theme=default",
    });

    codeBlock().should("contain", 'drills="false"');
  });

  it("toggles downloads for dashboard", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
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
        "settings=custom,experience=dashboard,authType=sso,drills=true,withDownloads=true,withSubscriptions=false,withTitle=true,isSaveEnabled=false,theme=default",
    });

    codeBlock().should("contain", 'with-subscriptions="false"');
  });

  it("cannot select subscriptions for dashboard when email is not set up", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar()
      .findByLabelText("Allow subscriptions")
      .should("not.be.checked")
      .and("be.disabled");

    cy.log("Email warning should only be shown on non-guest embedding");
    getEmbedSidebar()
      .findByLabelText("Allow subscriptions")
      .closest("[data-testid=tooltip-warning]")
      .icon("info")
      .realHover();
    H.tooltip().should(
      "contain.text",
      "Not available if Guest Mode is selected",
    );

    H.getSimpleEmbedIframeContent()
      .findByRole("button", { name: "Subscriptions" })
      .should("not.exist");

    cy.log("snippet should show subscriptions as false");
    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });

    cy.log("test non-guest embeds");
    getEmbedSidebar().within(() => {
      cy.button("Back").click();
      cy.button("Back").click();
      cy.button("Back").click();

      cy.findByLabelText("Metabase account (SSO)").click();
    });

    embedModalEnableEmbedding();

    getEmbedSidebar().within(() => {
      cy.button("Next").click();
      cy.button("Next").click();

      cy.findByLabelText("Allow subscriptions")
        .closest("[data-testid=tooltip-warning]")
        .icon("info")
        .realHover();
    });
    H.hovercard().should(
      "contain.text",
      "To allow subscriptions, set up email in admin settings",
    );
  });

  it("toggles subscriptions for dashboard when email is set up", () => {
    H.setupSMTP();
    const dashboardName = "Dashboard with parameter";

    cy.log("Create a dashboard with a single parameter mapped to a card");
    const parameter = {
      id: "1b9cd9f1",
      name: "Category",
      slug: "category",
      type: "string/=",
      sectionId: "string",
    };

    const questionDetails = {
      display: "table",
      query: { "source-table": PRODUCTS_ID },
    } as const;

    const dashboardDetails = {
      name: dashboardName,
      parameters: [parameter],
    };

    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 16,
            size_y: 8,
            parameter_mappings: [
              {
                parameter_id: parameter.id,
                card_id,
                target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
              },
            ],
            visualization_settings: {},
          },
        ],
      });
    });

    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: dashboardName,
      preselectSso: true,
    });

    getEmbedSidebar()
      .findByLabelText("Allow subscriptions")
      .should("not.be.checked");

    H.getSimpleEmbedIframeContent()
      .findByRole("button", { name: "Subscriptions" })
      .should("not.exist");

    cy.log("turn on subscriptions");
    getEmbedSidebar()
      .findByLabelText("Allow subscriptions")
      .click()
      .should("be.checked");

    cy.log(
      "assert that unchecking subscriptions will close the subscription sidebar",
    );
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByRole("button", { name: "Subscriptions" })
        .should("be.visible")
        .click();

      cy.findByRole("heading", { name: "Email this dashboard" }).should(
        "be.visible",
      );

      cy.log("can customize filter values");
      cy.findByRole("heading", {
        name: "Set filter values for when this gets sent",
      }).should("be.visible");

      /**
       * It seems `should("be.visible")` above doesn't not work in iframe.
       * It can only check the existence of the element but not its visibility.
       */
      cy.findByTestId("dashboard").then(($dashboard) => {
        const EXPECTED_APPROX_WIDTH = 800;
        const ERROR_TOLERANCE = 50;
        const dashboardWidth = $dashboard.width();
        expect(
          dashboardWidth,
          "EAJS preview should scale when opening a dashboard sidebar (EMB-1120)",
        ).to.be.within(
          EXPECTED_APPROX_WIDTH - ERROR_TOLERANCE,
          EXPECTED_APPROX_WIDTH + ERROR_TOLERANCE,
        );
      });
    });

    getEmbedSidebar()
      .findByLabelText("Allow subscriptions")
      .click()
      .should("not.be.checked");
    H.getSimpleEmbedIframeContent()
      .findByRole("heading", { name: "Email this dashboard" })
      .should("not.exist");

    cy.log("toggle subscriptions back on");
    getEmbedSidebar()
      .findByLabelText("Allow subscriptions")
      .click()
      .should("be.checked");

    cy.log("snippet should be updated");
    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,experience=dashboard,authType=sso,drills=true,withDownloads=false,withSubscriptions=true,withTitle=true,isSaveEnabled=false,theme=default",
    });

    codeBlock().should("contain", 'with-subscriptions="true"');
  });

  it("toggles dashboard title for dashboards", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    H.publishChanges("dashboard");

    cy.button("Unpublish").should("be.visible");

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
        'settings=custom,experience=dashboard,guestEmbedEnabled=true,guestEmbedType=guest-embed,authType=guest-embed,drills=false,withDownloads=false,withSubscriptions=false,withTitle=false,params={"disabled":0,"locked":0,"enabled":0},theme=default',
    });

    codeBlock().should("contain", 'with-title="false"');
  });

  it("toggles drill-through for charts for SSO auth mode", () => {
    navigateToEmbedOptionsStep({
      experience: "chart",
      resourceName: QUESTION_NAME,
      preselectSso: true,
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

    H.publishChanges("card");

    cy.button("Unpublish").should("be.visible");

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
        'settings=custom,experience=chart,guestEmbedEnabled=true,guestEmbedType=guest-embed,authType=guest-embed,drills=false,withDownloads=true,withTitle=true,isSaveEnabled=false,params={"disabled":0,"locked":0,"enabled":0},theme=default',
    });

    codeBlock().should("contain", 'with-downloads="true"');
  });

  it("toggles chart title for charts", () => {
    navigateToEmbedOptionsStep({
      experience: "chart",
      resourceName: QUESTION_NAME,
      preselectSso: true,
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
          ? {
              experience: "chart",
              resourceName: QUESTION_NAME,
              preselectSso: true,
            }
          : { experience: "exploration", preselectSso: true },
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
            ? "settings=custom,experience=chart,authType=sso,drills=true,withDownloads=false,withTitle=true,isSaveEnabled=true,theme=default"
            : "settings=custom,experience=exploration,authType=sso,isSaveEnabled=true,theme=default",
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
        "settings=custom,experience=browser,authType=sso,readOnly=false,theme=default",
    });

    codeBlock().should("contain", 'read-only="false"');
  });

  it("can change brand color and reset colors", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    H.publishChanges("dashboard");

    cy.button("Unpublish").should("be.visible");

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
        'settings=custom,experience=dashboard,guestEmbedEnabled=true,guestEmbedType=guest-embed,authType=guest-embed,drills=false,withDownloads=false,withSubscriptions=false,withTitle=true,params={"disabled":0,"locked":0,"enabled":0},theme=custom',
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
    /**
     * There's a problem on CI where the hovercard on allow subscriptions is open
     * when email is not set up and that is counted in H.popover() making H.popover().within() failed.
     *
     * Setting up the email should prevent such a hovercard from showing up.
     */
    H.setupSMTP();

    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
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
        "settings=custom,experience=dashboard,authType=sso,drills=true,withDownloads=false,withSubscriptions=false,withTitle=true,isSaveEnabled=false,theme=custom",
    });

    // derived-colors-for-embed-flow.unit.spec.ts contains the tests for other derived colors.
    cy.log("dark mode colors should be derived");
    codeBlock().should("contain", '"text-secondary": "rgb(169, 169, 169)"');
    codeBlock().should("contain", '"brand-hover": "rgba(189, 81, 253, 0.5)"');

    // Should no longer derive background-hover as it is color-mix'd
    // in the colors configuration
    codeBlock().should("not.contain", '"background-hover"');
  });

  it("can toggle the Metabot layout from auto to stacked to sidebar", () => {
    navigateToEmbedOptionsStep({ experience: "metabot" });

    getEmbedSidebar().findByLabelText("Auto").should("be.checked");
    getEmbedSidebar().findByLabelText("Stacked").click().should("be.checked");

    H.getSimpleEmbedIframeContent()
      .findByTestId("metabot-question-container")
      .should("have.attr", "data-layout", "stacked");

    getEmbedSidebar().findByText("Get code").click();
    codeBlock().should("contain", 'layout="stacked"');

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,experience=metabot,authType=sso,layout=stacked,theme=default",
    });

    getEmbedSidebar().findByText("Back").click();
    getEmbedSidebar().findByLabelText("Sidebar").click().should("be.checked");

    H.getSimpleEmbedIframeContent()
      .findByTestId("metabot-question-container")
      .should("have.attr", "data-layout", "sidebar");

    getEmbedSidebar().findByText("Get code").click();
    codeBlock().should("contain", 'layout="sidebar"');

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,experience=metabot,authType=sso,layout=sidebar,theme=default",
    });
  });
});
