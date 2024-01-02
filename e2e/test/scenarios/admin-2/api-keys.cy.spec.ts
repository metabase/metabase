import { popover, restore } from "e2e/support/helpers";
import type { ApiKey } from "metabase-types/api";

import {
  ALL_USERS_GROUP_ID,
  READONLY_GROUP_ID,
  NOSQL_GROUP_ID,
  COLLECTION_GROUP_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("scenarios > admin > settings > API keys", () => {
  // TODO: replace intercepts below with actual requests to test backend
  const mockRows: ApiKey[] = [];

  beforeEach(() => {
    cy.intercept("GET", "/api/api-key/count").as("getKeyCount");
    cy.intercept("GET", "/api/api-key").as("getKeys");
    cy.intercept("POST", "/api/api-key").as("createKey");
    cy.intercept("PUT", "/api/api-key/*").as("updateKey");
    cy.intercept("PUT", "/api/api-key/*/regenerate").as("regenerateKey");
    cy.intercept("DELETE", "/api/api-key/*").as("deleteKey");
    cy.intercept("GET", "/api/permissions/group").as("getGroups");

    restore();
    cy.signInAsAdmin();
  });

  it("should show number of API keys on auth card", () => {
    cy.visit("/admin/settings/authentication");

    cy.wait("@getKeyCount");
    cy.findByTestId("api-keys-setting").findByText("API Keys");

    createApiKey("Test API Key One", ALL_USERS_GROUP_ID);

    cy.reload();
    cy.wait("@getKeyCount");

    cy.findByTestId("api-keys-setting")
      .findByTestId("card-badge")
      .findByText("1 API Key");

    createApiKey("Test API Key Two", ALL_USERS_GROUP_ID);
    createApiKey("Test API Key Three", ALL_USERS_GROUP_ID);

    cy.reload();
    cy.wait("@getKeyCount");

    cy.findByTestId("api-keys-setting")
      .findByTestId("card-badge")
      .findByText("3 API Keys");
  });

  it("should list existing API keys", () => {
    createApiKey("Test API Key One", ALL_USERS_GROUP_ID);
    createApiKey("Test API Key Two", NOSQL_GROUP_ID);
    createApiKey("Test API Key Three", READONLY_GROUP_ID);

    cy.visit("/admin/settings/authentication/api-keys");
    cy.wait("@getKeys");
    cy.findByTestId("api-keys-settings-header").findByText("Manage API Keys");

    cy.findByTestId("api-keys-table").within(() => {
      cy.findByText("Test API Key One");
      cy.findByText("All Users");

      cy.findByText("Test API Key Two");
      cy.findByText("nosql");

      cy.findByText("Test API Key Three");
      cy.findByText("readonly");

      cy.findAllByText(/mb_/); // masked key prefix
      cy.findAllByText("Bobby Tables"); // modifier
    });
  });

  it("should allow creating an API key", () => {
    cy.visit("/admin/settings/authentication/api-keys");
    cy.wait("@getKeys");
    cy.findByTestId("api-keys-settings-header")
      .button("Create API Key")
      .click();

    cy.wait("@getGroups");

    cy.findByTestId("create-api-key-modal").within(() => {
      cy.findByLabelText(/Key name/).type("New key");
      cy.findByLabelText(/Select a group/).click();
    });

    cy.findByRole("listbox").findByText("Administrators").click();

    cy.findByLabelText("Create a new API Key").button("Create").click();

    cy.wait("@createKey");
    cy.wait("@getKeys");

    cy.findByLabelText("Copy and save the API key").findByLabelText(
      /the api key/i,
    );

    cy.button("Done").click();
    cy.findByTestId("api-keys-table").findByText("New key");
  });

  it("should allow deleting an API key", () => {
    createApiKey("Test API Key One", ALL_USERS_GROUP_ID);
    cy.visit("/admin/settings/authentication/api-keys");
    cy.wait("@getKeys");

    cy.findByTestId("api-keys-table")
      .contains("Test API Key One")
      .closest("tr")
      .icon("trash")
      .click();
    cy.findByLabelText("Delete API Key").button("Delete API Key").click();

    cy.wait("@deleteKey");
    cy.wait("@getKeys");

    cy.findByTestId("api-keys-table").should("not.contain", "Test API Key One");
    cy.findByTestId("api-keys-table").findByText("No API keys here yet");
  });

  it("should allow editing an API key", () => {
    createApiKey("Development API Key", ALL_USERS_GROUP_ID);
    cy.visit("/admin/settings/authentication/api-keys");
    cy.wait("@getKeys");

    cy.findByTestId("api-keys-table")
      .should("include.text", "Development API Key")
      .and("include.text", "All Users");

    cy.findByTestId("api-keys-table").icon("pencil").click();

    cy.findByLabelText(/Key name/)
      .clear()
      .type("Different key name");

    cy.findByLabelText(/Select a group/).click();
    cy.findByRole("listbox").findByText("collection").click();

    cy.button("Save").click();
    cy.wait("@updateKey");
    cy.wait("@getKeys");

    cy.findByTestId("api-keys-table")
      .should("not.contain", "Development API Key")
      .contains("Different key name")
      .closest("tr")
      .should("contain", "collection");
  });

  it("should allow regenerating an API key", () => {
    createApiKey("Personal API Key", ALL_USERS_GROUP_ID);

    cy.visit("/admin/settings/authentication/api-keys");
    cy.wait("@getKeys").then(({ response }) => {
      const { created_at, updated_at } = response?.body[0];
      // on creation, created_at and updated_at should be the same
      expect(created_at).to.equal(updated_at);
    });
    cy.findByTestId("api-keys-table")
      .contains("Personal API Key")
      .closest("tr")
      .icon("pencil")
      .click();
    cy.button("Regenerate API Key").click();
    cy.button("Regenerate").click();
    cy.wait("@regenerateKey");
    cy.findByLabelText("The API key").should("include.value", "mb_");

    cy.wait("@getKeys").then(({ response }) => {
      const { created_at, updated_at } = response?.body[0];
      // after regeneration, created_at and updated_at should be different
      // they're too close to check via UI though
      expect(created_at).to.not.equal(updated_at);
    });

    cy.button("Done").click();
    cy.findByTestId("api-keys-table").findByText(/mb_/);
  });

  it.skip("should warn before deleting a group with API keys", () => {
    createApiKey("Personal API Key", COLLECTION_GROUP_ID);

    cy.visit("/admin/people/groups");
    cy.wait("@getKeys");
    cy.get(".ContentTable")
      .contains("collection")
      .closest("tr")
      .should("contain", "(Includes 1 API Key")
      .icon("ellipsis")
      .click();
    popover().findByText("Remove Group").click();
    cy.get(".Modal")
      .findByText(/move the API Keys/)
      .click();
    cy.url().should("match", /\/admin\/settings\/authentication\/api-keys$/);
  });

  it.skip("should show API keys when viewing Group details", () => {
    cy.intercept("GET", "/api/api-key", req => req.reply(200, mockRows)).as(
      "getKeys",
    );
    cy.visit("/admin/people/groups/3");
    cy.wait("@getKeys");
    cy.get(".ContentTable")
      .findByText("Personal API Key")
      .closest("tr")
      .icon("link")
      .as("apiKeysLink")
      .realHover();
    cy.findByRole("tooltip").should("contain", "Manage API keys");
    cy.get("@apiKeysLink").click();
    cy.url().should("match", /\/admin\/settings\/authentication\/api-keys$/);
  });

  it.skip("should show when a question was last edited by an API key", () => {
    // TODO: write this when backend is ready
  });
});

const createApiKey = (name: string, group_id: number) => {
  cy.request("POST", "/api/api-key", {
    name,
    group_id,
  });
};
