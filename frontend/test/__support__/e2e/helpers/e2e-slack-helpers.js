// Since there is no testing API token for Slack, it's easier to mock its configuration
const mockedSlack = {
  type: "slack",
  name: "Slack",
  allows_recipients: true,
  schedules: ["hourly", "daily", "weekly", "monthly"],
  fields: [
    {
      name: "channel",
      type: "select",
      displayName: "Post to",
      options: ["#work", "#play"],
      required: true,
    },
  ],
  configured: true,
};

export function mockSlackConfigured() {
  // First, let's get the actual config (email might have already been configured and we want to preserve that)
  cy.request("GET", "/api/pulse/form_input").then(({ body }) => {
    const originalEmailConfig = body.channels.email;

    const mockedConfig = Object.assign({}, body, {
      channels: {
        email: originalEmailConfig,
        slack: mockedSlack,
      },
    });

    // Stubbing the response in advance
    // (Cypress will intercept it when we navigate to "Dashboard subscriptions" or a question alert)
    cy.intercept("GET", "/api/pulse/form_input", mockedConfig);
  });
}
