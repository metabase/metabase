const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  TRUSTED_ORDERS_METRIC,
  createLibraryWithItems,
} from "e2e/support/test-library-data";
import type { Card, ListMetricDimensionsResponse } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

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

// Renders as a time series through its curated default dimension, which
// H.setMetricDefaultDimension sets to Created At; metric queries carry no breakout.
const ORDERS_TIMESERIES_METRIC = {
  name: "Orders over time",
  description: "Count of orders over time",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "line" as const,
};

const OVERVIEW_DIMENSIONS_TO_ADD = [
  ["Product", "Category"],
  ["Product", "Price"],
  ["Product", "Rating"],
  ["Product", "Title"],
  ["Product", "Vendor"],
  ["User", "City"],
  ["User", "Source"],
  ["User", "State"],
] as const;

function addOverviewDimensions(metricId: number) {
  return cy
    .request("GET", `/api/metric/${metricId}`)
    .then(() =>
      cy.request<ListMetricDimensionsResponse>(
        "GET",
        `/api/metric/${metricId}/dimension?with-addable=true`,
      ),
    )
    .then(({ body }) => {
      const dimensions = OVERVIEW_DIMENSIONS_TO_ADD.flatMap(
        ([groupName, dimensionName]) => {
          const group = body.addable.find(
            (candidate) => candidate.group.display_name === groupName,
          );
          const dimension = group?.dimensions.find(
            (candidate) => candidate.display_name === dimensionName,
          );

          expect(dimension, `${groupName} - ${dimensionName}`).to.exist;
          return dimension ? [dimension] : [];
        },
      );

      expect(dimensions).to.have.length(OVERVIEW_DIMENSIONS_TO_ADD.length);
      cy.request("POST", `/api/metric/${metricId}/dimension/add`, {
        dimensions,
      });
    });
}

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

  it("should display a scalar metric, edit its name and description, link to explore, navigate tabs, bookmark, and duplicate it", () => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/card").as("createCard");

    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
      H.visitMetric(metric.id);
    });

    cy.log("about page with description sidebar");
    H.MetricPage.aboutPage().should("be.visible");

    cy.log("a metric without a default dimension previews a scalar");
    H.MetricPage.aboutPage().within(() => {
      cy.findByTestId("visualization-root")
        .should("be.visible")
        .and("have.attr", "data-viz-ui-name", "Number");
      cy.findByTestId("scalar-value").should("have.text", "18,760");
      cy.findByRole("button", { name: /^Select dimension/ }).should(
        "not.exist",
      );
    });

    H.MetricPage.aboutPageDescriptionSidebar().within(() => {
      cy.findByText("Total number of orders").should("be.visible");
      cy.findByText("Source").should("be.visible");
      cy.findByText("Sample Database").should("be.visible");
      cy.findByText("Orders").should("be.visible");
    });

    cy.log("explore link");
    H.MetricPage.exploreLink()
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

    cy.log("navigate between tabs");
    H.MetricPage.aboutTab().should("be.visible");
    H.MetricPage.overviewTab().should("be.visible");
    H.MetricPage.definitionTab().should("be.visible");
    H.MetricPage.historyTab().should("be.visible");

    H.MetricPage.definitionTab().click();
    H.MetricPage.queryEditor().should("be.visible");
    H.getNotebookStep("data").findByText("Orders").should("be.visible");

    H.MetricPage.historyTab().click();
    cy.findAllByTestId("revision-history-event").should("have.length.gte", 3);

    H.MetricPage.aboutTab().click();
    H.MetricPage.aboutPage().should("be.visible");

    cy.log("bookmark via more menu");
    H.MetricPage.moreMenu().click();
    H.popover().findByTextEnsureVisible("Bookmark").click();
    H.navigationSidebar().findByText("Renamed metric").should("be.visible");

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
    cy.wait("@createCard").then(({ response }) => {
      cy.location("pathname").should("eq", `/metric/${response?.body.id}`);
    });
    H.MetricPage.aboutPage()
      .findByDisplayValue("Renamed metric copy")
      .should("be.visible");
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

      H.selectScheduleTime();
      cy.findByRole("button", { name: "Done" }).click();

      cy.wait("@createAlert").then(({ response }) => {
        expect(response?.body?.payload?.send_condition).to.equal("has_result");
      });

      H.notificationList().findByText("Your alert is all set up.");

      H.MetricPage.moreMenu().click();
      H.popover().findByText("Edit alerts").should("be.visible");
    },
  );

  it("should render curated dimension charts in order and load more", () => {
    H.createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: metric }) => {
      addOverviewDimensions(metric.id);
      H.visitMetric(metric.id);
    });

    H.MetricPage.overviewTab().click();
    H.MetricPage.overviewPage().should("be.visible");

    H.MetricPage.overviewPage().within(() => {
      cy.findAllByText(/^By /).should("have.length", 4);
      cy.findAllByText(/^By /).then(($cards) => {
        expect($cards.map((_, card) => card.textContent).get()).to.deep.equal([
          "By Subtotal",
          "By Tax",
          "By Total",
          "By Discount",
        ]);
      });
    });

    H.MetricPage.overviewPage().realMouseWheel({ deltaY: 100 });

    H.MetricPage.overviewPage().within(() => {
      cy.findAllByText(/^By /).should("have.length", 10);

      cy.findAllByText(/^By /).then(($cards) => {
        expect($cards.map((_, card) => card.textContent).get()).to.deep.equal([
          "By Subtotal",
          "By Tax",
          "By Total",
          "By Discount",
          "By Created At",
          "By Quantity",
          "By Category",
          "By Price",
          "By Rating",
          "By Title",
        ]);
      });

      cy.findByText("Show more").scrollIntoView().click();
      cy.findAllByText(/^By /).should("have.length", 14);
    });

    H.expectUnstructuredSnowplowEvent({
      event: "metric_page_show_more_clicked",
    });
  });

  it("should discard unsaved changes on leaving (metabase#32037), cancel and save metric definition changes, surface a failed revert (UXW-310), offer alert channel setup when no channels are configured, and move the metric to trash", () => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");

    H.createQuestion(ORDERS_SCALAR_METRIC, {
      wrapId: true,
      idAlias: "metricId",
    });
    cy.get<number>("@metricId").then((metricId) => {
      cy.visit(`/metric/${metricId}/query`);
    });

    H.MetricPage.queryEditor().should("be.visible");
    H.MetricPage.saveButton().should("not.exist");

    cy.log("leaving with unsaved changes asks to discard them");
    H.getNotebookStep("summarize").button("Count").click();
    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });
    H.MetricPage.saveButton().should("be.visible");

    H.MetricPage.aboutTab().click();
    H.modal().within(() => {
      cy.findByText("Discard your changes?").should("be.visible");
      cy.findByText("Discard changes").click();
    });

    H.MetricPage.aboutPage().should("be.visible");
    cy.get<number>("@metricId").then((metricId) => {
      cy.location("pathname").should("eq", `/metric/${metricId}`);
    });

    H.MetricPage.definitionTab().click();
    H.MetricPage.queryEditor().should("be.visible");
    H.getNotebookStep("summarize").findByText("Count").should("be.visible");

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
    H.undoToast().should("contain.text", "Metric query updated");
    H.undoToast().findByRole("img", { name: /close/ }).click();

    cy.log("surface backend error when a revert fails (UXW-310)");
    cy.intercept("POST", "/api/revision/revert", {
      statusCode: 500,
      body: { message: "Cannot revert: missing metric" },
    }).as("failedRevert");

    H.MetricPage.historyTab().click();
    cy.findByTestId("saved-question-history-list")
      .findAllByTestId("question-revert-button")
      .first()
      .click();
    cy.wait("@failedRevert");

    H.undoToast().should("contain.text", "Cannot revert: missing metric");

    cy.log("create an alert without channels offers channel setup");
    H.MetricPage.aboutTab().click();
    H.MetricPage.aboutPage().should("be.visible");
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
    cy.realPress("Escape");
    H.modal().should("not.exist");

    cy.log("move to trash via more menu");
    H.MetricPage.moreMenu().click();
    H.popover().findByText("Move to trash").click();
    H.modal().button("Move to trash").click();
    cy.wait("@updateCard");
    H.main().findByText("This metric is in the trash.");
  });

  it("should hide editing controls and the overview and definition tabs from read-only users", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
      cy.signIn("readonly");
      H.visitMetric(metric.id);

      cy.log("about page hides editing controls");
      H.MetricPage.aboutPage().should("be.visible");
      H.MetricPage.header().findByText("Orders count").should("be.visible");
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
      H.MetricPage.historyTab().should("be.visible");
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
        H.popover().findByText("Bookmark").should("be.visible");
        H.popover().findByText("Open in Data Studio").should("not.exist");
      });
    });

    it("should show the Dependencies tab with dependency graph and navigate to usage analytics from more menu", () => {
      H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
        H.waitForBackfillComplete();
        H.visitMetric(metric.id);

        H.MetricPage.aboutPageDescriptionSidebar().within(() => {
          cy.findByText("Relationships").should("be.visible");
          cy.findByText("No dependencies").should("be.visible");
          cy.findByText("No charts use this metric").should("be.visible");
        });

        H.MetricPage.dependenciesTab().click();
        H.DependencyGraph.graph().within(() => {
          cy.findByText("Table");
          cy.findByText("Orders").should("be.visible");
          cy.findByText("Orders count").should("be.visible");
        });

        cy.log("usage analytics from more menu");
        H.MetricPage.aboutTab().click();
        H.MetricPage.aboutPage().should("be.visible");
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
  });
});
