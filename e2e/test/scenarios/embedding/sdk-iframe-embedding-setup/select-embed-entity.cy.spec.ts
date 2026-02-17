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
  getRecentItemCards,
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
    H.activateToken("bleeding-edge");
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
      cy.findByText("Next").click();
      cy.findByText("Select a dashboard to embed").should("be.visible");

      cy.log("first dashboard should be selected by default");
      getRecentItemCards().first().should("have.attr", "data-selected", "true");
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
      cy.findByText("Next").click();
      cy.findByText("Select a dashboard to embed").should("be.visible");

      cy.log("first dashboard should be selected by default");
      getRecentItemCards()
        .should("have.length", 2)
        .first()
        .should("have.attr", "data-selected", "true");

      cy.findByText(FIRST_DASHBOARD_NAME).should("be.visible");
      cy.findByText(SECOND_DASHBOARD_NAME).should("be.visible");

      cy.log("second dashboard can be selected");
      cy.findByText(SECOND_DASHBOARD_NAME).click();

      getRecentItemCards().eq(1).should("have.attr", "data-selected", "true");
    });

    cy.log("selected dashboard should be shown in the preview");
    cy.wait("@dashboard");
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText(SECOND_DASHBOARD_NAME).should("be.visible");
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
      cy.findByText("Next").click();

      cy.findByText("Select a chart to embed").should("be.visible");

      cy.log("first question should be selected by default");
      getRecentItemCards()
        .should("have.length", 2)
        .first()
        .should("have.attr", "data-selected", "true");

      cy.findByText(FIRST_QUESTION_NAME).should("be.visible");
      cy.findByText(SECOND_QUESTION_NAME).should("be.visible");

      cy.log("second question can be selected");
      cy.findByText(SECOND_QUESTION_NAME).click();

      getRecentItemCards().eq(1).should("have.attr", "data-selected", "true");

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
      cy.findByText("Next").click();
      cy.findByTestId("embed-browse-entity-button").click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText("Select a dashboard").should("be.visible");
      cy.findByText("Dashboards").click();
      cy.findByText(SECOND_DASHBOARD_NAME).click();
    });

    cy.log("dashboard is added to the top of recents list and selected");
    getEmbedSidebar().within(() => {
      getRecentItemCards()
        .should("have.length", 2)
        .first()
        .should("contain", SECOND_DASHBOARD_NAME)
        .should("have.attr", "data-selected", "true");
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
      cy.findByText("Next").click();
      cy.findByTestId("embed-browse-entity-button").click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText("Select a chart").should("be.visible");
      cy.findByText("Questions").click();
      cy.findByText(FIRST_QUESTION_NAME).click();
    });

    cy.log("question is added to the top of recents list and selected");
    getEmbedSidebar().within(() => {
      getRecentItemCards()
        .should("have.length", 1)
        .first()
        .should("contain", FIRST_QUESTION_NAME)
        .should("have.attr", "data-selected", "true");

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
      cy.findByText("Next").click();
      cy.findByText("Select a collection to embed").should("be.visible");
      cy.findByTestId("embed-browse-entity-button").click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText("Select a collection").should("be.visible");
      cy.findByText("First collection").click();
      cy.findByText("Select").click();
    });

    cy.log("collection is added to recents list");
    getEmbedSidebar().within(() => {
      getRecentItemCards()
        .should("contain", "First collection")
        .should("have.attr", "data-selected", "true");
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

  describe("when there is no recent activity", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/activity/recents?*", {
        recents: [],
      }).as("emptyRecentItems");

      visitNewEmbedPage();
      cy.wait("@emptyRecentItems");
    });

    it("can open a picker from the dashboard empty state", () => {
      getEmbedSidebar().within(() => {
        cy.findByText("Next").click();

        cy.log("shows the empty state for missing recent dashboards");
        cy.findByTestId("embed-recent-item-card").should("not.exist");
        cy.findByText("No recent dashboards").should("be.visible");
        cy.findByText(/You haven't visited any dashboards recently/).should(
          "be.visible",
        );

        cy.findByText(/search for dashboards/).click();
      });

      H.entityPickerModal().within(() => {
        cy.findByText("Select a dashboard").should("be.visible");
      });
    });

    it("can open a picker from the chart empty state", () => {
      getEmbedSidebar().within(() => {
        cy.findByText("Chart").click();
        cy.findByText("Next").click();

        cy.log("shows the empty state for missing recent questions");
        cy.findByTestId("embed-recent-item-card").should("not.exist");
        cy.findByText("No recent charts").should("be.visible");
        cy.findByText(/You haven't visited any charts recently/).should(
          "be.visible",
        );

        cy.findByText(/search for charts/).click();
      });

      H.entityPickerModal().within(() => {
        cy.findByText("Select a chart").should("be.visible");
      });
    });

    it("can open a collection picker from browser empty state", () => {
      getEmbedSidebar().within(() => {
        cy.findByLabelText("Metabase account (SSO)").click();
      });

      embedModalEnableEmbedding();

      getEmbedSidebar().within(() => {
        cy.findByText("Browser").click();
        cy.findByText("Next").click();

        cy.log("shows empty state for missing recent collections");
        cy.findByTestId("embed-recent-item-card").should("not.exist");
        cy.findByText("No recent collections").should("be.visible");

        cy.findByTitle("Browse collections").click();
      });

      H.entityPickerModal().within(() => {
        cy.findByText("Select a collection").should("be.visible");
      });
    });
  });
});

const logRecent = (model: "dashboard" | "card", modelId: number | string) =>
  cy.request("POST", "/api/activity/recents", {
    context: "selection",
    model: model,
    model_id: modelId,
  });
