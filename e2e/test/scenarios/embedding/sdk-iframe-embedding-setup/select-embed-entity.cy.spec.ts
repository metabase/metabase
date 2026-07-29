import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  embedModalEnableEmbedding,
  mockEmbedJsToDevServer,
} from "e2e/support/helpers";

import {
  getEmbedSidebar,
  getResourceSelectorButton,
  visitNewEmbedPage,
} from "./helpers";

const { H } = cy;

const FIRST_DASHBOARD_NAME = "Orders in a dashboard";
const SECOND_DASHBOARD_NAME = "Acme Inc";
const FIRST_QUESTION_NAME = "Orders, Count";
const SECOND_QUESTION_NAME = "Orders, Count, Grouped by Created At (year)";

const suiteTitle =
  "scenarios > embedding > sdk iframe embed setup > select embed entity";

describe(suiteTitle, () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.enableTracking();
    H.updateSetting("enable-embedding-simple", true);

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");

    mockEmbedJsToDevServer();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("tracks event details with `isDefaultResource=true` when keeping the default dashboard selection", () => {
    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      cy.findByText("Select a dashboard to embed").should("be.visible");

      cy.log("a default dashboard is preselected");
      getResourceSelectorButton().should("contain", FIRST_DASHBOARD_NAME);

      cy.findByText("Next").click();
    });

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_resource_selection_completed",
      event_detail: "isDefaultResource=true,experience=dashboard",
    });
  });

  it("tracks event details with `isDefaultResource=false` when selecting a different dashboard", () => {
    cy.intercept("GET", "api/preview_embed/dashboard/*").as("previewEmbed");
    cy.log("add two dashboards to activity log");

    H.createDashboard({ name: SECOND_DASHBOARD_NAME }).then(
      ({ body: { id: secondDashboardId } }) => {
        logRecent("dashboard", secondDashboardId);
        logRecent("dashboard", ORDERS_DASHBOARD_ID);
        cy.wrap(secondDashboardId).as("secondDashboardId");
      },
    );

    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      cy.findByText("Select a dashboard to embed").should("be.visible");

      // see the "shows recently created dashboard at the top of the list (EMB-1179)"
      // test below for why we prioritize new dashboards
      cy.log(
        "recently created dashboard should be selected by default (EMB-1179)",
      );
      getResourceSelectorButton().should("contain", SECOND_DASHBOARD_NAME);

      cy.log("a different dashboard can be selected via the picker");
      getResourceSelectorButton().click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText(FIRST_DASHBOARD_NAME).click();
    });

    getEmbedSidebar().within(() => {
      getResourceSelectorButton().should("contain", FIRST_DASHBOARD_NAME);
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Guest").click();
    });

    cy.log("selected dashboard should be shown in the preview");
    cy.wait("@dashboard");
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText(FIRST_DASHBOARD_NAME).should("be.visible");
    });

    cy.log(
      'Embed preview requests should not have "X-Metabase-Client" header (EMB-945)',
    );
    cy.wait("@previewEmbed").then(({ request }) => {
      expect(request?.headers?.["x-metabase-embedded-preview"]).to.equal(
        "true",
      );
    });

    getEmbedSidebar().findByText("Next").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_resource_selection_completed",
      event_detail: "isDefaultResource=false,experience=dashboard",
    });
  });

  it("can select a recent question to embed", () => {
    cy.log("add two questions to activity log");
    logRecent("card", ORDERS_BY_YEAR_QUESTION_ID);
    logRecent("card", ORDERS_COUNT_QUESTION_ID);

    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      cy.findByText("Chart").click();

      cy.findByText("Select a chart to embed").should("be.visible");

      cy.log("first question should be selected by default");
      getResourceSelectorButton().should("contain", FIRST_QUESTION_NAME);

      cy.log("a different question can be selected via the picker");
      getResourceSelectorButton().click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText(SECOND_QUESTION_NAME).click();
    });

    getEmbedSidebar().within(() => {
      getResourceSelectorButton().should("contain", SECOND_QUESTION_NAME);

      cy.findByText("Next").click();

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_resource_selection_completed",
        event_detail: "isDefaultResource=false,experience=chart",
      });
    });

    cy.log("selected question should be shown in the preview");
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText(SECOND_QUESTION_NAME).should("be.visible");
    });
  });

  it("can search and select a dashboard", () => {
    H.createDashboard({ name: SECOND_DASHBOARD_NAME }).then(
      ({ body: { id: dashboardId } }) => {
        cy.wrap(dashboardId).as("secondDashboardId");
      },
    );
    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      getResourceSelectorButton().click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText("Select a dashboard").should("be.visible");

      // The picker opens on "Recent items" by default. Navigate via the
      // root sidebar to disambiguate from any matching recent entries.
      cy.findByTestId("item-picker-level-0")
        .findByText("Our analytics")
        .click();
      cy.findByTestId("item-picker-level-1")
        .findByText(SECOND_DASHBOARD_NAME)
        .click();
    });

    cy.log("button reflects the newly selected dashboard");
    getEmbedSidebar().within(() => {
      getResourceSelectorButton().should("contain", SECOND_DASHBOARD_NAME);
    });

    cy.wait("@dashboard");
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText(SECOND_DASHBOARD_NAME).should("be.visible");
    });
  });

  it("can search and select a question", () => {
    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      cy.findByText("Chart").click();
      getResourceSelectorButton().click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText("Select a chart").should("be.visible");
      cy.findByText("Our analytics").click();
      cy.findByText(FIRST_QUESTION_NAME).click();
    });

    cy.log("button reflects the newly selected question");
    getEmbedSidebar().within(() => {
      getResourceSelectorButton().should("contain", FIRST_QUESTION_NAME);

      cy.findByText("Next").click();
    });

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_resource_selection_completed",
      event_detail: "isDefaultResource=false,experience=chart",
    });

    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText(FIRST_QUESTION_NAME).should("be.visible");
    });
  });

  it("can search and select a collection for browser", () => {
    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Metabase account (SSO)").click();
    });

    embedModalEnableEmbedding();

    getEmbedSidebar().within(() => {
      cy.findByText("Browser").click();
      cy.findByText("Select initial collection").should("be.visible");
      getResourceSelectorButton().click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText("Select initial collection").should("be.visible");

      // The picker opens on "Recent items" by default. Navigate via the
      // root sidebar to disambiguate from any matching recent entries.
      cy.findByTestId("item-picker-level-0")
        .findByText("Our analytics")
        .click();
      cy.findByTestId("item-picker-level-1")
        .findByText("First collection")
        .click();
      cy.findByText("Select").click();
    });

    cy.log("button reflects the newly selected collection");
    getEmbedSidebar().within(() => {
      getResourceSelectorButton().should("contain", "First collection");
    });

    cy.log("collection is shown in the breadcrumbs and preview");
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByTestId("sdk-breadcrumbs")
        .findAllByText("First collection")
        .first()
        .should("be.visible");

      cy.findByText("Second collection").should("be.visible");
    });
  });
});

const logRecent = (model: "dashboard" | "card", modelId: number | string) =>
  cy.request("POST", "/api/activity/recents", {
    context: "selection",
    model: model,
    model_id: modelId,
  });

describe("recently created dashboards", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("enable-embedding-simple", true);

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");
    cy.intercept("GET", "/api/search?*").as("searchQuery");

    mockEmbedJsToDevServer();
  });

  // When using x-rays to create your first dashboard in the onboarding
  // flow, user expects that to be the default for the wizard,
  // even if they have never visited that dashboard before.
  it("shows recently created dashboard at the top of the list (EMB-1179)", () => {
    const { ORDERS_ID } = SAMPLE_DATABASE;

    cy.log("simulate existing recent activity");
    logRecent("dashboard", ORDERS_DASHBOARD_ID);

    cy.log("create a dashboard via x-ray");
    cy.visit(`/auto/dashboard/table/${ORDERS_ID}`);
    H.main()
      .findByText("Total transactions", { timeout: 10_000 })
      .should("be.visible");

    cy.button("Save this").click();
    H.undoToast().should("contain", "Your dashboard was saved");

    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      cy.findByText("Select a dashboard to embed").should("be.visible");

      cy.log(
        "the recently created x-ray dashboard should be the default selection",
      );
      const XRAY_DASHBOARD_NAME = "A look at Orders";
      getResourceSelectorButton({ timeout: 10_000 }).should(
        "contain",
        XRAY_DASHBOARD_NAME,
      );
    });
  });
});
