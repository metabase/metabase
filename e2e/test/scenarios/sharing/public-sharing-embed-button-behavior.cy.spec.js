import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createPublicLinkDropdown,
  openPublicLinkDropdown,
  openToEmbedModal,
  restore,
  visitDashboard,
  visitQuestion,
} from "e2e/support/helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("embed modal behavior", () => {
  ["dashboard", "question"].forEach(resource => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      createResource(resource).then(({ body: { id } }) => {
        cy.wrap(id).as("resourceId");
      });
    });

    describe("when embedding is disabled", () => {
      beforeEach(() => {
        cy.request("PUT", "/api/setting/enable-embedding", { value: false });
      });

      describe("when user is admin", () => {
        it(`should disable the embed button for ${resource} and provide a tooltip`, () => {
          cy.get("@resourceId").then(id => {
            visitResource(resource, id);
          });

          cy.findByTestId("dashboard-embed-button").should("be.disabled");
          cy.findByTestId("dashboard-embed-button").click({ force: true });
          cy.findByRole("tooltip", {
            name: "You must enable Embedding in the settings",
          }).should("be.visible");
        });
      });

      describe("when user is non-admin", () => {
        it(`should not show the embed button for ${resource}`, () => {
          cy.signInAsNormalUser();

          cy.get("@resourceId").then(id => {
            visitResource(resource, id);
          });

          cy.findByTestId("dashboard-embed-button").should("not.exist");
        });
      });
    });

    describe("when embedding is enabled", () => {
      describe("when public sharing is enabled", () => {
        beforeEach(() => {
          cy.request("PUT", "/api/setting/enable-public-sharing", {
            value: true,
          });
          cy.request("PUT", "/api/setting/enable-embedding", { value: true });
        });

        describe("when user is admin", () => {
          it(`should show the embed menu for ${resource}`, () => {
            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            cy.icon("share").click();
            cy.findByTestId("embed-header-menu").should("be.visible");
          });

          it(`should let the user create a public link for ${resource}`, () => {
            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            createPublicLinkDropdown(resource);

            cy.findByTestId("public-link-popover-content").within(() => {
              cy.findByText("Public link").should("be.visible");
              cy.findByText(/^http/).should("be.visible");
              cy.findByText("Remove this public link").should("be.visible");
            });
          });
        });

        describe("when user is non-admin", () => {
          it(`should not show the embed button if the ${resource} doesn't have a public link`, () => {
            cy.signInAsNormalUser();

            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            cy.icon("share").should("not.exist");
          });

          it(`should show the embed button if the ${resource} has a public link`, () => {
            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            createPublicLinkDropdown(resource);

            cy.findByTestId("public-link-popover-content").within(() => {
              cy.findByText("Public link").should("be.visible");
              cy.findByText(/^http/).should("be.visible");
              cy.findByText("Remove this public link").should("be.visible");
            });

            cy.signInAsNormalUser();

            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            openPublicLinkDropdown({ isAdmin: false });

            cy.findByTestId("public-link-popover-content").within(() => {
              cy.findByText("Public link").should("be.visible");
              cy.findByText(/^http/).should("be.visible");
              cy.findByText("Remove this public link").should("not.exist");
            });
          });
        });
      });

      describe("when public sharing is disabled", () => {
        beforeEach(() => {
          cy.request("PUT", "/api/setting/enable-public-sharing", {
            value: false,
          });
          cy.request("PUT", "/api/setting/enable-embedding", { value: true });
        });

        describe("when user is admin", () => {
          it(`should show the embed modal for ${resource} immediately when embed button is clicked`, () => {
            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            openToEmbedModal({ isAdmin: true, isPublicSharingEnabled: false });

            cy.get(".Modal--full")
              .findByText("Embed in your application")
              .should("be.visible");
          });
        });
        describe("when user is non-admin", () => {
          it(`should not show the embed button for ${resource}`, () => {
            cy.signInAsNormalUser();

            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            cy.icon("share").should("not.exist");
          });
        });
      });
    });
  });
});

function createResource(resource) {
  if (resource === "question") {
    return cy.createQuestion({
      name: "Question",
      query: { "source-table": PRODUCTS_ID },
      limit: 1,
    });
  }

  if (resource === "dashboard") {
    return cy.createDashboard({ name: "Dashboard" });
  }
}

function visitResource(resource, id) {
  console.log(id);
  if (resource === "question") {
    visitQuestion(id);
  }

  if (resource === "dashboard") {
    visitDashboard(id);
  }
}
