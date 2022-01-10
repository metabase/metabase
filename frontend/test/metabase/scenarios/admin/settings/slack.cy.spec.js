import { restore } from "__support__/e2e/cypress";

const SLACK_APP_TOKEN = "xoxb-token";
const SLACK_FILES_CHANNEL = "metabase_files";

describe("scenarios > admin > settings > slack", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add a slack app", () => {
    cy.visit("/admin/settings/slack");

    cy.findByText("1. Create your Slack App");
    cy.findByLabelText("Slack Bot User OAuth Token").type(SLACK_APP_TOKEN);
    cy.findByLabelText("Slack channel name").type(SLACK_FILES_CHANNEL);
    cy.button("Save changes").click();

    cy.findByText("Slack app is working");
    cy.findByText(SLACK_APP_TOKEN);
  });

  it("should delete a slack app", () => {
    cy.visit("/admin/settings/slack");

    cy.findByLabelText("Slack Bot User OAuth Token").type(SLACK_APP_TOKEN);
    cy.findByLabelText("Slack channel name").type(SLACK_FILES_CHANNEL);
    cy.button("Save changes").click();

    cy.button("Delete Slack App").click();
    cy.button("Delete").click();

    cy.findByText("1. Create your Slack App");
  });
});
