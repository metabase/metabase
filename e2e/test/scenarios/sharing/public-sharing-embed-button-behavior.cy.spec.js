import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createPublicDashboardLink,
  createPublicQuestionLink,
  describeEE,
  getEmbedModalSharingPane,
  openEmbedModalFromMenu,
  openPublicLinkPopoverFromMenu,
  restore,
  setTokenFeatures,
  visitDashboard,
  visitQuestion,
} from "e2e/support/helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

["dashboard", "card"].forEach(resource => {
  describe(`embed modal behavior for ${resource}s`, () => {
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

          cy.findByTestId("dashboard-embed-button").click();
          cy.findByTestId("embed-header-menu").within(() => {
            cy.findByTestId("embed-menu-embed-modal-item").should(
              "be.disabled",
            );
            cy.findByText("Embedding is off").should("be.visible");
            cy.findByText("Enable it in settings").should("be.visible");
          });
        });
      });

      describe("when user is non-admin", () => {
        it(`should show disabled embed button and tooltip for ${resource}`, () => {
          cy.signInAsNormalUser();

          cy.get("@resourceId").then(id => {
            visitResource(resource, id);
          });

          expectDisabledButtonWithTooltipLabel(
            "Ask your admin to create a public link",
          );
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
              createPublicResourceLink(resource, id);
              visitResource(resource, id);
            });

            openPublicLinkPopoverFromMenu();

            cy.findByTestId("public-link-popover-content").within(() => {
              cy.findByText("Public link").should("be.visible");
              cy.findByTestId("public-link-input").should("be.visible");
              cy.findByText("Remove public link").should("be.visible");
            });
          });
        });

        describe("when user is non-admin", () => {
          it(`should show a disabled embed button if the ${resource} doesn't have a public link`, () => {
            cy.signInAsNormalUser();

            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            expectDisabledButtonWithTooltipLabel(
              "Ask your admin to create a public link",
            );
          });

          it(`should show the embed button if the ${resource} has a public link`, () => {
            cy.get("@resourceId").then(id => {
              createPublicResourceLink(resource, id);
              visitResource(resource, id);
            });

            openPublicLinkPopoverFromMenu();

            cy.findByTestId("public-link-popover-content").within(() => {
              cy.findByText("Public link").should("be.visible");
              cy.findByTestId("public-link-input").should("be.visible");
              cy.findByText("Remove public link").should("be.visible");
            });

            cy.signInAsNormalUser();

            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            cy.icon("share").click();

            cy.findByTestId("public-link-popover-content").within(() => {
              cy.findByText("Public link").should("be.visible");
              cy.findByTestId("public-link-input").should("be.visible");
              cy.findByText("Remove public link").should("not.exist");
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
          it(`should show a disabled menu item for public links for ${resource} and allow the user to access the embed modal`, () => {
            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            cy.icon("share").click();

            cy.findByTestId("embed-menu-public-link-item").within(() => {
              cy.findByText("Public links are off").should("be.visible");
              cy.findByText("Enable them in settings").should("be.visible");
            });

            cy.findByTestId("embed-menu-embed-modal-item").click();

            getEmbedModalSharingPane().within(() => {
              cy.findByText("Static embed").should("be.visible");
              cy.findByText("Public embed").should("be.visible");
            });
          });
        });
        describe("when user is non-admin", () => {
          it(`should show a disabled button for ${resource}`, () => {
            cy.signInAsNormalUser();

            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            expectDisabledButtonWithTooltipLabel("Public links are disabled");
          });
        });
      });
    });
  });
});

describe("embed modal display", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createResource("dashboard").then(({ body: { id } }) => {
      cy.wrap(id).as("dashboardId");
    });
  });

  describeEE("when the user has a paid instance", () => {
    it("should display a link to the interactive embedding settings", () => {
      setTokenFeatures("all");
      cy.get("@dashboardId").then(id => {
        visitResource("dashboard", id);
      });

      openEmbedModalFromMenu();

      getEmbedModalSharingPane().within(() => {
        cy.findByText("Static embed").should("be.visible");
        cy.findByText("Public embed").should("be.visible");
        cy.findByTestId("interactive-embedding-cta").within(() => {
          cy.findByText("Interactive Embedding").should("be.visible");
          cy.findByText(
            "Your plan allows you to use Interactive Embedding create interactive embedding experiences with drill-through and more.",
          ).should("be.visible");
          cy.findByText("Set it up").should("be.visible");
        });
        cy.findByTestId("interactive-embedding-cta").click();

        cy.url().should(
          "equal",
          Cypress.config().baseUrl +
            "/admin/settings/embedding-in-other-applications/full-app",
        );
      });
    });
  });

  describe("when the user has an OSS instance", () => {
    it("should display a link to the product page for embedded analytics", () => {
      cy.signInAsAdmin();
      cy.get("@dashboardId").then(id => {
        visitResource("dashboard", id);
      });
      openEmbedModalFromMenu();

      getEmbedModalSharingPane().within(() => {
        cy.findByText("Static embed").should("be.visible");
        cy.findByText("Public embed").should("be.visible");
        cy.findByTestId("interactive-embedding-cta").within(() => {
          cy.findByText("Interactive Embedding").should("be.visible");
          cy.findByText(
            "Give your customers the full power of Metabase in your own app, with SSO, advanced permissions, customization, and more.",
          ).should("be.visible");
          cy.findByText("Learn more").should("be.visible");
        });
        cy.findByTestId("interactive-embedding-cta").should(
          "have.attr",
          "href",
          "https://www.metabase.com/product/embedded-analytics?utm_source=oss&utm_media=static-embed-popover",
        );
      });
    });
  });
});

function expectDisabledButtonWithTooltipLabel(tooltipLabel) {
  cy.findByTestId("dashboard-embed-button").should("be.disabled");
  cy.findByTestId("dashboard-embed-button").realHover();
  cy.findByRole("tooltip").findByText(tooltipLabel).should("be.visible");
}

function createResource(resource) {
  if (resource === "card") {
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

function createPublicResourceLink(resource, id) {
  if (resource === "card") {
    return createPublicQuestionLink(id);
  }
  if (resource === "dashboard") {
    return createPublicDashboardLink(id);
  }
}

function visitResource(resource, id) {
  if (resource === "card") {
    visitQuestion(id);
  }

  if (resource === "dashboard") {
    visitDashboard(id);
  }
}
