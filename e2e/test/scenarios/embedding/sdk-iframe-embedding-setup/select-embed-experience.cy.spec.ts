import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { embedModalEnableEmbedding } from "e2e/support/helpers";

import {
  assertDashboard,
  assertRecentItemName,
  getEmbedSidebar,
  visitNewEmbedPage,
} from "./helpers";

const { H } = cy;

const suiteTitle =
  "scenarios > embedding > sdk iframe embed setup > select embed experience";

describe(suiteTitle, () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();

    H.updateSetting("enable-embedding-simple", true);
    H.updateSetting("enable-embedding-static", true);

    cy.intercept("GET", "/api/dashboard/*").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?context=selections*").as(
      "recentActivity",
    );
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("select embed experiences with a non-empty activity log", () => {
    it("shows the most recent dashboard from the activity log by default", () => {
      const dashboardName = "Orders in a dashboard";

      visitNewEmbedPage();
      assertRecentItemName("dashboard", dashboardName);

      H.expectUnstructuredSnowplowEvent({ event: "embed_wizard_opened" });
      H.waitForSimpleEmbedIframesToLoad();

      getEmbedSidebar().within(() => {
        cy.findByText("Next").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_experience_completed",
        event_detail:
          "authType=guest-embed,experience=dashboard,isDefaultExperience=true",
      });

      H.getSimpleEmbedIframeContent().within(() => {
        cy.log("dashboard title is visible");
        cy.findByText(dashboardName).should("be.visible");

        cy.log("dashboard card is visible");
        cy.findByText("Orders").should("be.visible");
      });
    });

    it("shows the most recent question from the activity log when selected", () => {
      const questionName = "Orders, Count";

      cy.log("go to a question to add to the activity log");
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      cy.wait("@cardQuery");

      visitNewEmbedPage();
      assertRecentItemName("card", questionName);
      H.expectUnstructuredSnowplowEvent({ event: "embed_wizard_opened" });

      getEmbedSidebar().within(() => {
        cy.findByText("Chart").click();
        cy.findByText("Next").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_experience_completed",
        event_detail:
          "authType=guest-embed,experience=chart,isDefaultExperience=false",
      });

      H.getSimpleEmbedIframeContent().within(() => {
        cy.log("question title is visible");
        cy.findByText(questionName).should("be.visible");
      });
    });

    it("shows exploration template when selected", { tags: "@skip" }, () => {
      visitNewEmbedPage();

      getEmbedSidebar().within(() => {
        cy.findByLabelText("Metabase account (SSO)").click();

        cy.findByText("Exploration").click();
        cy.findByText("Next").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_experience_completed",
        event_detail:
          "authType=sso,experience=exploration,isDefaultExperience=false",
      });

      H.waitForSimpleEmbedIframesToLoad();

      H.getSimpleEmbedIframeContent().within(() => {
        cy.log("data picker is visible");
        cy.findByText("Pick your starting data").should("be.visible");
      });
    });

    it("shows browser template when selected", () => {
      visitNewEmbedPage();

      getEmbedSidebar().within(() => {
        cy.findByLabelText("Metabase account (SSO)").click();
      });

      embedModalEnableEmbedding();

      getEmbedSidebar().within(() => {
        cy.findByText("Browser").click();
        cy.findByText("Next").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_experience_completed",
        event_detail:
          "authType=sso,experience=browser,isDefaultExperience=false",
      });

      H.getSimpleEmbedIframeContent().within(() => {
        cy.log("collection is visible in breadcrumbs");
        cy.findByTestId("sdk-breadcrumbs")
          .findAllByText("Our analytics")
          .first()
          .should("be.visible");

        cy.log("collection is visible in browser");
        cy.findAllByText("Orders in a dashboard").should("be.visible");
      });
    });
  });

  describe("select embed experiences with an empty activity log", () => {
    beforeEach(() => {
      cy.log("simulate an empty activity log");
      cy.intercept("GET", "/api/activity/recents?*", { recents: [] }).as(
        "emptyRecentItems",
      );
    });

    it("shows dashboard of id=1 when activity log is empty", () => {
      visitNewEmbedPage();
      assertDashboard({ id: 1, name: "Person overview" });
      cy.wait("@emptyRecentItems");

      cy.log("dashboard title and card of id=1 should be visible");

      H.waitForSimpleEmbedIframesToLoad();

      H.getSimpleEmbedIframeContent().within(() => {
        cy.findByText("Person overview").should("be.visible");
        cy.findByText("Person detail").should("be.visible");
      });
    });

    it(
      "shows question of id=1 when activity log is empty and chart is selected",
      { tags: "@skip" },
      () => {
        visitNewEmbedPage();
        cy.wait("@emptyRecentItems");

        getEmbedSidebar().within(() => {
          cy.findByText("Chart").click();
          cy.findByText("Next").click();
        });

        H.expectUnstructuredSnowplowEvent({
          event: "embed_wizard_experience_completed",
          event_detail:
            "authType=guest-embed,experience=chart,isDefaultExperience=false",
        });

        H.waitForSimpleEmbedIframesToLoad();

        H.getSimpleEmbedIframeContent().within(() => {
          cy.log("question title of id=1 is visible");
          cy.findByText("Query log").should("be.visible");
        });
      },
    );
  });

  it("should show a fake loading indicator in embed preview", () => {
    cy.visit(`/question/${ORDERS_QUESTION_ID}`);

    H.openEmbedJsModal();
    H.embedModalEnableEmbedding();

    cy.get("#iframe-embed-container")
      .findByTestId("preview-loading-indicator", { timeout: 20_000 })
      .should("be.visible");

    cy.get("[data-iframe-loaded]", { timeout: 20_000 }).should(
      "have.length",
      1,
    );

    cy.findByTestId("preview-loading-indicator").should("not.exist");
  });

  it("should respect slow loading of recent dashboars and wait till loading complete", () => {
    cy.intercept("GET", "/api/activity/recents*", (req) => {
      req.on("response", (res) => {
        res.setThrottle(0.3); // Slow down the response
      });
    }).as("getRecents");

    visitNewEmbedPage();

    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("Person overview").should("not.exist");
      cy.findByText("Orders in a dashboard").should("be.visible");
    });
  });

  it("shows no-data block when example-dashboard-id points to an archived dashboard", () => {
    H.createDashboard({
      name: "Archived Dashboard",
    }).then(({ body: { id: dashboardId } }) => {
      H.archiveDashboard(dashboardId);

      cy.intercept("GET", "/api/session/properties", (req) => {
        req.continue((res) => {
          res.body["example-dashboard-id"] = dashboardId;
          res.send();
        });
      });
    });

    cy.intercept("GET", "/api/activity/recents*", {
      body: [],
    }).as("emptyRecentItems");

    visitNewEmbedPage({ waitForResource: false });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Metabase account (SSO)").click();
    });

    cy.wait("@emptyRecentItems");

    cy.findByAltText("No results").should("be.visible");
  });

  it("shows Metabot experience when selected", () => {
    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Metabase account (SSO)").click();
    });

    embedModalEnableEmbedding();

    getEmbedSidebar().within(() => {
      cy.findByText("Metabot").click();
      cy.findByText("Next").click();
    });

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_experience_completed",
      event_detail: "authType=sso,experience=metabot,isDefaultExperience=false",
    });

    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("Ask questions to AI.").should("be.visible");
    });
  });
});
