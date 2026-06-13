const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails: StructuredQuestionDetails = {
  name: "Orders count",
  query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
  display: "scalar",
};

const PASSWORD = "secret123";
const UPDATED_PASSWORD = "updated456";

describe(
  "scenarios > sharing > public link password protection",
  { tags: ["@enterprise"] },
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.updateSetting("enable-public-sharing", true);
    });

    it("viewer: unlock form blocks access then allows it after correct password (dashboard)", () => {
      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { dashboard_id } }) => {
          cy.log("Create public link and set a password via API");
          cy.request("POST", `/api/dashboard/${dashboard_id}/public_link`).then(
            ({ body: { uuid } }) => {
              cy.request(
                "PUT",
                `/api/dashboard/${dashboard_id}/public_password`,
                { password: PASSWORD },
              );

              cy.log("Visit public dashboard as anonymous user");
              cy.signOut();
              cy.visit(`/public/dashboard/${uuid}`);

              cy.log("Unlock form should be displayed");
              cy.findByTestId("unlock-password-input").should("be.visible");
              cy.findByTestId("unlock-submit-button").should("be.visible");

              cy.log("Wrong password shows error");
              cy.findByTestId("unlock-password-input").type("wrongpass");
              cy.findByTestId("unlock-submit-button").click();
              cy.findByText("Incorrect password.").should("be.visible");

              cy.log("Correct password unlocks the dashboard");
              cy.findByTestId("unlock-password-input").clear().type(PASSWORD);

              cy.intercept("POST", `/api/public/dashboard/${uuid}/unlock`).as(
                "unlock",
              );
              cy.findByTestId("unlock-submit-button").click();
              cy.wait("@unlock");

              cy.log("Dashboard content should be visible after reload");
              cy.findByTestId("scalar-value").should("be.visible");
            },
          );
        },
      );
    });

    it("creator can set, update, and remove a password on a dashboard public link", () => {
      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { dashboard_id } }) => {
          H.visitDashboard(dashboard_id);

          cy.log("Create a public link");
          H.openSharingMenu("Create a public link");

          cy.log("Toggle password on and set it");
          cy.findByTestId("public-link-password-toggle").click({ force: true });
          cy.findByTestId("public-link-password-input")
            .should("be.visible")
            .type(PASSWORD);

          cy.intercept("PUT", "/api/dashboard/*/public_password").as(
            "setPassword",
          );
          cy.intercept("GET", "/api/dashboard/*/public_password").as(
            "getPassword",
          );
          cy.findByTestId("public-link-password-save").click();
          cy.wait("@setPassword");
          cy.wait("@getPassword");

          cy.log("Password should be saved and displayed");
          cy.findByTestId("public-link-password-display").should("be.visible");

          cy.log("Edit the password");
          cy.findByTestId("public-link-password-edit").click();
          cy.findByTestId("public-link-password-input")
            .clear()
            .type(UPDATED_PASSWORD);

          cy.intercept("PUT", "/api/dashboard/*/public_password").as(
            "updatePassword",
          );
          cy.intercept("GET", "/api/dashboard/*/public_password").as(
            "getUpdatedPassword",
          );
          cy.findByTestId("public-link-password-confirm").click();
          cy.wait("@updatePassword");
          cy.wait("@getUpdatedPassword");

          cy.log("Password should still be displayed");
          cy.findByTestId("public-link-password-display").should("be.visible");

          cy.log("Remove the password by toggling off");
          cy.intercept("DELETE", "/api/dashboard/*/public_password").as(
            "deletePassword",
          );
          cy.findByTestId("public-link-password-toggle").click({ force: true });
          cy.wait("@deletePassword");

          cy.log("Password section should be gone");
          cy.findByTestId("public-link-password-toggle").should("exist");
          cy.findByTestId("public-link-password-display").should("not.exist");
        },
      );
    });

    it("creator can set, update, and remove a password on a question public link", () => {
      H.createQuestion(questionDetails).then(({ body: { id } }) => {
        H.visitQuestion(id);

        cy.log("Create a public link");
        H.openSharingMenu("Create a public link");

        cy.log("Toggle password on and set it");
        cy.findByTestId("public-link-password-toggle").click({ force: true });
        cy.findByTestId("public-link-password-input")
          .should("be.visible")
          .type(PASSWORD);

        cy.intercept("PUT", "/api/card/*/public_password").as("setPassword");
        cy.intercept("GET", "/api/card/*/public_password").as("getPassword");
        cy.findByTestId("public-link-password-save").click();
        cy.wait("@setPassword");
        cy.wait("@getPassword");

        cy.log("Password should be saved and displayed");
        cy.findByTestId("public-link-password-display").should("be.visible");

        cy.log("Edit the password");
        cy.findByTestId("public-link-password-edit").click();
        cy.findByTestId("public-link-password-input")
          .clear()
          .type(UPDATED_PASSWORD);

        cy.intercept("PUT", "/api/card/*/public_password").as("updatePassword");
        cy.intercept("GET", "/api/card/*/public_password").as(
          "getUpdatedPassword",
        );
        cy.findByTestId("public-link-password-confirm").click();
        cy.wait("@updatePassword");
        cy.wait("@getUpdatedPassword");

        cy.log("Password should still be displayed");
        cy.findByTestId("public-link-password-display").should("be.visible");

        cy.log("Remove the password by toggling off");
        cy.intercept("DELETE", "/api/card/*/public_password").as(
          "deletePassword",
        );
        cy.findByTestId("public-link-password-toggle").click({ force: true });
        cy.wait("@deletePassword");

        cy.log("Password section should be gone");
        cy.findByTestId("public-link-password-toggle").should("exist");
        cy.findByTestId("public-link-password-display").should("not.exist");
      });
    });

    it("creator: the password is masked and only fetched on an explicit reveal", () => {
      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { dashboard_id } }) => {
          cy.log("Create a public link and set a password via API");
          cy.request("POST", `/api/dashboard/${dashboard_id}/public_link`);
          cy.request("PUT", `/api/dashboard/${dashboard_id}/public_password`, {
            password: PASSWORD,
          });

          cy.intercept("POST", "/api/dashboard/*/public_password/reveal").as(
            "revealPassword",
          );

          H.visitDashboard(dashboard_id);
          H.openSharingMenu("Public link");

          cy.log("Password is masked and the secret is not fetched on open");
          cy.findByTestId("public-link-password-display")
            .should("be.visible")
            .and("not.have.value", PASSWORD);
          cy.get("@revealPassword.all").should("have.length", 0);

          cy.log("Clicking reveal fetches and shows the password");
          cy.findByTestId("public-link-password-reveal").click();
          cy.wait("@revealPassword");
          cy.findByTestId("public-link-password-display").should(
            "have.value",
            PASSWORD,
          );
        },
      );
    });
  },
);
