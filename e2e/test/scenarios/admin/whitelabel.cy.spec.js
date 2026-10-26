const { H } = cy;

function checkFavicon(url) {
  cy.request("/api/setting/application-favicon-url")
    .its("body")
    .should("include", url);
}

function illustrationUrlPattern(settingKey) {
  return new RegExp(`api/session/illustration/${settingKey}\\?v=[0-9a-f]{16}`);
}

function checkIllustrationResponse({ url, imageBase64 }) {
  cy.request({ url, encoding: "base64" }).then((response) => {
    expect(response.headers["content-type"]).to.eq("image/jpeg");
    expect(response.body).to.eq(imageBase64);
  });
}

function checkBackgroundIllustration({ testId, settingKey, imageBase64 }) {
  cy.findByTestId(testId)
    .should("have.css", "background-image")
    .and("match", illustrationUrlPattern(settingKey))
    .then((backgroundImage) => {
      const url = String(backgroundImage).match(/url\("(.+)"\)/)[1];
      checkIllustrationResponse({ url, imageBase64 });
    });
}

const MB = 1024 * 1024;

describe("formatting > whitelabel", { tags: "@EE" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should show the upsell on the appearance route without the feature", () => {
    H.deleteToken();
    cy.visit("/admin/settings/appearance");

    cy.findByRole("heading", { name: "Make Metabase look like you" }).should(
      "be.visible",
    );
  });

  describe("image uploads", () => {
    describe("favicon", () => {
      it("should show up in user's HTML, including a favicon URL set before we changed the input to a file input", () => {
        cy.visit("/admin/settings/whitelabel");
        cy.log("Add favicon");

        cy.findByLabelText("Favicon").selectFile(
          {
            contents: "e2e/support/assets/favicon.ico",
            mimeType: "image/jpeg",
          },
          { force: true },
        );
        H.undoToast().findByText("Changes saved").should("be.visible");
        cy.readFile("e2e/support/assets/favicon.ico", "base64").then(
          (base64Url) => {
            const faviconUrl = `data:image/jpeg;base64,${base64Url}`;
            cy.wrap(faviconUrl).as("faviconUrl");
            checkFavicon(faviconUrl);
          },
        );
        cy.signInAsNormalUser();
        cy.visit("/");
        cy.get("@faviconUrl").then((faviconUrl) => {
          cy.get('head link[rel="icon"]')
            .get(`[href="${faviconUrl}"]`)
            .should("have.length", 1);
        });

        cy.log(
          "should work for people that set favicon URL before we change the input to file input",
        );
        const legacyFaviconUrl =
          "https://cdn.ecosia.org/assets/images/ico/favicon.ico";
        cy.signInAsAdmin();
        H.updateSetting("application-favicon-url", legacyFaviconUrl);
        checkFavicon(legacyFaviconUrl);
        cy.signInAsNormalUser();
        cy.visit("/");
        cy.get('head link[rel="icon"]')
          .get(`[href="${legacyFaviconUrl}"]`)
          .should("have.length", 1);
      });
    });

    describe("custom illustrations", () => {
      describe("login page illustration", () => {
        it(
          "should only allow uploading a valid image files (PNG, JPG, SVG) and display on login page",
          { tags: "@prerelease" },
          () => {
            /**
             * Unfortunately, we couldn't test the browser file selector with Cypress yet.
             * With `input.selectFile`, we still can select any files unlike the browser file selector
             * which would respect the `accept` attribute (which specifies the accepted MIME types).
             */
            cy.visit("/admin/settings/whitelabel/conceal-metabase");

            cy.log("test error message for file size > 2MB");
            cy.findByRole("textbox", {
              name: "Login and unsubscribe pages",
            }).click();
            H.selectDropdown().findByText("Custom").click();
            /**
             * Clicking "Choose File" doesn't actually open the file browser on Cypress,
             * so I need to use `selectFile` with the file input instead.
             */
            cy.findByTestId("login-page-illustration-setting").within(() => {
              cy.findByTestId("file-input").selectFile(
                {
                  contents: Cypress.Buffer.from("a".repeat(2 * MB + 1)),
                  fileName: "big-file.jpg",
                  mimeType: "image/jpeg",
                },
                { force: true },
              );
              cy.findByText(
                "The image you chose is larger than 2MB. Please choose another one.",
              ).should("be.visible");
              cy.findByText("big-file.jpg").should("not.exist");
            });
            cy.findByRole("textbox", {
              name: "Login and unsubscribe pages",
            }).click();
            H.selectDropdown().findByText("Custom").click();
            cy.log("test uploading a corrupted file");
            cy.findByTestId("login-page-illustration-setting").within(() => {
              cy.findByTestId("file-input").selectFile(
                {
                  contents: Cypress.Buffer.from("a".repeat(2 * MB)),
                  fileName: "corrupted-file.jpg",
                  mimeType: "image/jpeg",
                },
                { force: true },
              );
              cy.findByText(
                "The image you chose is corrupted. Please choose another one.",
              )
                .scrollIntoView()
                .should("be.visible");
              cy.findByText("corrupted-file.jpg").should("not.exist");
            });

            cy.log('test replacing the "corrupted" file with a valid one');
            cy.findByTestId("login-page-illustration-setting").within(() => {
              cy.findByTestId("file-input").selectFile(
                {
                  contents: "e2e/support/assets/logo.jpeg",
                  mimeType: "image/jpeg",
                },
                { force: true },
              );
              cy.findByText("logo.jpeg").should("be.visible");

              cy.findByText(
                "The image you chose is corrupted. Please choose another one.",
              ).should("not.exist");
            });
            H.undoToast().findByText("Changes saved").should("be.visible");
            H.undoToast().icon("close").click();

            cy.log("test removing the custom illustration");
            cy.findByTestId("login-page-illustration-setting").within(() => {
              cy.button("Remove custom illustration").click();
              cy.log(
                "the default option should be selected once removing the custom illustration",
              );
              cy.findByDisplayValue("Lighthouse").should("be.visible");
            });
            H.undoToast().findByText("Changes saved").should("be.visible");
            H.undoToast().icon("close").click();

            cy.log("test uploading a valid image file");
            cy.findByTestId("login-page-illustration-setting")
              .findByRole("textbox", { name: "Login and unsubscribe pages" })
              .click();
            H.selectDropdown().findByText("Custom").click();
            cy.findByTestId("login-page-illustration-setting").within(() => {
              cy.findByTestId("file-input").selectFile(
                {
                  contents: "e2e/support/assets/logo.jpeg",
                  mimeType: "image/jpeg",
                },
                { force: true },
              );
              cy.findByText("logo.jpeg").should("be.visible");
            });
            H.undoToast().findByText("Changes saved").should("be.visible");

            cy.readFile("e2e/support/assets/logo.jpeg", "base64").then(
              (logo_data) => {
                cy.signOut();
                cy.log("the login page loads the image from its URL");
                cy.visit("/");
                checkBackgroundIllustration({
                  testId: "login-page-illustration",
                  settingKey: "login-page-illustration-custom",
                  imageBase64: logo_data,
                });

                cy.log("the unsubscribe page loads the image from its URL");
                cy.visit(
                  "/unsubscribe?hash=hash&email=email&pulse-id=pulse-id",
                );
                checkBackgroundIllustration({
                  testId: "unsubscribe-page-illustration",
                  settingKey: "login-page-illustration-custom",
                  imageBase64: logo_data,
                });
              },
            );
          },
        );
      });
    });
  });

  describe("Landing Page (now moved to general tab metabase#38699)", () => {
    it("should send the user to the saved landing page", () => {
      cy.intercept("PUT", "/api/setting/landing-page").as("putLandingPage");
      cy.visit("/admin/settings/general");

      cy.findByTestId("homepage-setting")
        .findByRole("radio", { name: "Custom URL" })
        .click();

      cy.findByTestId("homepage-setting")
        .findByLabelText("Landing page custom destination")
        .click()
        .clear()
        .type("/test-1")
        .blur();
      cy.wait("@putLandingPage");
      H.undoToast().findByText("Changes saved").should("be.visible");

      H.goToMainApp();
      cy.url().should("include", "/test-1");
    });
  });
});
