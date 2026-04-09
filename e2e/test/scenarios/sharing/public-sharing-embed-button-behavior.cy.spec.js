import {
  embedModalContent,
  legacyStaticEmbeddingButton,
  openSharingMenu,
} from "e2e/support/helpers";

const { H } = cy;

["dashboard", "question"].forEach((resource) => {
  describe(`embed modal behavior for ${resource}s`, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      createResource(resource).then(({ body: { id } }) => {
        cy.wrap(id).as("resourceId");
      });
    });

    describe("when embedding is disabled", () => {
      beforeEach(() => {
        H.updateSetting("enable-embedding-static", false);
      });

      describe("when user is admin", () => {
        it(`should always show the embed button for ${resource}`, () => {
          cy.get("@resourceId").then((id) => {
            visitResource(resource, id);
          });

          H.openSharingMenu();
          H.sharingMenu()
            .findByRole("menuitem", { name: "Embed" })
            .should("be.visible")
            .and("be.enabled")
            .click();

          H.embedModalContent().should("be.visible");
        });
      });

      describe("when user is non-admin", () => {
        it(`should not show embed button for ${resource}`, () => {
          cy.signInAsNormalUser();

          cy.get("@resourceId").then((id) => {
            visitResource(resource, id);
          });

          H.openSharingMenu();
          H.sharingMenu().findByText(/embed/i).should("not.exist");
        });
      });
    });

    describe("when embedding is enabled", () => {
      describe("when public sharing is enabled", () => {
        beforeEach(() => {
          H.updateSetting("enable-public-sharing", true);
          H.updateSetting("enable-embedding-static", true);
        });

        describe("when user is admin", () => {
          it(`should show the embed menu for ${resource}`, () => {
            cy.get("@resourceId").then((id) => {
              visitResource(resource, id);
            });

            H.openSharingMenu("Embed");
            H.embedModalContent().should("be.visible");
          });

          it(`should let the user create a public link for ${resource}`, () => {
            cy.get("@resourceId").then((id) => {
              createPublicResourceLink(resource, id);
              visitResource(resource, id);
            });

            H.openSharingMenu(/public link/i);

            assertValidPublicLink({ resource, shouldHaveRemoveLink: true });
          });
        });

        describe("when user is non-admin", () => {
          it(`should show a disabled public link button if the ${resource} doesn't have a public link`, () => {
            cy.signInAsNormalUser();

            cy.get("@resourceId").then((id) => {
              visitResource(resource, id);
            });

            H.openSharingMenu();
            H.sharingMenu().findByText(
              "Ask your admin to create a public link",
            );
          });

          it(`should show the public link button if the ${resource} has a public link`, () => {
            cy.get("@resourceId").then((id) => {
              createPublicResourceLink(resource, id);
              visitResource(resource, id);
            });

            H.openSharingMenu(/public link/i);

            assertValidPublicLink({ resource, shouldHaveRemoveLink: true });

            cy.signInAsNormalUser();

            cy.get("@resourceId").then((id) => {
              visitResource(resource, id);
            });

            H.openSharingMenu("Public link");

            assertValidPublicLink({
              resource,
              shouldHaveRemoveLink: false,
            });
          });
        });
      });

      describe("when public sharing is disabled", () => {
        beforeEach(() => {
          H.updateSetting("enable-public-sharing", false);
          H.updateSetting("enable-embedding-static", true);
        });

        describe("when user is admin", () => {
          it(`should show a disabled menu item for public links for ${resource} and allow the user to access the embed modal`, () => {
            cy.get("@resourceId").then((id) => {
              visitResource(resource, id);
            });

            H.openSharingMenu();

            H.sharingMenu().within(() => {
              cy.findByText("Public link").should("be.visible");
              cy.findByText("Enable").should("be.visible");
            });

            cy.findByTestId("embed-menu-embed-modal-item").click();
          });
        });

        describe("when user is non-admin", () => {
          it(`should show a disabled button for ${resource}`, () => {
            cy.signInAsNormalUser();

            cy.get("@resourceId").then((id) => {
              visitResource(resource, id);
            });

            H.openSharingMenu();
            H.sharingMenu().findByText(
              "Ask your admin to create a public link",
            );
          });
        });
      });
    });
  });
});

describe("Embed JS modal display", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    createResource("dashboard").then(({ body: { id } }) => {
      cy.wrap(id).as("dashboardId");
    });
  });

  describe("when the user has a paid instance", () => {
    it("should open Embed JS modal with the `enable simple embedding` card", () => {
      H.activateToken("pro-self-hosted");
      H.visitDashboard("@dashboardId");

      H.openSharingMenu("Embed");

      cy.findByLabelText("Metabase account (SSO)").click();

      H.embedModalEnableEmbeddingCard().within(() => {
        cy.findByText(/modular embedding/).should("be.visible");
      });
    });
  });

  describe("when the user has an OSS instance", () => {
    it(
      "should display a link to the product page for embedded analytics",
      { tags: "@OSS" },
      () => {
        cy.signInAsAdmin();
        H.visitDashboard("@dashboardId");
        H.openSharingMenu("Embed");

        it("should open Embed JS modal with the `enable guest embedding` card", () => {
          H.activateToken("pro-self-hosted");
          H.updateSetting("enable-embedding-static", false);
          H.visitDashboard("@dashboardId");

          H.openSharingMenu("Embed");

          H.embedModalEnableEmbeddingCard().within(() => {
            cy.findByText(/guest embeds/).should("be.visible");
          });
        });
      },
    );
  });
});

describe("#39152 sharing an unsaved question", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.updateSetting("enable-public-sharing", true);
  });

  it("should ask the user to save the question before creating a public link", () => {
    H.startNewQuestion();
    H.miniPickerBrowseAll().click();
    H.pickEntity({ path: ["Databases", "Sample Database", "People"] });
    H.visualize();

    H.openSharingMenu();

    H.modal().within(() => {
      cy.findByText("First, save your question").should("be.visible");
      cy.findByText("Save").click();
    });

    H.openSharingMenu("Create a public link");

    assertValidPublicLink({ resource: "question", shouldHaveRemoveLink: true });
  });
});

[
  {
    resource: "dashboard",
    apiPath: "dashboard",
  },
  {
    resource: "question",
    apiPath: "card",
  },
].forEach(({ resource, apiPath }) => {
  describe(`legacy static modal behavior for ${resource}`, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.enableTracking();

      createResource(resource).then(({ body }) => {
        cy.wrap(body.id).as("resourceId");
      });
    });

    [
      { embeddingType: "guest-embed", shouldShowAlert: false },
      { embeddingType: "static-legacy", shouldShowAlert: true },
      { embeddingType: null, shouldShowAlert: true },
    ].forEach(({ embeddingType, shouldShowAlert }) => {
      it(`should ${shouldShowAlert ? "show" : "not show"} legacy alert for ${embeddingType} embedding type`, () => {
        cy.get("@resourceId").then((id) => {
          visitResource(resource, id);

          const apiPath = resource === "question" ? "card" : "dashboard";

          cy.request("PUT", `/api/${apiPath}/${id}`, {
            enable_embedding: true,
            embedding_type: embeddingType,
          });

          openSharingMenu("Embed");

          embedModalContent().should("exist");

          legacyStaticEmbeddingButton().should(
            shouldShowAlert ? "exist" : "not.exist",
          );
        });
      });
    });

    it("should set a proper embedding_type", () => {
      cy.get("@resourceId").then((id) => {
        visitResource(resource, id);

        H.openLegacyStaticEmbeddingModal({
          resource,
          resourceId: id,
          activeTab: "parameters",
        });
      });

      H.publishChanges(apiPath, ({ request, response }) => {
        assert.deepEqual(request.body.embedding_type, "static-legacy");
        assert.deepEqual(response.body.embedding_type, "static-legacy");
      });

      H.modal().button("Price").click();
      H.popover().findByText("Editable").click();

      H.publishChanges(apiPath, ({ request, response }) => {
        assert.deepEqual(request.body.embedding_type, "static-legacy");
        assert.deepEqual(response.body.embedding_type, "static-legacy");
      });

      H.unpublishChanges(apiPath, ({ request, response }) => {
        assert.deepEqual(request.body.embedding_type, null);
        assert.deepEqual(response.body.embedding_type, null);
      });
    });
  });

  describe(`public ${resource} sharing snowplow events`, () => {
    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.enableTracking();

      createResource(resource).then(({ body }) => {
        cy.wrap(body).as("resource");
        cy.wrap(body.id).as("resourceId");
      });
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    describe(`when embedding ${resource}`, () => {
      describe("when interacting with public link popover", () => {
        it("should send `public_link_copied` event when copying public link", () => {
          cy.get("@resourceId").then((id) => {
            visitResource(resource, id);
          });

          H.openSharingMenu(/public link/i);
          cy.findByTestId("copy-button").realClick();
          if (resource === "dashboard") {
            H.expectUnstructuredSnowplowEvent({
              event: "public_link_copied",
              artifact: "dashboard",
              format: null,
            });
          }

          if (resource === "question") {
            H.expectUnstructuredSnowplowEvent({
              event: "public_link_copied",
              artifact: "question",
              format: "html",
            });

            H.popover().findByText("csv").click();
            cy.findByTestId("copy-button").realClick();
            H.expectUnstructuredSnowplowEvent({
              event: "public_link_copied",
              artifact: "question",
              format: "csv",
            });

            H.popover().findByText("xlsx").click();
            cy.findByTestId("copy-button").realClick();
            H.expectUnstructuredSnowplowEvent({
              event: "public_link_copied",
              artifact: "question",
              format: "xlsx",
            });

            H.popover().findByText("json").click();
            cy.findByTestId("copy-button").realClick();
            H.expectUnstructuredSnowplowEvent({
              event: "public_link_copied",
              artifact: "question",
              format: "json",
            });
          }
        });

        it("should send `public_link_removed` when removing the public link", () => {
          cy.get("@resourceId").then((id) => {
            visitResource(resource, id);
          });

          H.openSharingMenu(/public link/i);
          H.popover().button("Remove public link").click();
          H.expectUnstructuredSnowplowEvent({
            event: "public_link_removed",
            artifact: resource,
            source: "public-share",
          });
        });
      });

      describe("when interacting with public embedding", () => {
        it("should send `public_embed_code_copied` event when copying the public embed iframe", () => {
          cy.get("@resourceId").then((id) => {
            visitResource(resource, id);
          });

          H.openSharingMenu("Create a public link");

          // mock clipboardData so that copy-to-clipboard doesn't use window.prompt, pausing the tests
          cy.window().then((win) => {
            win.clipboardData = {
              setData: (...args) =>
                // eslint-disable-next-line no-console
                console.log("clipboardData.setData", ...args),
            };
          });

          H.popover().findByTestId("copy-button").click();

          H.expectUnstructuredSnowplowEvent({
            event: "public_link_copied",
            artifact: resource,
          });
        });

        it("should send `public_link_removed` event when removing the public embed", () => {
          cy.get("@resourceId").then((id) => {
            visitResource(resource, id);
          });

          H.openSharingMenu("Create a public link");

          H.popover().findByText("Remove public link").click();

          H.expectUnstructuredSnowplowEvent({
            event: "public_link_removed",
            artifact: resource,
            source: "public-share",
          });
        });
      });

      describe("when interacting with static embedding", () => {
        it("should send `static_embed_code_copied` when copying the static embed code", () => {
          cy.get("@resourceId").then((id) => {
            visitResource(resource, id);

            H.openLegacyStaticEmbeddingModal({ resource, resourceId: id });
          });

          cy.log("Assert copying codes in Overview tab");
          cy.findByTestId("embed-backend")
            .findByTestId("copy-button")
            .realClick();

          // TODO: fix this test, it's flaky on CI
          /*H.expectUnstructuredSnowplowEvent({
            event: "static_embed_code_copied",
            artifact: resource,
            language: "node",
            location: "code_overview",
            code: "backend",
            appearance: {
              background: true,
              bordered: true,
              titled: true,
              font: "instance",
              theme: "light",
              downloads: null,
            },
          });*/

          cy.findByTestId("embed-frontend")
            .findByTestId("copy-button")
            .realClick();
          H.expectUnstructuredSnowplowEvent({
            event: "static_embed_code_copied",
            artifact: resource,
            language: "pug",
            location: "code_overview",
            code: "view",
            appearance: {
              background: true,
              bordered: true,
              titled: true,
              font: "instance",
              theme: "light",
              downloads: null,
            },
          });

          cy.log("Assert copying code in Parameters tab");
          H.modal().within(() => {
            cy.findByRole("tab", { name: "Parameters" }).click();

            cy.findByText("Node.js").click();
          });
          H.popover().findByText("Ruby").click();
          cy.findByTestId("embed-backend")
            .findByTestId("copy-button")
            .realClick();
          H.expectUnstructuredSnowplowEvent({
            event: "static_embed_code_copied",
            artifact: resource,
            language: "ruby",
            location: "code_params",
            code: "backend",
            appearance: {
              background: true,
              bordered: true,
              titled: true,
              font: "instance",
              theme: "light",
              downloads: null,
            },
          });

          cy.log("Assert copying code in Appearance tab");
          H.modal().within(() => {
            cy.findByRole("tab", { name: "Look and Feel" }).click();

            cy.findByText("Ruby").click();
          });

          H.popover().findByText("Python").click();

          H.modal().within(() => {
            cy.findByLabelText("Dark").click({ force: true });
            if (resource === "dashboard") {
              cy.findByLabelText("Dashboard title").click({ force: true });
              cy.findByLabelText("Dashboard border").click({ force: true });
            }
            if (resource === "question") {
              cy.findByLabelText("Question title").click({ force: true });
              cy.findByLabelText("Question border").click({ force: true });
            }
          });

          cy.findByTestId("embed-backend")
            .findByTestId("copy-button")
            .realClick();
          H.expectUnstructuredSnowplowEvent({
            event: "static_embed_code_copied",
            artifact: resource,
            language: "python",
            location: "code_appearance",
            code: "backend",
            appearance: {
              background: true,
              bordered: false,
              titled: false,
              font: "instance",
              theme: "night",
              downloads: null,
            },
          });

          // Question don't have an option to disable background (metabase#43838)
          if (resource === "dashboard") {
            cy.findByLabelText("Dashboard background").click({ force: true });

            cy.findByTestId("embed-backend")
              .findByTestId("copy-button")
              .realClick();
            H.expectUnstructuredSnowplowEvent({
              event: "static_embed_code_copied",
              artifact: resource,
              language: "python",
              location: "code_appearance",
              code: "backend",
              appearance: {
                background: false,
                bordered: false,
                titled: false,
                font: "instance",
                theme: "night",
                downloads: null,
              },
            });
          }
        });

        describe("Pro/EE instances", () => {
          beforeEach(() => {
            H.activateToken("pro-self-hosted");
          });

          it("should send `static_embed_code_copied` when copying the static embed code", () => {
            cy.get("@resourceId").then((id) => {
              visitResource(resource, id);

              H.openLegacyStaticEmbeddingModal({
                resource,
                resourceId: id,
              });
            });

            cy.log("Assert copying codes in Overview tab");
            cy.findByTestId("embed-backend")
              .findByTestId("copy-button")
              .realClick();

            // TODO: fix this test, it's flaky on CI
            /*H.expectUnstructuredSnowplowEvent({
              event: "static_embed_code_copied",
              artifact: resource,
              language: "node",
              location: "code_overview",
              code: "backend",
              appearance: {
                background: true,
                bordered: true,
                titled: true,
                font: "instance",
                theme: "light",
                enabled_download_types: { pdf: true, results: true },
              },
            });*/

            cy.findByTestId("embed-frontend")
              .findByTestId("copy-button")
              .realClick();
            H.expectUnstructuredSnowplowEvent({
              event: "static_embed_code_copied",
              artifact: resource,
              language: "pug",
              location: "code_overview",
              code: "view",
              appearance: {
                background: true,
                bordered: true,
                titled: true,
                font: "instance",
                theme: "light",
                enabled_download_types: { pdf: true, results: true },
              },
            });

            cy.log("Assert copying code in Parameters tab");
            H.modal().within(() => {
              cy.findByRole("tab", { name: "Parameters" }).click();

              cy.findByText("Node.js").click();
            });
            H.popover().findByText("Ruby").click();
            cy.findByTestId("embed-backend")
              .findByTestId("copy-button")
              .realClick();
            H.expectUnstructuredSnowplowEvent({
              event: "static_embed_code_copied",
              artifact: resource,
              language: "ruby",
              location: "code_params",
              code: "backend",
              appearance: {
                background: true,
                bordered: true,
                titled: true,
                font: "instance",
                theme: "light",
                enabled_download_types: { pdf: true, results: true },
              },
            });

            cy.log("Assert copying code in Appearance tab");
            H.modal().within(() => {
              cy.findByRole("tab", { name: "Look and Feel" }).click();

              cy.findByText("Ruby").click();
            });

            H.popover().findByText("Python").click();

            H.modal().within(() => {
              cy.findByLabelText("Dark").click({ force: true });
              if (resource === "dashboard") {
                cy.findByLabelText("Dashboard title").click({ force: true });
                cy.findByLabelText("Dashboard border").click({ force: true });
              }
              if (resource === "question") {
                cy.findByLabelText("Question title").click({ force: true });
                cy.findByLabelText("Question border").click({ force: true });
              }
              cy.findByLabelText("Font").click();
            });

            H.popover().findByText("Oswald").click();

            cy.log(
              "Assert that it sends `enabled_download_types: { pdf: false, results: false }` when both are disabled",
            );
            H.modal()
              .findByLabelText(
                resource === "dashboard"
                  ? "Results (csv, xlsx, json, png)"
                  : "Download (csv, xlsx, json, png)",
              )
              .click({ force: true });

            // We have to also disable PDF exports for both to be disabled
            if (resource === "dashboard") {
              cy.findByLabelText("Export to PDF").click({ force: true });
            }

            cy.findByTestId("embed-backend")
              .findByTestId("copy-button")
              .realClick();
            H.expectUnstructuredSnowplowEvent({
              event: "static_embed_code_copied",
              artifact: resource,
              language: "python",
              location: "code_appearance",
              code: "backend",
              appearance: {
                background: true,
                bordered: false,
                titled: false,
                font: "custom",
                theme: "night",
                enabled_download_types: { pdf: false, results: false },
              },
            });
          });

          // Individual download options are only supported for dashboards
          if (resource === "dashboard") {
            it("should support disabling PDF and result downloads individually in `static_embed_code_copied`", () => {
              cy.get("@resourceId").then((id) => {
                visitResource(resource, id);

                H.openLegacyStaticEmbeddingModal({
                  resource: "dashboard",
                  resourceId: id,
                });
              });

              H.modal().within(() => {
                cy.findByRole("tab", { name: "Look and Feel" }).click();
              });

              cy.log(
                "Assert that it sends `enabled_download_types: { pdf: false, results: true }` when only results download is enabled",
              );

              // Disable PDF exports
              cy.findByLabelText("Export to PDF").click({ force: true });

              cy.findByTestId("embed-backend")
                .findByTestId("copy-button")
                .realClick();

              H.expectUnstructuredSnowplowEvent({
                event: "static_embed_code_copied",
                artifact: resource,
                language: "node",
                location: "code_appearance",
                code: "backend",
                appearance: {
                  background: true,
                  bordered: true,
                  titled: true,
                  font: "instance",
                  theme: "light",
                  enabled_download_types: { pdf: false, results: true },
                },
              });

              cy.log(
                "Assert that it sends `enabled_download_types: { pdf: true, results: false }` when only PDF is enabled",
              );

              // Enable PDF exports again
              cy.findByLabelText("Export to PDF").click({ force: true });

              // Disable results download
              cy.findByLabelText(
                resource === "dashboard"
                  ? "Results (csv, xlsx, json, png)"
                  : "Download (csv, xlsx, json, png)",
              ).click({ force: true });

              cy.findByTestId("embed-backend")
                .findByTestId("copy-button")
                .realClick();

              H.expectUnstructuredSnowplowEvent({
                event: "static_embed_code_copied",
                artifact: resource,
                language: "node",
                location: "code_appearance",
                code: "backend",
                appearance: {
                  background: true,
                  bordered: true,
                  titled: true,
                  font: "instance",
                  theme: "light",
                  enabled_download_types: { pdf: true, results: false },
                },
              });
            });
          }
        });

        it("should send `static_embed_discarded` when discarding changes in the static embed modal", () => {
          cy.get("@resourceId").then((id) => {
            visitResource(resource, id);

            H.openLegacyStaticEmbeddingModal({
              resource,
              resourceId: id,
              activeTab: "parameters",
            });

            H.publishChanges(apiPath);
          });

          cy.log("changing parameters, so we could discard changes");
          H.modal().button("Price").click();
          H.popover().findByText("Editable").click();

          cy.findByTestId("embed-modal-content-status-bar").within(() => {
            cy.findByText("Discard changes").click();
          });

          H.expectUnstructuredSnowplowEvent({
            event: "static_embed_discarded",
            artifact: resource,
          });
        });

        it("should send `static_embed_published` when publishing changes in the static embed modal", () => {
          cy.then(function () {
            this.timeAfterResourceCreation = Date.now();
          });
          cy.get("@resourceId").then((id) => {
            visitResource(resource, id);

            H.openLegacyStaticEmbeddingModal({ resource, resourceId: id });
          });

          cy.findByTestId("embed-modal-content-status-bar")
            .button("Publish")
            .click();

          cy.then(function () {
            H.expectUnstructuredSnowplowEvent({
              event: "static_embed_published",
              artifact: resource,
              new_embed: false,
              time_since_creation: closeTo(
                toSecond(Date.now() - this.timeAfterResourceCreation),
                15,
              ),
              time_since_initial_publication: closeTo(
                toSecond(Date.now() - this.timeAfterResourceCreation),
                15,
              ),
              params: {
                disabled: 3,
                locked: 0,
                enabled: 0,
              },
            });
          });

          cy.log("Assert `time_since_initial_publication` and `params`");
          cy.findByTestId("embed-modal-content-status-bar")
            .button("Unpublish")
            .click();

          H.modal().findByRole("tab", { name: "Parameters" }).click();
          H.modal().button("Price").click();
          H.popover().findByText("Editable").click();

          H.modal().button("Category").click();
          H.popover().findByText("Locked").click();

          cy.then(function () {
            const HOUR = 60 * 60 * 1000;
            const timeAfterPublication = Date.now() + HOUR;
            cy.log("Mocks the clock to 1 hour later");
            cy.clock(new Date(timeAfterPublication));
            cy.findByTestId("embed-modal-content-status-bar")
              .button("Publish")
              .click();

            H.expectUnstructuredSnowplowEvent({
              event: "static_embed_published",
              artifact: resource,
              new_embed: false,
              time_since_creation: closeTo(toSecond(HOUR), 15),
              time_since_initial_publication: closeTo(toSecond(HOUR), 15),
              params: {
                disabled: 1,
                locked: 1,
                enabled: 1,
              },
            });
          });
        });

        it("should send `static_embed_unpublished` when unpublishing changes in the static embed modal", () => {
          cy.get("@resourceId").then((id) => {
            visitResource(resource, id);

            H.openLegacyStaticEmbeddingModal({ resource, resourceId: id });

            H.publishChanges(apiPath);
          });

          const HOUR = 60 * 60 * 1000;
          cy.clock(new Date(Date.now() + HOUR));
          cy.findByTestId("embed-modal-content-status-bar").within(() => {
            cy.findByText("Unpublish").click();
          });

          H.expectUnstructuredSnowplowEvent({
            event: "static_embed_unpublished",
            artifact: resource,
            time_since_creation: closeTo(toSecond(HOUR), 10),
            time_since_initial_publication: closeTo(toSecond(HOUR), 10),
          });
        });
      });
    });
  });
});

function toSecond(milliseconds) {
  return Math.round(milliseconds / 1000);
}

function createResource(resource) {
  if (resource === "question") {
    return H.createNativeQuestion({
      name: "Question",
      native: {
        query: `
          SELECT *
          FROM PRODUCTS
          WHERE true
            [[AND created_at > {{created_at}}]]
            [[AND price > {{price}}]]
            [[AND category = {{category}}]]`,
        "template-tags": {
          date: {
            type: "date",
            name: "created_at",
            id: "b2517f32-d2e2-4f42-ab79-c91e07e820a0",
            "display-name": "Created At",
          },
          price: {
            type: "number",
            name: "price",
            id: "879d1597-e673-414c-a96f-ff5887359834",
            "display-name": "Price",
          },
          category: {
            type: "text",
            name: "category",
            id: "1f741a9a-a95e-4ac6-b584-5101e7cf77e1",
            "display-name": "Category",
          },
        },
      },
      limit: 10,
    });
  }

  if (resource === "dashboard") {
    const dateFilter = {
      id: "1",
      name: "Created At",
      slug: "created_at",
      type: "date/month-year",
    };

    const numberFilter = {
      id: "2",
      name: "Price",
      slug: "price",
      type: "number/=",
    };

    const textFilter = {
      id: "3",
      name: "Category",
      slug: "category",
      type: "string/contains",
    };

    return H.createDashboard({
      name: "Dashboard",
      parameters: [dateFilter, numberFilter, textFilter],
    });
  }
}

function createPublicResourceLink(resource, id) {
  if (resource === "question") {
    return H.createPublicQuestionLink(id);
  }
  if (resource === "dashboard") {
    return H.createPublicDashboardLink(id);
  }
}

function visitResource(resource, id) {
  if (resource === "question") {
    H.visitQuestion(id);
  }

  if (resource === "dashboard") {
    H.visitDashboard(id);
  }
}

function assertValidPublicLink({ resource, shouldHaveRemoveLink }) {
  const regex = new RegExp(
    `https?:\\/\\/[^\\/]+\\/public\\/${resource}\\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(\\.csv|\\.json|\\.xlsx)?`,
  );

  cy.findByTestId("public-link-popover-content").within(() => {
    cy.findByText("Public link").should("be.visible");

    cy.findByTestId("public-link-input")
      .should("be.visible")
      .invoke("val")
      .should((value) => {
        expect(value).to.match(regex);
      });

    cy.findByText("Remove public link").should(
      shouldHaveRemoveLink ? "be.visible" : "not.exist",
    );
  });
}

function closeTo(value, offset) {
  return (comparedValue) => {
    return Math.abs(comparedValue - value) <= offset;
  };
}
