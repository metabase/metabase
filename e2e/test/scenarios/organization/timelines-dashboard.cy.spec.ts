const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  DashboardCard,
  StructuredQuestionDetails,
  TimelineEventData,
  TimelineId,
} from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const RC1 = { name: "RC1", timestamp: "2026-06-01T00:00:00Z" };
const RC2 = { name: "RC2", timestamp: "2029-01-01T00:00:00Z" };
const ALPHA = { name: "Alpha", timestamp: "2027-10-03T00:00:00Z" };
const BETA = { name: "Beta", timestamp: "2027-10-10T00:00:00Z" };

const WIDE_CARD = { col: 0, row: 0, size_x: 12, size_y: 8 };
const NEXT_WIDE_CARD = { col: 12, row: 0, size_x: 12, size_y: 8 };
const TINY_CARD = { col: 0, row: 0, size_x: 3, size_y: 2 };

const ordersOverTime = (
  name: string,
  timelineId?: TimelineId,
  unit: "year" | "month" = "year",
): StructuredQuestionDetails => ({
  name,
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": unit }]],
  },
  visualization_settings:
    timelineId == null
      ? {}
      : {
          "timeline.selected_timeline_ids": [timelineId],
          "timeline.excluded_timeline_event_ids": [],
        },
});

const ordersTable = (name: string): StructuredQuestionDetails => ({
  name,
  display: "table",
  query: { "source-table": ORDERS_ID, limit: 5 },
});

const eventsSidebar = () => cy.findByTestId("dashboard-events-sidebar");

const cardEvent = (index: number, label: string) =>
  H.getDashboardCard(index).findByLabelText(label);

const timelineCheckbox = (name: string) =>
  eventsSidebar()
    .findByText(name)
    .closest("[aria-label='Timeline card header']")
    .findByRole("checkbox");

const eventCard = (name: string) =>
  eventsSidebar()
    .findByText(name)
    .closest("[aria-label='Timeline event card']");

const openCardEvents = (index: number) => {
  H.getDashboardCardMenu(index).click();
  H.popover().findByText("Events").click();
};

const openEventMenu = (name: string, option: string) => {
  eventCard(name).icon("ellipsis").click();
  H.popover().findByText(option).click();
};

/**
 * Creates a "Releases" timeline plus a dashboard whose questions are built from
 * its id, so a question can be saved with the timeline already turned on.
 */
const setupDashboard = ({
  questions,
  cards,
  events = [RC1, RC2],
  visit = true,
}: {
  questions: (timelineId: TimelineId) => StructuredQuestionDetails[];
  cards?: Partial<DashboardCard>[];
  events?: Omit<TimelineEventData, "timeline_id">[];
  visit?: boolean;
}) =>
  H.createTimelineWithEvents({
    timeline: { name: "Releases" },
    events,
  }).then(({ timeline }) =>
    H.createDashboardWithQuestions({
      dashboardName: "Events dashboard",
      questions: questions(timeline.id),
      cards,
    }).then(({ dashboard }) => {
      if (visit) {
        H.visitDashboard(dashboard.id);
        H.waitForDashcardsToLoad();
      }
      return cy.wrap(dashboard);
    }),
  );

const setupTwoCharts = ({ visit = true } = {}) =>
  setupDashboard({
    questions: (timelineId) => [
      ordersOverTime("With events", timelineId),
      ordersOverTime("Without events"),
    ],
    cards: [WIDE_CARD, NEXT_WIDE_CARD],
    visit,
  });

describe("scenarios > organization > timelines > dashboard", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shows the events each question was saved with, and forgets a viewer's changes on reload", () => {
    setupTwoCharts();

    cy.log("the chart saved with events shows them, the other one does not");
    cardEvent(0, RC1.name).should("be.visible");
    cardEvent(0, RC2.name).should("be.visible");
    H.getDashboardCard(1).should("be.visible");
    cardEvent(1, RC1.name).should("not.exist");

    cy.log("clicking an event opens the sidebar with it selected");
    cardEvent(0, RC1.name).click();
    eventsSidebar().should("contain", RC1.name).and("contain", RC2.name);
    cardEvent(0, RC1.name).should("have.attr", "data-selected", "true");

    cy.log("turning a timeline on only affects the card it was opened from");
    openCardEvents(1);
    timelineCheckbox("Releases").should("not.be.checked").click();
    cardEvent(1, RC1.name).should("be.visible");

    cy.log("hiding a single event leaves the rest of the timeline alone");
    eventCard(RC2.name).findByRole("checkbox").click();
    cardEvent(1, RC2.name).should("not.exist");
    cardEvent(1, RC1.name).should("be.visible");

    cy.log("the session's choices are forgotten on reload");
    cy.reload();
    H.waitForDashcardsToLoad();
    cardEvent(0, RC1.name).should("be.visible");
    cardEvent(1, RC1.name).should("not.exist");
  });

  it("turns events on for every chart from the dashboard menu", () => {
    setupTwoCharts();

    H.openDashboardMenu("Events");

    cy.log("a timeline only some charts show is neither on nor off");
    timelineCheckbox("Releases")
      .should("not.be.checked")
      .should("have.prop", "indeterminate", true);

    timelineCheckbox("Releases").click();
    cardEvent(0, RC1.name).should("be.visible");
    cardEvent(1, RC1.name).should("be.visible");

    cy.log("editing the dashboard closes the events sidebar");
    H.editDashboard();
    eventsSidebar().should("not.exist");
  });

  it("tells the user a dashboard without time series charts has nowhere to show events", () => {
    setupDashboard({
      questions: () => [ordersTable("Orders")],
      cards: [WIDE_CARD],
    });

    cy.log("a card that cannot show events does not offer them");
    H.getDashboardCardMenu(0).click();
    H.popover()
      .should("contain", "Download results")
      .and("not.contain", "Events");
    cy.realPress("Escape");

    H.openDashboardMenu("Events");
    eventsSidebar().should(
      "contain",
      "Events can be displayed on time series charts",
    );
  });

  it("creates, edits and archives events from the card sidebar", () => {
    cy.intercept("POST", "/api/timeline-event").as("createEvent");
    cy.intercept("PUT", "/api/timeline-event/*").as("updateEvent");
    setupTwoCharts();

    openCardEvents(0);

    cy.log("a new event is turned on right away");
    eventsSidebar().button("Create event").click();
    H.modal().within(() => {
      cy.findByLabelText("Event name").type("GA");
      cy.findByLabelText("Date").clear().type("06/01/2028");
      cy.button("Create").click();
    });
    cy.wait("@createEvent");
    H.undoToast().icon("close").click();
    cardEvent(0, "GA").should("be.visible");

    cy.log("renaming it updates the chart");
    openEventMenu("GA", "Edit event");
    H.modal().within(() => {
      cy.findByLabelText("Event name").clear().type("GA 2.0");
      cy.button("Update").click();
    });
    cy.wait("@updateEvent");
    cardEvent(0, "GA 2.0").should("be.visible");

    cy.log("archiving it removes it from the chart");
    openEventMenu("GA 2.0", "Archive event");
    cy.wait("@updateEvent");
    cardEvent(0, "GA 2.0").should("not.exist");
    cardEvent(0, RC1.name).should("be.visible");
  });

  it("focuses the sidebar on the group of events whose chip was clicked", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Incidents" },
      events: [{ name: "Outage", timestamp: "2029-01-15T00:00:00Z" }],
    });

    setupDashboard({
      events: [ALPHA, BETA],
      questions: (timelineId) => [
        ordersOverTime("With events", timelineId, "month"),
      ],
      cards: [WIDE_CARD],
    });

    cy.log("close events collapse into one chip that focuses the sidebar");
    cardEvent(0, "2 events").click();
    eventsSidebar()
      .should("contain", ALPHA.name)
      .and("contain", BETA.name)
      .and("not.contain", "Incidents");

    cy.log("'All events' brings back the other timelines");
    eventsSidebar().findByTestId("timeline-sidebar-show-all").click();
    eventsSidebar().should("contain", "Incidents");
  });

  it("leaves events off a card too small to draw them but still offers them", () => {
    setupDashboard({
      questions: (timelineId) => [ordersOverTime("With events", timelineId)],
      cards: [TINY_CARD],
    });

    cardEvent(0, RC1.name).should("not.exist");

    cy.log("the card still offers its events");
    openCardEvents(0);
    timelineCheckbox("Releases").should("be.checked");
  });

  it("does not show events on a public dashboard", () => {
    H.updateSetting("enable-public-sharing", true);
    setupTwoCharts({ visit: false }).then((dashboard) => {
      H.visitPublicDashboard(dashboard.id);
      H.waitForDashcardsToLoad();

      cy.log("the chart renders, but without the events it was saved with");
      H.getDashboardCard(0).should("be.visible");
      cardEvent(0, RC1.name).should("not.exist");
    });
  });

  it("lets a user without curate access toggle events but not change them", () => {
    setupTwoCharts({ visit: false }).then((dashboard) => {
      cy.signIn("readonly");
      H.visitDashboard(dashboard.id);
      H.waitForDashcardsToLoad();

      openCardEvents(1);

      eventsSidebar().should("contain", "Releases");
      eventsSidebar().findByText("Create event").should("not.exist");
      eventCard(RC1.name).icon("ellipsis").should("not.exist");

      timelineCheckbox("Releases").click();
      cardEvent(1, RC1.name).should("be.visible");
    });
  });
});
