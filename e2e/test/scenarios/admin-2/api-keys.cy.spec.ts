import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ALL_USERS_GROUP_ID,
  READONLY_GROUP_ID,
  NOSQL_GROUP_ID,
  ADMINISTRATORS_GROUP_ID,
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  visitDashboard,
  visitQuestion,
  createApiKey,
} from "e2e/support/helpers";
const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > settings > API keys", () => {
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
      cy.findByLabelText(/group/).click();
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

    cy.findByTestId("empty-table-warning").findByText("No API keys here yet");
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

    cy.findByLabelText(/group/).click();
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

  describe("api key actions", () => {
    it("should allow creating questions and dashboards with an API key", () => {
      createApiKey("Test API Key One", ADMINISTRATORS_GROUP_ID).then(
        ({ body }) => {
          const apiKey = body.unmasked_key;
          createQuestionForApiKey(apiKey).then(({ body }) => {
            const questionId = body.id;

            cy.signInAsAdmin();
            visitQuestion(questionId);
            cy.findByTestId("qb-header").findByText("Test Question");
            cy.findByTestId("view-footer").findByText("Showing 22 rows");

            cy.findByTestId("qb-header-info-button").click();
            cy.findByTestId("sidebar-right").findByText(
              "Test API Key One created this.",
            );
          });

          createDashboardForApiKey(apiKey).then(({ body }) => {
            const dashboardId = body.id;

            cy.signInAsAdmin();
            visitDashboard(dashboardId);
            cy.findByTestId("dashboard-header").findByText("Test Dashboard");
            cy.findByTestId("dashboard-header").icon("info").click();
            cy.findByTestId("sidebar-right").findByText(
              "Test API Key One created this.",
            );
          });
        },
      );
    });

    it("should allow editing questions and dashboards with an api key", () => {
      createApiKey("Test API Key One", ADMINISTRATORS_GROUP_ID).then(
        ({ body }) => {
          const apiKey = body.unmasked_key;

          editQuestionForApiKey(
            apiKey,
            ORDERS_QUESTION_ID,
            "Edited Question Name",
          ).then(() => {
            cy.signInAsAdmin();
            visitQuestion(ORDERS_QUESTION_ID);
            cy.findByTestId("qb-header").findByText("Edited Question Name");
            cy.findByTestId("qb-header-info-button").click();
            cy.findByTestId("sidebar-right").within(() => {
              cy.findByText("You created this.");
              cy.findByText(
                'Test API Key One renamed this Card from "Orders" to "Edited Question Name".',
              );
            });
          });

          editDashboardForApiKey(
            apiKey,
            ORDERS_DASHBOARD_ID,
            "Edited Dashboard Name",
          ).then(() => {
            cy.signInAsAdmin();
            visitDashboard(ORDERS_DASHBOARD_ID);
            cy.findByTestId("dashboard-header").findByText(
              "Edited Dashboard Name",
            );
            cy.findByTestId("dashboard-header").icon("info").click();
            cy.findByTestId("sidebar-right").within(() => {
              cy.findByText("You created this.");
              cy.findByText(
                'Test API Key One renamed this Dashboard from "Orders in a dashboard" to "Edited Dashboard Name".',
              );
            });
          });
        },
      );
    });
  });
});

const createQuestionForApiKey = (apiKey: string) => {
  cy.signOut();

  return cy.request({
    method: "POST",
    url: "/api/card",
    headers: {
      "X-Api-Key": apiKey,
    },
    body: {
      name: "Test Question",
      display: "table",
      visualization_settings: {},
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          limit: 22,
        },
      },
    },
  });
};

const createDashboardForApiKey = (apiKey: string) => {
  cy.signOut();

  return cy.request({
    method: "POST",
    url: "/api/dashboard",
    headers: {
      "X-Api-Key": apiKey,
    },
    body: {
      name: "Test Dashboard",
    },
  });
};

const editQuestionForApiKey = (
  apiKey: string,
  questionId: number,
  newQuestionName: string,
) => {
  cy.signOut();
  return cy
    .request({
      method: "GET",
      url: `/api/card/${questionId}`,
      headers: {
        "X-Api-Key": apiKey,
      },
    })
    .then(({ body: previousBody }) => {
      return cy.request({
        method: "PUT",
        url: `/api/card/${questionId}`,
        headers: {
          "X-Api-Key": apiKey,
        },
        body: {
          ...previousBody,
          name: newQuestionName,
        },
      });
    });
};

const editDashboardForApiKey = (
  apiKey: string,
  dashboardId: number,
  newDashboardName: string,
) => {
  cy.signOut();
  return cy
    .request({
      method: "GET",
      url: `/api/dashboard/${dashboardId}`,
      headers: {
        "X-Api-Key": apiKey,
      },
    })
    .then(({ body: previousBody }) => {
      return cy.request({
        method: "PUT",
        url: `/api/dashboard/${dashboardId}`,
        headers: {
          "X-Api-Key": apiKey,
        },
        body: {
          ...previousBody,
          name: newDashboardName,
        },
      });
    });
};
