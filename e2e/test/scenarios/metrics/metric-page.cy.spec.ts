const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  TRUSTED_ORDERS_METRIC,
  createLibraryWithItems,
} from "e2e/support/test-library-data";
import type { Card } from "metabase-types/api";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Orders count",
  description: "Total number of orders",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar" as const,
};

const ORDERS_TIMESERIES_METRIC = {
  name: "Orders over time",
  description: "Count of orders broken down by month",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
  display: "line" as const,
};

describe("scenarios > metrics > metric page", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.resetSnowplow();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should display scalar metric, edit name and description, explore link, and more menu actions", () => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/card").as("createCard");

    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
      H.visitMetric(metric.id);
    });

    cy.log("about page with description sidebar");
    H.MetricPage.aboutPage().should("be.visible");
    H.MetricPage.aboutPageDescriptionSidebar().within(() => {
      cy.findByText("Total number of orders").should("be.visible");
      cy.findByText("Sample Database").should("be.visible");
      cy.findByText("Source table").should("be.visible");
      cy.findByText("Orders").should("be.visible");
    });

    cy.log("explore link");
    H.MetricPage.header()
      .findByText("Explore")
      .closest("a")
      .should("have.attr", "href")
      .and("include", "/explore");

    cy.log("edit description");
    H.MetricPage.aboutPageDescriptionSidebar().within(() => {
      cy.findByText("Total number of orders").click();
    });
    cy.focused().clear().type("Updated description").blur();
    cy.wait("@updateCard");
    H.MetricPage.aboutPageDescriptionSidebar()
      .findByText("Updated description")
      .should("be.visible");

    cy.log("edit name inline");
    H.MetricPage.aboutPage()
      .findByDisplayValue("Orders count")
      .clear()
      .type("Renamed metric{enter}");
    cy.wait("@updateCard");
    H.MetricPage.aboutPage()
      .findByDisplayValue("Renamed metric")
      .should("be.visible");

    cy.log("duplicate via more menu");
    H.MetricPage.moreMenu().click();
    H.popover().findByText("Duplicate").click();
    H.modal().within(() => {
      cy.findByLabelText("Name")
        .should("have.value", "Renamed metric - Duplicate")
        .clear()
        .type("Renamed metric copy");
      cy.button("Duplicate").click();
    });
    cy.wait("@createCard");
    H.MetricPage.aboutPage().should("be.visible");
  });

  it("should open alert channel setup modal from more menu when no channels configured", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
      H.visitMetric(metric.id);
    });

    H.MetricPage.moreMenu().click();
    H.popover().findByText("Create an alert").click();

    H.modal().within(() => {
      cy.findByText(
        "To get notified when something happens, or to send this chart on a schedule, first set up email, Slack, or a webhook.",
      ).should("be.visible");

      cy.findByText("Set up email")
        .should("be.visible")
        .closest("a")
        .should("have.attr", "href", "/admin/settings/email");
      cy.findByText("Set up Slack")
        .should("be.visible")
        .closest("a")
        .should("have.attr", "href", "/admin/settings/slack");
      cy.findByText("Add a webhook")
        .should("be.visible")
        .closest("a")
        .should("have.attr", "href", "/admin/settings/webhooks");
    });
  });

  it(
    "should create an alert with webhook and show Edit alerts after",
    { tags: ["@external"] },
    () => {
      H.setupNotificationChannel({
        name: "Foo Hook",
        description: "This is a hook",
      });
      H.setupNotificationChannel({
        name: "Bar Hook",
        description: "This is another hook",
      });
      cy.setCookie("metabase.SEEN_ALERT_SPLASH", "true");

      cy.intercept("POST", "/api/notification").as("createAlert");

      H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
        H.visitMetric(metric.id);
      });

      H.MetricPage.moreMenu().click();
      H.popover().findByText("Create an alert").click();

      H.addNotificationHandlerChannel("Bar Hook");

      cy.findByRole("button", { name: "Done" }).click();

      cy.wait("@createAlert").then(({ response }) => {
        expect(response?.body?.payload?.send_condition).to.equal("has_result");
      });

      H.notificationList().findByText("Your alert is all set up.");

      H.MetricPage.moreMenu().click();
      H.popover().findByText("Edit alerts").should("be.visible");
    },
  );

  it("should display timeseries metric and navigate between tabs", () => {
    H.createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: metric }) => {
      H.visitMetric(metric.id);
    });

    H.MetricPage.aboutPage().should("be.visible");
    H.echartsContainer().should("be.visible");

    H.MetricPage.aboutTab().should("be.visible");
    H.MetricPage.overviewTab().should("be.visible");
    H.MetricPage.definitionTab().should("be.visible");
    H.MetricPage.historyTab().should("be.visible");

    H.MetricPage.definitionTab().click();
    H.MetricPage.queryEditor().should("be.visible");
    H.getNotebookStep("data").findByText("Orders").should("be.visible");

    H.MetricPage.historyTab().click();
    cy.findAllByTestId("revision-history-event").should("have.length.gte", 1);

    H.MetricPage.aboutTab().click();
    H.MetricPage.aboutPage().should("be.visible");
  });

  it("should render dimension charts on the overview tab and show more", () => {
    H.createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: metric }) => {
      H.visitMetric(metric.id);
    });

    H.MetricPage.overviewTab().click();
    H.MetricPage.overviewPage().should("be.visible");

    H.MetricPage.overviewPage().within(() => {
      cy.findByText("By Created At").should("exist");
      cy.findByText("By State").should("exist");
      cy.findByText("By Category").should("exist");
      cy.findByText("By City").should("exist");
      cy.findAllByText(/^By /).should("have.length", 4);

      cy.findByText("Show more").scrollIntoView().click();
    });

    H.expectUnstructuredSnowplowEvent({
      event: "metric_page_show_more_clicked",
    });

    H.MetricPage.overviewPage().within(() => {
      cy.findByText("By Name").should("exist");
      cy.findByText("By Source").should("exist");
      cy.findByText("By Title").should("exist");
      cy.findByText("By Vendor").should("exist");
      cy.findAllByText(/^By /).should("have.length", 8);
    });
  });

  it("should edit, save, and cancel metric definition changes", () => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");

    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
      cy.visit(`/metric/${metric.id}/query`);
    });

    H.MetricPage.queryEditor().should("be.visible");

    cy.log("cancel reverts changes");
    H.getNotebookStep("summarize").button("Count").click();
    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });
    H.MetricPage.saveButton().should("be.visible");
    H.MetricPage.cancelButton().click();
    H.getNotebookStep("summarize").findByText("Count").should("be.visible");

    cy.log("save persists changes");
    H.getNotebookStep("summarize").button("Count").click();
    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });
    H.MetricPage.saveButton().click();
    cy.wait("@updateCard");
    H.getNotebookStep("summarize")
      .findByText("Sum of Total")
      .should("be.visible");
  });

  it("should add metric to dashboard and move to trash via more menu", () => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");

    H.createQuestion(ORDERS_SCALAR_METRIC, {
      wrapId: true,
      idAlias: "metricId",
    });

    cy.get<number>("@metricId").then((metricId) => {
      H.visitMetric(metricId);
    });

    cy.log("add to dashboard");
    H.MetricPage.moreMenu().click();
    H.popover().findByText("Add to a dashboard").click();
    H.modal().within(() => {
      cy.findByRole("heading", {
        name: "Add this metric to a dashboard",
      }).should("be.visible");
      cy.findByText("Orders in a dashboard").click();
      cy.button("Select").click();
    });
    cy.location("pathname").should(
      "eq",
      `/dashboard/${ORDERS_DASHBOARD_ID}-orders-in-a-dashboard`,
    );

    cy.log("move to trash");
    cy.get<number>("@metricId").then((metricId) => {
      H.visitMetric(metricId);
    });
    H.MetricPage.moreMenu().click();
    H.popover().findByText("Move to trash").click();
    H.modal().button("Move to trash").click();
    cy.wait("@updateCard");
    H.main().findByText("This metric is in the trash.");
  });

  it("should restrict editing controls and definition tab for read-only users", () => {
    cy.signInAsAdmin();
    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
      cy.signIn("readonly");
      H.visitMetric(metric.id);

      cy.log("about page hides editing controls");
      H.MetricPage.aboutPage().should("be.visible");
      cy.findByDisplayValue("Orders count").should("not.exist");
      H.MetricPage.moreMenu().click();
      H.popover().within(() => {
        cy.findByText("Bookmark").should("be.visible");
        cy.findByText("Add to a dashboard").should("be.visible");
        cy.findByText("Move").should("not.exist");
        cy.findByText("Duplicate").should("not.exist");
        cy.findByText("Move to trash").should("not.exist");
      });

      cy.log("overview and definition tabs are hidden for read-only users");
      cy.realPress("Escape");
      H.MetricPage.overviewTab().should("not.exist");
      H.MetricPage.definitionTab().should("not.exist");
    });
  });

  describe("ee features", () => {
    beforeEach(() => {
      H.activateToken("pro-self-hosted");
    });

    it("should show and hide 'Open in Data Studio' based on context", () => {
      createLibraryWithItems();

      cy.request("GET", "/api/card").then(({ body: cards }) => {
        const metric = cards.find(
          (card: Card) =>
            card.type === "metric" && card.name === TRUSTED_ORDERS_METRIC.name,
        );

        cy.log("metric page shows 'Open in Data Studio'");
        H.visitMetric(metric.id);
        H.MetricPage.moreMenu().click();
        H.popover().findByText("Open in Data Studio").should("be.visible");
        cy.realPress("Escape");

        cy.log("Data Studio route hides 'Open in Data Studio'");
        cy.visit(`/data-studio/library/metrics/${metric.id}`);
        H.MetricPage.aboutPage().should("be.visible");
        H.MetricPage.moreMenu().click();
        H.popover().findByText("Open in Data Studio").should("not.exist");
      });
    });

    it("should navigate to usage analytics dashboard from more menu", () => {
      H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
        H.visitMetric(metric.id);

        H.MetricPage.moreMenu().click();
        H.popover()
          .findByText("Metric usage analytics")
          .closest("a")
          .should("have.attr", "href")
          .and("include", `question_id=${metric.id}`);

        H.popover()
          .findByText("Metric usage analytics")
          .closest("a")
          .invoke("removeAttr", "target")
          .click();

        cy.location("search").should("include", `question_id=${metric.id}`);
        H.main().findByText("Question overview").should("be.visible");
      });
    });

    it("should show the Dependencies tab with dependency graph in EE", () => {
      H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
        H.waitForBackfillComplete();
        H.visitMetric(metric.id);
      });

      H.MetricPage.aboutPageDescriptionSidebar().within(() => {
        cy.findByText("Dependencies").should("be.visible");
        cy.findByText("Dependents").should("be.visible");
      });

      H.MetricPage.dependenciesTab().click();
      H.DependencyGraph.graph().within(() => {
        cy.findByText("Table");
        cy.findByText("Orders").should("be.visible");
        cy.findByText("Orders count").should("be.visible");
      });
    });
  });
});
