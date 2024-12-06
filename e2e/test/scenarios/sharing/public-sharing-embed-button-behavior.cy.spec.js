import { H } from "e2e/support";

["dashboard", "question"].forEach(resource => {
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
          cy.get("@resourceId").then(id => {
            visitResource(resource, id);
          });

          H.openSharingMenu();
          H.sharingMenu()
            .findByRole("menuitem", { name: "Embed" })
            .should("be.visible")
            .and("be.enabled");
        });
      });

      describe("when user is non-admin", () => {
        it(`should not show embed button for ${resource}`, () => {
          cy.signInAsNormalUser();

          cy.get("@resourceId").then(id => {
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
            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            H.openSharingMenu("Embed");
            H.modal().findByText("Embed Metabase").should("be.visible");
          });

          it(`should let the user create a public link for ${resource}`, () => {
            cy.get("@resourceId").then(id => {
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

            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            H.openSharingMenu();
            H.sharingMenu().findByText(
              "Ask your admin to create a public link",
            );
          });

          it(`should show the public link button if the ${resource} has a public link`, () => {
            cy.get("@resourceId").then(id => {
              createPublicResourceLink(resource, id);
              visitResource(resource, id);
            });

            H.openSharingMenu(/public link/i);

            assertValidPublicLink({ resource, shouldHaveRemoveLink: true });

            cy.signInAsNormalUser();

            cy.get("@resourceId").then(id => {
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
            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });

            H.openSharingMenu();

            H.sharingMenu().within(() => {
              cy.findByText("Public links are off").should("be.visible");
              cy.findByText("Enable them in settings").should("be.visible");
            });

            cy.findByTestId("embed-menu-embed-modal-item").click();

            H.getEmbedModalSharingPane().within(() => {
              cy.findByText("Static embedding").should("be.visible");
              cy.findByText(/Use public embedding/).should("not.exist");
              cy.findByText("Public embeds and links are disabled.").should(
                "be.visible",
              );
            });
          });
        });

        describe("when user is non-admin", () => {
          it(`should show a disabled button for ${resource}`, () => {
            cy.signInAsNormalUser();

            cy.get("@resourceId").then(id => {
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

describe("embed modal display", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    createResource("dashboard").then(({ body: { id } }) => {
      cy.wrap(id).as("dashboardId");
    });
  });

  H.describeEE("when the user has a paid instance", () => {
    it("should display a disabled state and a link to the Interactive embedding settings", () => {
      H.setTokenFeatures("all");
      H.visitDashboard("@dashboardId");

      H.openSharingMenu("Embed");

      H.getEmbedModalSharingPane().within(() => {
        cy.findByText("Static embedding").should("be.visible");
        cy.findByText("Interactive embedding").should("be.visible");

        cy.findByRole("article", { name: "Interactive embedding" }).within(
          () => {
            cy.findByText("Disabled.").should("be.visible");
            cy.findByText("Enable in admin settings")
              .should("be.visible")
              .and(
                "have.attr",
                "href",
                "/admin/settings/embedding-in-other-applications/full-app",
              );
          },
        );
      });
    });
  });

  describe("when the user has an OSS instance", () => {
    it("should display a link to the product page for embedded analytics", () => {
      cy.signInAsAdmin();
      H.visitDashboard("@dashboardId");
      H.openSharingMenu("Embed");

      H.getEmbedModalSharingPane().within(() => {
        cy.findByText("Static embedding").should("be.visible");
        cy.findByText("Interactive embedding").should("be.visible");

        cy.findByRole("link", { name: "Interactive embedding" }).should(
          "have.attr",
          "href",
          "https://www.metabase.com/product/embedded-analytics?utm_source=product&utm_medium=upsell&utm_campaign=embedding-interactive&utm_content=static-embed-popover&source_plan=oss",
        );

        cy.findByRole("article", { name: "Interactive embedding" }).within(
          () => {
            cy.findByText("Learn more").should("be.visible");
            cy.findByText("Disabled.").should("not.exist");
            cy.findByText("Enable in admin settings").should("not.exist");
          },
        );
      });
    });
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
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("People").click();
    });
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

["dashboard", "question"].forEach(resource => {
  H.describeWithSnowplow(`public ${resource} sharing snowplow events`, () => {
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
          cy.get("@resourceId").then(id => {
            visitResource(resource, id);
          });

          H.openSharingMenu(/public link/i);
          cy.findByTestId("copy-button").realClick();
          if (resource === "dashboard") {
            H.expectGoodSnowplowEvent({
              event: "public_link_copied",
              artifact: "dashboard",
              format: null,
            });
          }

          if (resource === "question") {
            H.expectGoodSnowplowEvent({
              event: "public_link_copied",
              artifact: "question",
              format: "html",
            });

            H.popover().findByText("csv").click();
            cy.findByTestId("copy-button").realClick();
            H.expectGoodSnowplowEvent({
              event: "public_link_copied",
              artifact: "question",
              format: "csv",
            });

            H.popover().findByText("xlsx").click();
            cy.findByTestId("copy-button").realClick();
            H.expectGoodSnowplowEvent({
              event: "public_link_copied",
              artifact: "question",
              format: "xlsx",
            });

            H.popover().findByText("json").click();
            cy.findByTestId("copy-button").realClick();
            H.expectGoodSnowplowEvent({
              event: "public_link_copied",
              artifact: "question",
              format: "json",
            });
          }
        });

        it("should send `public_link_removed` when removing the public link", () => {
          cy.get("@resourceId").then(id => {
            visitResource(resource, id);
          });

          H.openSharingMenu(/public link/i);
          H.popover().button("Remove public link").click();
          H.expectGoodSnowplowEvent({
            event: "public_link_removed",
            artifact: resource,
            source: "public-share",
          });
        });
      });

      describe("when interacting with public embedding", () => {
        it("should send `public_embed_code_copied` event when copying the public embed iframe", () => {
          cy.get("@resourceId").then(id => {
            visitResource(resource, id);
          });

          H.openSharingMenu("Embed");

          H.modal().findByText("Get embedding code").click();

          // mock clipboardData so that copy-to-clipboard doesn't use window.prompt, pausing the tests
          cy.window().then(win => {
            win.clipboardData = {
              setData: (...args) =>
                // eslint-disable-next-line no-console
                console.log("clipboardData.setData", ...args),
            };
          });

          H.popover().findByTestId("copy-button").click();

          H.expectGoodSnowplowEvent({
            event: "public_embed_code_copied",
            artifact: resource,
            source: "public-embed",
          });
        });

        it("should send `public_link_removed` event when removing the public embed", () => {
          cy.get("@resourceId").then(id => {
            visitResource(resource, id);
          });

          H.openSharingMenu("Embed");
          H.modal().findByText("Get embedding code").click();

          H.popover().findByText("Remove public link").click();

          H.expectGoodSnowplowEvent({
            event: "public_link_removed",
            artifact: resource,
            source: "public-embed",
          });
        });
      });

      describe("when interacting with static embedding", () => {
        it("should send `static_embed_code_copied` when copying the static embed code", () => {
          cy.get("@resourceId").then(id => {
            visitResource(resource, id);
          });
          H.openStaticEmbeddingModal();

          cy.log("Assert copying codes in Overview tab");
          cy.findByTestId("embed-backend")
            .findByTestId("copy-button")
            .realClick();
          H.expectGoodSnowplowEvent({
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
          });

          cy.findByTestId("embed-frontend")
            .findByTestId("copy-button")
            .realClick();
          H.expectGoodSnowplowEvent({
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
          H.expectGoodSnowplowEvent({
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
          H.expectGoodSnowplowEvent({
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
            H.expectGoodSnowplowEvent({
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

        H.describeEE("Pro/EE instances", () => {
          beforeEach(() => {
            H.setTokenFeatures("all");
          });

          it("should send `static_embed_code_copied` when copying the static embed code", () => {
            cy.get("@resourceId").then(id => {
              visitResource(resource, id);
            });
            H.openStaticEmbeddingModal({ acceptTerms: false });

            cy.log("Assert copying codes in Overview tab");
            cy.findByTestId("embed-backend")
              .findByTestId("copy-button")
              .realClick();
            H.expectGoodSnowplowEvent({
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
                downloads: true,
              },
            });

            cy.findByTestId("embed-frontend")
              .findByTestId("copy-button")
              .realClick();
            H.expectGoodSnowplowEvent({
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
                downloads: true,
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
            H.expectGoodSnowplowEvent({
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
                downloads: true,
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
              "Assert that it sends `downloads: false` when downloads are disabled",
            );
            H.modal()
              .findByLabelText("Download buttons")
              .click({ force: true });

            cy.findByTestId("embed-backend")
              .findByTestId("copy-button")
              .realClick();
            H.expectGoodSnowplowEvent({
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
                downloads: false,
              },
            });
          });
        });

        it("should send `static_embed_discarded` when discarding changes in the static embed modal", () => {
          cy.get("@resourceId").then(id => {
            enableEmbeddingForResource({ resource, id });
            visitResource(resource, id);
          });

          cy.log("changing parameters, so we could discard changes");
          H.openStaticEmbeddingModal({ activeTab: "parameters" });
          H.modal().button("Price").click();
          H.popover().findByText("Editable").click();

          cy.findByTestId("embed-modal-content-status-bar").within(() => {
            cy.findByText("Discard changes").click();
          });

          H.expectGoodSnowplowEvent({
            event: "static_embed_discarded",
            artifact: resource,
          });
        });

        it("should send `static_embed_published` when publishing changes in the static embed modal", () => {
          cy.then(function () {
            this.timeAfterResourceCreation = Date.now();
          });
          cy.get("@resourceId").then(id => {
            visitResource(resource, id);
          });
          H.openStaticEmbeddingModal();

          cy.findByTestId("embed-modal-content-status-bar")
            .button("Publish")
            .click();

          cy.then(function () {
            H.expectGoodSnowplowEvent({
              event: "static_embed_published",
              artifact: resource,
              new_embed: true,
              time_since_creation: closeTo(
                toSecond(Date.now() - this.timeAfterResourceCreation),
                15,
              ),
              time_since_initial_publication: null,
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

            H.expectGoodSnowplowEvent({
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
          cy.get("@resourceId").then(id => {
            enableEmbeddingForResource({ resource, id });
            visitResource(resource, id);
          });
          H.openStaticEmbeddingModal();

          const HOUR = 60 * 60 * 1000;
          cy.clock(new Date(Date.now() + HOUR));
          cy.findByTestId("embed-modal-content-status-bar").within(() => {
            cy.findByText("Unpublish").click();
          });

          H.expectGoodSnowplowEvent({
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
    return cy.createNativeQuestion({
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

    return cy.createDashboard({
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

function enableEmbeddingForResource({ resource, id }) {
  const endpoint = resource === "question" ? "card" : "dashboard";
  cy.request("PUT", `/api/${endpoint}/${id}`, {
    enable_embedding: true,
  });
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
      .should(value => {
        expect(value).to.match(regex);
      });

    cy.findByText("Remove public link").should(
      shouldHaveRemoveLink ? "be.visible" : "not.exist",
    );
  });
}

function closeTo(value, offset) {
  return comparedValue => {
    return Math.abs(comparedValue - value) <= offset;
  };
}
