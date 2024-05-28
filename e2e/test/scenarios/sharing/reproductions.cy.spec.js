import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_USER_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  setupSMTP,
  visitDashboard,
  getFullName,
  sidebar,
  popover,
  visitQuestion,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;
const { admin } = USERS;
const { first_name, last_name } = admin;

describe("issue 17657", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createSubscriptionWithoutRecipients();
  });

  it("frontend should gracefully handle the case of a subscription without a recipient (metabase#17657)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);

    cy.icon("subscription").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^Emailed monthly/).click();

    sidebar().within(() => {
      cy.button("Done").should("be.disabled");
    });

    // Open the popover with all users
    cy.findByPlaceholderText("Enter user names or email addresses").click();
    // Pick admin as a recipient
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${first_name} ${last_name}`).click();

    sidebar().within(() => {
      cy.button("Done").should("not.be.disabled");
    });
  });
});

function createSubscriptionWithoutRecipients() {
  cy.request("POST", "/api/pulse", {
    name: "Orders in a dashboard",
    cards: [
      {
        id: ORDERS_QUESTION_ID,
        collection_id: null,
        description: null,
        display: "table",
        name: "Orders",
        include_csv: false,
        include_xls: false,
        dashboard_card_id: 1,
        dashboard_id: ORDERS_DASHBOARD_ID,
        parameter_mappings: [],
      },
    ],
    channels: [
      {
        channel_type: "email",
        enabled: true,
        // Since the fix (https://github.com/metabase/metabase/pull/17668), this is not even possible to do in the UI anymore.
        // Backend still doesn't do this validation so we're making sure the FE handles the case of missing recipients gracefully.
        recipients: [],
        details: {},
        schedule_type: "monthly",
        schedule_day: "mon",
        schedule_hour: 8,
        schedule_frame: "first",
      },
    ],
    skip_if_empty: false,
    collection_id: null,
    parameters: [],
    dashboard_id: ORDERS_DASHBOARD_ID,
  });
}

describe("issue 17658", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/pulse/*").as("deletePulse");
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    moveDashboardToCollection("First collection");
  });

  it("should delete dashboard subscription from any collection (metabase#17658)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);

    cy.icon("subscription").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^Emailed monthly/).click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Delete this subscription").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^This dashboard will no longer be emailed to/).click();

    cy.button("Delete").click();

    cy.wait("@deletePulse").then(({ response }) => {
      expect(response.body.cause).not.to.exist;
      expect(response.statusCode).not.to.eq(500);
    });

    cy.button("Delete").should("not.exist");
  });
});

function moveDashboardToCollection(collectionName) {
  const { first_name, last_name, email } = admin;

  cy.request("GET", "/api/collection/tree?tree=true").then(
    ({ body: collections }) => {
      const { id } = collections.find(
        collection => collection.name === collectionName,
      );

      // Move dashboard
      cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
        collection_id: id,
      });

      // Create subscription
      cy.request("POST", "/api/pulse", {
        name: "Orders in a dashboard",
        cards: [
          {
            id: ORDERS_QUESTION_ID,
            collection_id: null,
            description: null,
            display: "table",
            name: "Orders",
            include_csv: false,
            include_xls: false,
            dashboard_card_id: ORDERS_DASHBOARD_DASHCARD_ID,
            dashboard_id: ORDERS_DASHBOARD_ID,
            parameter_mappings: [],
          },
        ],
        channels: [
          {
            channel_type: "email",
            enabled: true,
            recipients: [
              {
                id: ADMIN_USER_ID,
                email,
                first_name,
                last_name,
                common_name: getFullName(admin),
              },
            ],
            details: {},
            schedule_type: "monthly",
            schedule_day: "mon",
            schedule_hour: 8,
            schedule_frame: "first",
          },
        ],
        skip_if_empty: false,
        collection_id: id,
        parameters: [],
        dashboard_id: ORDERS_DASHBOARD_ID,
      });
    },
  );
}

describe("issue 17547", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
      breakout: [
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
      ],
      aggregation: [["count"]],
    },
    display: "area",
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id: questionId } }) => {
      setUpAlert(questionId);

      visitQuestion(questionId);
    });
  });

  it("editing an alert should not delete it (metabase#17547)", () => {
    cy.icon("bell").click();
    popover().within(() => {
      cy.findByText("Daily, 12:00 PM");
      cy.findByText("Edit").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("AM").click();
    cy.button("Save changes").click();

    cy.wait("@alertQuery");

    cy.icon("bell").click();
    popover().within(() => {
      cy.findByText("Daily, 12:00 AM");
    });
  });
});

function setUpAlert(questionId) {
  cy.request("POST", "/api/alert", {
    channels: [
      {
        schedule_type: "daily",
        schedule_hour: 12,
        channel_type: "slack",
        schedule_frame: null,
        recipients: [],
        details: { channel: "#work" },
        pulse_id: 1,
        id: 1,
        schedule_day: null,
        enabled: true,
      },
    ],
    alert_condition: "rows",
    name: null,
    creator_id: ADMIN_USER_ID,
    card: { id: questionId, include_csv: true, include_xls: false },
    alert_first_only: false,
    skip_if_empty: true,
    parameters: [],
    dashboard_id: null,
  }).then(({ body: { id: alertId } }) => {
    cy.intercept("PUT", `/api/alert/${alertId}`).as("alertQuery");
  });
}

describe("issue 16108", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display a tooltip for CTA icons on an individual question (metabase#16108)", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    cy.icon("download").realHover();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Download full results");
    cy.icon("bell").realHover();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Get alerts");
    cy.icon("share").realHover();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sharing");
  });
});
