import { restore } from "__support__/e2e/helpers/e2e-setup-helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const getQuestionDetails = () => ({
  name: "Question",
  query: {
    "source-table": ORDERS_ID,
  },
});

const getAlertDetails = ({ user_id, card_id }) => ({
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

const getPulseDetails = ({ card_id, dashboard_id }) => ({
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
      channel_type: "slack",
      schedule_type: "hourly",
    },
  ],
});

describe("visual tests > account > notifications", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.getCurrentUser().then(({ body: { id: user_id } }) => {
      cy.createQuestionAndDashboard({
        questionDetails: getQuestionDetails(),
      }).then(({ body: { card_id, dashboard_id } }) => {
        cy.createAlert(getAlertDetails({ user_id, card_id }));
        cy.createPulse(getPulseDetails({ card_id, dashboard_id }));
      });
    });
  });

  it("renders notifications", () => {
    cy.visit("/account/notifications");
    cy.findByText("Question");
    cy.percySnapshot();
  });
});
