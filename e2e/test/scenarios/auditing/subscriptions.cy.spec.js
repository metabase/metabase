import {
  restore,
  modal,
  popover,
  describeEE,
  getFullName,
} from "e2e/support/helpers";

import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;
const { admin, nodata } = USERS;

const adminFullName = getFullName(admin);
const ADMIN_ID = 1;

const getQuestionDetails = () => ({
  name: "Test Question",
  query: {
    "source-table": ORDERS_ID,
  },
});

const getAlertDetails = ({ card_id, user_id }) => ({
  card: {
    id: card_id,
    include_csv: false,
    include_xls: false,
  },
  channels: [
    {
      enabled: true,
      channel_type: "email",
      schedule_type: "hourly",
      recipients: [
        {
          id: user_id,
        },
      ],
    },
  ],
});

const getSubscriptionsDetails = ({ card_id, dashboard_id, user_id }) => ({
  name: "Subscription",
  dashboard_id,
  cards: [
    {
      id: card_id,
      include_csv: false,
      include_xls: false,
    },
  ],
  channels: [
    {
      enabled: true,
      channel_type: "email",
      schedule_type: "hourly",
      recipients: [
        {
          id: user_id,
        },
      ],
    },
  ],
});

describeEE("audit > auditing > subscriptions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("subscriptions", () => {
    beforeEach(() => {
      cy.getCurrentUser().then(({ body: { id: user_id } }) => {
        cy.createQuestionAndDashboard({
          questionDetails: getQuestionDetails(),
        }).then(({ body: { card_id, dashboard_id } }) => {
          cy.wrap(dashboard_id).as("dashboardId");

          cy.createPulse(
            getSubscriptionsDetails({ card_id, dashboard_id, user_id }),
          );
        });
      });

      cy.visit("/admin/audit/subscriptions");
    });

    it("shows subscriptions", () => {
      cy.get("tbody").within(() => {
        cy.findByText("Test Dashboard"); // Dashboard name
        cy.findByText("Our analytics"); // Collection
        cy.findByText("Every hour"); // Frequency
        cy.findByText(adminFullName); // Author
        cy.findByText("Email"); // Type
      });
    });

    it("opens a dashboard audit page when question title clicked", () => {
      cy.get("tbody").within(() => {
        cy.findByText("Test Dashboard").click();
        cy.get("@dashboardId").then(id => {
          cy.url().should("include", `/admin/audit/dashboard/${id}/activity`);
        });
      });
    });

    it("opens a user audit page when question title clicked", () => {
      cy.get("tbody").within(() => {
        cy.findByText(adminFullName).click();
        cy.url().should("include", `/admin/audit/member/${ADMIN_ID}/activity`);
      });
    });

    it("allows to delete subscriptions", testRemovingAuditItem);

    it("allows to edit recipients", () => {
      testEditingRecipients({
        editModalHeader: "Subscription recipients",
      });
    });
  });

  describe("alerts", () => {
    beforeEach(() => {
      cy.getCurrentUser().then(({ body: { id: user_id } }) => {
        cy.createQuestion(getQuestionDetails()).then(
          ({ body: { id: card_id } }) => {
            cy.createAlert(getAlertDetails({ card_id, user_id }));
          },
        );
      });

      cy.visit("/admin/audit/subscriptions/alerts");
    });

    it("shows alerts", () => {
      cy.get("tbody").within(() => {
        cy.findByText("Test Question"); // Question name
        cy.findByText("Our analytics"); // Collection
        cy.findByText("Every hour"); // Frequency
        cy.findByText(adminFullName); // Author
        cy.findByText("Email"); // Type
      });
    });

    it("opens a question audit page when question title clicked", () => {
      cy.get("tbody").within(() => {
        cy.findByText("Test Question").click();
        cy.url().should("include", "/admin/audit/question/4/activity");
      });
    });

    it("opens a user audit page when question title clicked", () => {
      cy.get("tbody").within(() => {
        cy.findByText(adminFullName).click();
        cy.url().should("include", `/admin/audit/member/${ADMIN_ID}/activity`);
      });
    });

    it("allows to delete alerts", testRemovingAuditItem);

    it("allows to edit recipients", () => {
      testEditingRecipients({
        editModalHeader: "Test Question alert recipients",
      });
    });
  });
});

function testRemovingAuditItem() {
  cy.get("tbody").within(() => {
    cy.icon("close").click();
  });

  modal().within(() => {
    cy.findByText("Delete this alert?");
    cy.button("Delete").should("be.disabled");

    cy.findByText("This alert will no longer be emailed hourly.").click();
    cy.button("Delete").click();
  });

  cy.findByText("No results");
}

function testEditingRecipients({ editModalHeader }) {
  cy.get("tbody > tr > td").eq(1).as("recipients").click();

  modal().within(() => {
    cy.findByText(editModalHeader);
    cy.findByText(adminFullName);

    cy.icon("close").eq(1).click(); // Remove admin user

    cy.get("input").click();
  });

  popover().within(() => {
    cy.findByText(getFullName(nodata)).click(); // Add No Data user
  });

  modal().within(() => {
    cy.get("input").type("another-recipient@metabase.com{enter}"); // Add email
    cy.button("Update").click();
  });

  modal().should("not.exist");

  cy.get("@recipients").should("have.text", "2");
}
