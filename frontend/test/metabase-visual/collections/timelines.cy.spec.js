import { restore, visitQuestionAdhoc } from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const EVENTS = [
  { name: "Event 1", timestamp: "2020-01-01", icon: "star" },
  { name: "Event 2", timestamp: "2020-03-01", icon: "mail" },
  { name: "Event 3", timestamp: "2020-02-01", icon: "balloons" },
];

describe("timelines", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display empty state", () => {
    cy.visit("/collection/root/timelines");

    cy.findByText("Our analytics events").should("be.visible");
    cy.percySnapshot();
  });

  it("should display timeline events in collections", () => {
    cy.createTimelineWithEvents({ events: EVENTS }).then(({ timeline }) => {
      cy.visit(`/collection/root/timelines/${timeline.id}`);

      cy.findByText("Timeline").should("be.visible");
      cy.percySnapshot();
    });
  });

  it("should display timeline events with a structured question", () => {
    cy.createTimelineWithEvents({
      timeline: { name: "Releases" },
      events: [
        { name: "v20", timestamp: "2017-10-30T00:00:00Z", icon: "cloud" },
        { name: "v21", timestamp: "2018-08-08T00:00:00Z", icon: "mail" },
        { name: "RC1", timestamp: "2019-05-10T00:00:00Z", icon: "bell" },
        { name: "RC2", timestamp: "2019-05-20T00:00:00Z", icon: "star" },
      ],
    });

    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
        "graph.show_values": true,
      },
    });

    cy.findByLabelText("star icon").realHover();
    cy.findByText("RC1");
    cy.percySnapshot();
  });

  it("should display timeline events with a native question", () => {
    cy.createTimelineWithEvents({
      timeline: { name: "Releases" },
      events: [
        { name: "v20", timestamp: "2017-10-30T00:00:00Z", icon: "cloud" },
        { name: "v21", timestamp: "2018-08-08T00:00:00Z", icon: "mail" },
        { name: "RC1", timestamp: "2019-05-10T00:00:00Z", icon: "bell" },
        { name: "RC2", timestamp: "2019-05-20T00:00:00Z", icon: "star" },
      ],
    });

    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query: "SELECT ID, CREATED_AT FROM ORDERS LIMIT 25",
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["ID"],
      },
    });

    cy.findByLabelText("star icon").realHover();
    cy.findByText("RC1");
    cy.percySnapshot();
  });
});
