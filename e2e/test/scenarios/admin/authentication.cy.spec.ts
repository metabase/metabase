const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMINISTRATORS_GROUP_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import { setupSaml } from "./sso/shared/helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > settings > API keys", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/api-key/count").as("getKeyCount");
    cy.intercept("GET", "/api/api-key").as("getKeys");
    cy.intercept("POST", "/api/api-key").as("createKey");
    cy.intercept("PUT", "/api/api-key/*/regenerate").as("regenerateKey");

    H.restore();
    cy.signInAsAdmin();
  });

  it("should create an API key, count it on the auth card, and regenerate it", () => {
    visitApiKeySettings();
    H.tryToCreateApiKeyViaModal({ name: "New key", group: "Administrators" });

    cy.findByLabelText("Copy and save this API key")
      .findByLabelText("The API key")
      .invoke("val")
      .should("match", /^mb_/);
    cy.button("Done").click();

    cy.log("the key is saved");
    cy.reload();
    cy.wait("@getKeys");
    cy.findByTestId("api-keys-table")
      .findByRole("row", { name: "New key" })
      .should("contain", "Administrators")
      .and("contain", "mb_");

    cy.log("the auth card counts it");
    cy.visit("/admin/settings/authentication");
    cy.wait("@getKeyCount");
    cy.findByTestId("api-keys-setting")
      .findByTestId("card-badge")
      .should("have.text", "1 API Key");

    cy.log("regenerating the key updates it");
    visitApiKeySettings();
    cy.findByTestId("api-keys-table")
      .findByRole("row", { name: "New key" })
      .findByLabelText("API key actions")
      .click();
    cy.findByRole("menuitem", { name: /edit/i }).click();
    cy.button("Regenerate API key").click();
    cy.button("Regenerate").click();
    cy.wait("@regenerateKey");
    cy.findByLabelText("The API key").should("include.value", "mb_");

    cy.wait("@getKeys").then(({ response }) => {
      const { created_at, updated_at } = response?.body?.[0] ?? {};
      // after regeneration, created_at and updated_at should be different
      // they're too close to check via UI though
      expect(created_at).to.not.equal(updated_at);
    });
    cy.button("Done").click();
  });

  describe("api key actions", () => {
    it("should allow creating questions and dashboards with an API key", () => {
      H.createApiKey("Test API Key One", ADMINISTRATORS_GROUP_ID).then(
        ({ body }) => {
          const apiKey = body.unmasked_key;
          createQuestionForApiKey(apiKey).then(({ body }) => {
            const questionId = body.id;

            cy.signInAsAdmin();
            H.visitQuestion(questionId);
            cy.findByTestId("qb-header").findByText("Test Question");
            cy.findByTestId("view-footer").findByText("Showing 22 rows");

            cy.findByTestId("qb-header-info-button").click();
            H.sidesheet().within(() => {
              cy.findByText("Test API Key One created this.");
            });
          });

          createDashboardForApiKey(apiKey).then(({ body }) => {
            const dashboardId = body.id;

            cy.signInAsAdmin();
            H.visitDashboard(dashboardId);
            cy.findByTestId("dashboard-header").findByText("Test Dashboard");
            cy.findByTestId("dashboard-header").icon("info").click();
            H.sidesheet().within(() => {
              cy.findByText("Test API Key One created this.");
            });
          });
        },
      );
    });

    it("should allow editing questions and dashboards with an api key", () => {
      H.createApiKey("Test API Key One", ADMINISTRATORS_GROUP_ID).then(
        ({ body }) => {
          const apiKey = body.unmasked_key;

          editQuestionForApiKey(
            apiKey,
            ORDERS_QUESTION_ID,
            "Edited Question Name",
          ).then(() => {
            cy.signInAsAdmin();
            H.visitQuestion(ORDERS_QUESTION_ID);
            cy.findByTestId("qb-header").findByText("Edited Question Name");
            cy.findByTestId("qb-header-info-button").click();
            H.sidesheet().within(() => {
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
            H.visitDashboard(ORDERS_DASHBOARD_ID);
            cy.findByTestId("dashboard-header").findByText(
              "Edited Dashboard Name",
            );
            cy.findByTestId("dashboard-header").icon("info").click();
            H.sidesheet().within(() => {
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

describe("scenarios > admin > settings > user provisioning", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should set up SCIM, and turn the SAML provisioning warning off", () => {
    const samlWarningMessage =
      "When enabled, SAML user provisioning will be turned off in favor of SCIM.";

    setupSaml();
    cy.visit("/admin/settings/authentication/user-provisioning");

    H.main().within(() => {
      cy.findByText(samlWarningMessage).should("be.visible");
      scimEndpointInput().should("not.exist");
      scimTokenInput().should("not.exist");
    });

    scimToggle().click();

    let unmaskedToken = "";
    H.modal().within(() => {
      cy.findByText("Here's what you'll need to set SCIM up").should("exist");
      scimEndpointInput().invoke("val").should("contain", "/api/ee/scim/v2");
      scimTokenInput()
        .invoke("val")
        .should("contain", "mb_")
        .should("not.contain", "****************************************")
        .then((val) => (unmaskedToken = String(val)));
      cy.findByRole("button", { name: /Done/ }).click();
    });

    H.main().findByText(samlWarningMessage).should("not.exist");

    cy.log("the setting and the token are saved");
    cy.reload();
    scimSetting().findByLabelText("Enabled").should("be.checked");
    scimEndpointInput().invoke("val").should("contain", "/api/ee/scim/v2");
    scimTokenInput()
      .invoke("val")
      .should("contain", "****************************************")
      .then((val) => expect(val).to.contain(unmaskedToken.slice(0, 7)));
    H.main().findByText(samlWarningMessage).should("not.exist");
  });
});

function visitApiKeySettings() {
  cy.visit("/admin/settings/authentication/api-keys");
  cy.wait("@getKeys");
  cy.findByTestId("api-keys-settings-header");
}

function scimToggle() {
  return scimSetting().findByLabelText(/Enabled|Disabled/);
}

function scimSetting() {
  return cy.findByTestId("scim-enabled-setting");
}

function scimEndpointInput() {
  return cy.findByLabelText("SCIM endpoint URL");
}

function scimTokenInput() {
  return cy.findByLabelText("SCIM token");
}

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
