const { H } = cy;

function checkFavicon(url) {
  cy.request("/api/setting/application-favicon-url")
    .its("body")
    .should("include", url);
}

function checkLogo() {
  cy.readFile("e2e/support/assets/logo.jpeg", "base64").then((logo_data) => {
    cy.get(`img[src="data:image/jpeg;base64,${logo_data}"]`).should("exist");
  });
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

  it("smoke UI test: should show the upsell without the whitelabel feature", () => {
    H.deleteToken();
    cy.visit("/admin/settings/appearance");
    cy.findByRole("heading", { name: "Make Metabase look like you" }).should(
      "be.visible",
    );
  });

  it("should show the application name in the main app (metabase#17043)", () => {
    const NEW_COMPANY_NAME = "New Test Co";
    H.updateSetting("application-name", NEW_COMPANY_NAME);

    cy.signInAsNormalUser();
    cy.visit("/");
    H.getProfileLink().click();
    H.popover().findByText("Help").click();
    H.getHelpSubmenu().findByText(`About ${NEW_COMPANY_NAME}`).click();
    H.modal()
      .findByText(`Thanks for using ${NEW_COMPANY_NAME}!`)
      .should("be.visible");
  });

  describe("image uploads", () => {
    describe("company logo", () => {
      it("should show the logo while signed out", () => {
        cy.readFile("e2e/support/assets/logo.jpeg", "base64").then(
          (logo_data) => {
            H.updateSetting(
              "application-logo-url",
              `data:image/jpeg;base64,${logo_data}`,
            );
          },
        );
        cy.signOut();
        cy.visit("/");
        checkLogo();
      });
    });

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

    describe("login page illustration", () => {
      it(
        "should reject a corrupted image, accept a valid one and display it on the login page",
        { tags: "@prerelease" },
        () => {
          cy.visit("/admin/settings/whitelabel/conceal-metabase");

          cy.findByTestId("login-page-illustration-setting")
            .findByRole("textbox", { name: "Login and unsubscribe pages" })
            .click();
          H.selectDropdown().findByText("Custom").click();

          cy.log("the browser can not decode a corrupted image");
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

          cy.log("the browser decodes a valid image");
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
            },
          );
        },
      );
    });
  });

  describe("font", () => {
    it("should be able to make multiple font changes (metabase#45486) and apply the correct font for other users", () => {
      cy.log("Reproduces metabase#45486");
      cy.intercept("PUT", "/api/setting/application-font").as("saveFont");
      const fontsWithExpectedFallback = [
        ["Lora", "serif"],
        ["Merriweather", "Lora, serif"],
        ["Montserrat", "sans-serif"],
        ["Lato", "Arial, sans-serif"],
      ];
      cy.visit("/admin/settings/whitelabel/branding");

      fontsWithExpectedFallback.forEach(([newFont, fallback]) => {
        cy.findByLabelText("Font").click();
        H.selectDropdown().findByText(newFont).click();
        cy.wait("@saveFont");
        cy.get("body").should(
          "have.css",
          "font-family",
          `${newFont}, ${fallback}`,
        );
      });

      cy.log("should apply correct font");
      H.updateSetting("application-font", "Open Sans");
      cy.signInAsNormalUser();
      cy.visit("/");
      cy.get("body").should(
        "have.css",
        "font-family",
        '"Open Sans", Lato, sans-serif',
      );
    });
  });

  describe("Help link", () => {
    it("should validate the custom URL on the server and link to metabase help when the whitelabel feature is disabled (eg OSS)", () => {
      cy.intercept("PUT", "/api/setting/help-link-custom-destination").as(
        "putHelpLinkUrl",
      );
      cy.visit("/admin/settings/whitelabel/conceal-metabase");
      cy.findByTestId("help-link-setting")
        .findByText("Go to a custom destination...")
        .click();

      getHelpLinkCustomDestinationInput().clear().type("https://").blur();
      cy.wait("@putHelpLinkUrl");
      cy.findByTestId("help-link-setting")
        .findByText("Please make sure this is a valid URL")
        .should("be.visible");

      getHelpLinkCustomDestinationInput().type("example").blur();
      cy.wait("@putHelpLinkUrl");
      cy.findByTestId("help-link-setting")
        .findByText("Please make sure this is a valid URL")
        .should("not.exist");

      cy.log(
        "should link to metabase help when the whitelabel feature is disabled (eg OSS)",
      );
      // Point the help link at the custom destination first, so only the
      // whitelabel feature gating can bring back the default Metabase help link
      H.updateSetting("help-link", "custom");
      H.deleteToken();

      cy.signInAsNormalUser();
      cy.visit("/");
      H.getProfileLink().click();
      H.popover().findByText("Help").click();
      H.getHelpSubmenu()
        .findByRole("menuitem", { name: "Get help" })
        .should("have.attr", "href")
        .and("include", "https://www.metabase.com/help?");
    });
  });

  describe("Landing Page (now moved to general tab metabase#38699)", () => {
    it("should go to the custom landing page from the main app", () => {
      H.updateSetting("landing-page", "/test-1");
      cy.visit("/admin/settings/general");
      H.goToMainApp();
      cy.url().should("include", "/test-1");
    });
  });
});

const getHelpLinkCustomDestinationInput = () =>
  cy
    .findByTestId("help-link-setting")
    .findByPlaceholderText("Enter a URL it should go to");
