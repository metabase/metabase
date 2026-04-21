const { H } = cy;
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

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

const MB = 1024 * 1024;

describe("formatting > whitelabel", { tags: "@EE" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("smoke UI test", () => {
    cy.log("Should show all whitelabel options with the feature enabled");
    cy.visit("/admin/settings/whitelabel");

    cy.log("Upsell icon should not be present in the sidebar link");
    cy.findAllByTestId("settings-sidebar-link")
      .filter(":contains(Appearance)")
      .should("have.text", "Appearance")
      .and("not.have.descendants", ".Icon-gem");

    cy.log("Should show the upsell if the feature is missing");
    H.deleteToken();
    cy.visit("/admin/settings/appearance");
    cy.findByRole("heading", { name: "Make Metabase look like you" }).should(
      "be.visible",
    );
    cy.findByRole("link", { name: "Learn more" })
      .should("have.attr", "href")
      .and(
        "include",
        "https://www.metabase.com/docs/latest/configuring-metabase/appearance",
      )
      .and("include", "utm_");
    cy.findByRole("button", { name: "Try for free" });

    cy.log("Upsell icon should now be visible in the sidebar link");
    cy.findAllByTestId("settings-sidebar-link")
      .filter(":contains(Appearance)")
      .should("have.text", "Appearance")
      .and("have.descendants", ".Icon-gem");
  });

  describe("company name", () => {
    const NEW_COMPANY_NAME = "New Test Co";

    beforeEach(() => {
      cy.visit("/admin/settings/whitelabel/conceal-metabase");
      cy.findByLabelText("Application name")
        .clear()
        .type(NEW_COMPANY_NAME)
        .blur();
      H.undoToast().findByText("Changes saved").should("be.visible");
      cy.findByDisplayValue(NEW_COMPANY_NAME);
    });

    it("should not show the old name in the admin panel (metabase#17043)", () => {
      cy.visit("/admin/settings/general");
      cy.findByTestId("site-name-setting")
        .findByText(`The name used for this instance of ${NEW_COMPANY_NAME}.`)
        .should("be.visible");
    });

    it("should show the new name in the main app", () => {
      cy.visit("/");
      H.getProfileLink().click();
      H.popover().findByText("Help").click();
      H.getHelpSubmenu().findByText(`About ${NEW_COMPANY_NAME}`).click();
      H.modal()
        .findByText(`Thanks for using ${NEW_COMPANY_NAME}!`)
        .should("be.visible");
    });
  });

  describe("image uploads", () => {
    describe("company logo", () => {
      beforeEach(() => {
        cy.log("Add a logo");
        cy.readFile("e2e/support/assets/logo.jpeg", "base64").then(
          (logo_data) => {
            H.updateSetting(
              "application-logo-url",
              `data:image/jpeg;base64,${logo_data}`,
            );
          },
        );
      });

      it("changes should reflect on admin's dashboard", () => {
        cy.visit("/");
        checkLogo();
      });

      it("changes should reflect while signed out", () => {
        cy.signOut();
        cy.visit("/");
        checkLogo();
      });

      it("changes should reflect on user's dashboard", () => {
        cy.signInAsNormalUser();
        cy.visit("/");
        checkLogo();
      });
    });

    describe("favicon", () => {
      it("should work for people that set favicon URL before we change the input to file input", () => {
        const faviconUrl =
          "https://cdn.ecosia.org/assets/images/ico/favicon.ico";
        H.updateSetting("application-favicon-url", faviconUrl);
        checkFavicon(faviconUrl);
        cy.signInAsNormalUser();
        cy.visit("/");
        cy.get('head link[rel="icon"]')
          .get('[href="https://cdn.ecosia.org/assets/images/ico/favicon.ico"]')
          .should("have.length", 1);
      });

      it("should show up in user's HTML", () => {
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
      });
    });

    describe("custom illustrations", () => {
      describe("login page illustration", () => {
        it(
          "should only allow uploading a valid image files (PNG, JPG, SVG) and display on login page",
          { tags: "@smoke" },
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
                const backgroundImage = `url("data:image/jpeg;base64,${logo_data}")`;
                cy.signOut();
                cy.visit("/");
                cy.findByTestId("login-page-illustration").should(
                  "have.css",
                  "background-image",
                  backgroundImage,
                );

                cy.visit(
                  "/unsubscribe?hash=hash&email=email&pulse-id=pulse-id",
                );
                cy.findByTestId("unsubscribe-page-illustration").should(
                  "have.css",
                  "background-image",
                  backgroundImage,
                );
              },
            );

            cy.log("test no illustration");
            cy.signInAsAdmin();
            cy.visit("/admin/settings/whitelabel/conceal-metabase");

            cy.findByRole("textbox", {
              name: "Login and unsubscribe pages",
            }).click();
            H.selectDropdown().findByText("No illustration").click();

            cy.signOut();
            cy.visit("/");
            cy.findByTestId("login-page-illustration").should("not.exist");

            cy.visit("/unsubscribe?hash=hash&email=email&pulse-id=pulse-id");
            cy.findByTestId("unsubscribe-page-illustration").should(
              "not.exist",
            );
          },
        );
      });

      describe("landing page illustration", () => {
        it("should allow display the selected illustration on the landing page", () => {
          cy.visit("/admin/settings/whitelabel/conceal-metabase");

          cy.findByTestId("landing-page-illustration-setting")
            .findByDisplayValue("Lighthouse")
            .click();

          H.selectDropdown().findByText("Custom").click();
          cy.findByTestId("file-input").selectFile(
            {
              contents: "e2e/support/assets/logo.jpeg",
              mimeType: "image/jpeg",
            },
            { force: true },
          );
          cy.findByTestId("landing-page-illustration-setting")
            .findByText("logo.jpeg")
            .should("be.visible");

          H.undoToast().findByText("Changes saved").should("be.visible");

          cy.readFile("e2e/support/assets/logo.jpeg", "base64").then(
            (logo_data) => {
              const backgroundImage = `url("data:image/jpeg;base64,${logo_data}")`;
              cy.visit("/");
              cy.findByTestId("landing-page-illustration").should(
                "have.css",
                "background-image",
                backgroundImage,
              );
            },
          );

          cy.log("test no illustration");
          cy.visit("/admin/settings/whitelabel/conceal-metabase");

          cy.findByTestId("landing-page-illustration-setting")
            .findByDisplayValue("Custom")
            .click();
          H.selectDropdown().findByText("No illustration").click();

          cy.visit("/");
          cy.findByTestId("landing-page-illustration").should("not.exist");
        });
      });

      describe("no data illustration", () => {
        it("should allow display the selected illustration at relevant places", () => {
          cy.visit("/admin/settings/whitelabel/conceal-metabase");

          cy.findByRole("textbox", {
            name: "When calculations return no results",
          }).should("have.value", "Sailboat");

          cy.findByRole("textbox", {
            name: "When calculations return no results",
          }).click();
          H.selectDropdown().findByText("Custom").click();

          cy.findByTestId("no-data-illustration-setting").within(() => {
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

          H.createDashboardWithQuestions({
            dashboardName: "No results dashboard",
            questions: [
              {
                name: "No results question",
                native: {
                  query: "select * from products where id = 999999999",
                },
              },
            ],
          }).then(({ dashboard, questions }) => {
            cy.wrap(dashboard.id).as("dashboardId");
            cy.wrap(questions[0].id).as("questionId");
          });

          cy.log("test custom illustration");

          H.visitDashboard("@dashboardId");
          cy.readFile("e2e/support/assets/logo.jpeg", "base64").then(
            (logo_data) => {
              const imageDataUrl = `data:image/jpeg;base64,${logo_data}`;
              cy.wrap(imageDataUrl).as("imageDataUrl");
              cy.findByAltText("No results").should(
                "have.attr",
                "src",
                imageDataUrl,
              );
            },
          );

          H.visitQuestion("@questionId");
          cy.get("@imageDataUrl").then((imageDataUrl) => {
            cy.findByAltText("No results").should(
              "have.attr",
              "src",
              imageDataUrl,
            );
          });

          cy.log("test no illustration");

          cy.visit("/admin/settings/whitelabel/conceal-metabase");
          cy.findByRole("textbox", {
            name: "When calculations return no results",
          }).click();
          H.selectDropdown().findByText("No illustration").click();

          H.visitDashboard("@dashboardId");
          cy.findByAltText("No results").should("not.exist");

          H.visitQuestion("@questionId");
          cy.findByAltText("No results").should("not.exist");
        });
      });

      describe("no object illustration", () => {
        it("should allow display the selected illustration at relevant places", () => {
          const emptyCollectionName = "Empty Collection";
          cy.request("POST", "/api/collection", { name: emptyCollectionName });
          cy.visit("/admin/settings/whitelabel/conceal-metabase");

          cy.findByRole("textbox", {
            name: "When no objects can be found",
          }).should("have.value", "Sailboat");

          cy.findByRole("textbox", {
            name: "When no objects can be found",
          }).click();
          H.selectDropdown().findByText("Custom").click();

          cy.findByTestId("no-object-illustration-setting").within(() => {
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

          cy.log("test custom illustration");

          H.goToMainApp();
          H.appBar().findByText("New").click();
          H.popover().findByText("Dashboard").click();
          H.modal().findByTestId("collection-picker-button").click();
          H.entityPickerModal().within(() => {
            cy.readFile("e2e/support/assets/logo.jpeg", "base64").then(
              (logo_data) => {
                const imageDataUrl = `data:image/jpeg;base64,${logo_data}`;
                cy.wrap(imageDataUrl).as("imageDataUrl");
              },
            );

            cy.log("test search not found illustration");
            cy.findByPlaceholderText("Search…").type(
              "This aren't the objects you're looking for",
            );
            cy.get("@imageDataUrl").then((imageDataUrl) => {
              cy.findByAltText("No results").should(
                "have.attr",
                "src",
                imageDataUrl,
              );
            });
          });

          cy.log("test no illustration");

          cy.visit("/admin/settings/whitelabel/conceal-metabase");
          cy.findByRole("textbox", {
            name: "When no objects can be found",
          }).click();
          H.selectDropdown().findByText("No illustration").click();

          H.goToMainApp();
          H.appBar().findByText("New").click();
          H.popover().findByText("Dashboard").click();
          H.modal().findByTestId("collection-picker-button").click();
          H.entityPickerModal().within(() => {
            cy.findByText(emptyCollectionName).click();
            cy.findByAltText("No results").should("not.exist");

            cy.log("test search not found illustration");
            cy.findByPlaceholderText("Search…").type(
              "This aren't the objects you're looking for",
            );
            cy.findByAltText("No results").should("not.exist");
          });
        });
      });
    });
  });

  describe("loading message", () => {
    it("should update loading message", () => {
      cy.intercept("PUT", "/api/setting/loading-message").as(
        "putLoadingMessage",
      );
      const messages = [
        "Loading results...",
        "Doing science...",
        "Running query...",
      ];

      messages.forEach((message) => {
        changeLoadingMessage(message);
        // can't use visitQuestion helper because it waits for loading to be finished
        cy.visit(`/question/${ORDERS_QUESTION_ID}`);
        cy.findByTestId("query-builder-main").findByText(message);
      });
    });
  });

  describe("metabot", () => {
    it("should toggle metabot visibility", () => {
      cy.visit("/");
      cy.findAllByRole("img", { name: "Metabot" }).should("have.length", 2);

      cy.visit("/admin/settings/whitelabel/conceal-metabase");
      cy.findByRole("main")
        .findByText("Display welcome message on the homepage")
        .click();

      H.undoToast().findByText("Changes saved").should("be.visible");

      cy.visit("/");
      cy.findByRole("link", { name: /home/ }).should("exist");
      cy.findByRole("img", { name: "Metabot" }).should("not.exist");
    });
  });

  describe("font", () => {
    const font = "Open Sans";

    beforeEach(() => {
      cy.log("Change Application Font");
      cy.signInAsAdmin();
    });

    it("should apply correct font", () => {
      setApplicationFontTo(font);
      cy.signInAsNormalUser();
      cy.visit("/");
      cy.get("body").should("have.css", "font-family", `"${font}", sans-serif`);
    });

    it("should be able to make multiple font changes (metabase#45486)", () => {
      cy.intercept("PUT", "/api/setting/application-font").as("saveFont");
      const fonts = ["Lora", "Merriweather", "Montserrat", "Lato"];
      cy.visit("/admin/settings/whitelabel/branding");

      fonts.forEach((newFont) => {
        cy.findByLabelText("Font").click();
        H.selectDropdown().findByText(newFont).click();
        cy.wait("@saveFont");
        cy.get("body").should(
          "have.css",
          "font-family",
          `${newFont}, sans-serif`,
        );
      });
    });
  });

  describe("Help link", () => {
    beforeEach(() => {
      cy.intercept("PUT", "/api/setting/help-link").as("putHelpLink");
      cy.intercept("PUT", "/api/setting/help-link-custom-destination").as(
        "putHelpLinkUrl",
      );
    });

    it("should allow customising the help link", () => {
      cy.log("Hide Help link");

      cy.signInAsAdmin();
      cy.visit("/admin/settings/whitelabel/conceal-metabase");

      cy.findByLabelText("Link to Metabase help").should("be.checked");

      cy.findByTestId("help-link-setting").findByText("Hide it").click();
      cy.wait("@putHelpLink");

      cy.signInAsNormalUser();

      cy.visit("/");
      H.getProfileLink().click();
      H.popover().findByText("Help").click();
      helpLink().should("not.exist");

      cy.log("Set custom Help link");

      cy.signInAsAdmin();
      cy.visit("/admin/settings/whitelabel/conceal-metabase");

      cy.findByTestId("help-link-setting")
        .findByText("Go to a custom destination...")
        .click();

      getHelpLinkCustomDestinationInput()
        .should("have.focus")
        .clear()
        .type("https://example.org/custom-destination")
        .blur();

      cy.wait("@putHelpLinkUrl");

      cy.wait("@putHelpLink");

      cy.log("Check that on page load the text field is not focused");
      cy.reload();

      getHelpLinkCustomDestinationInput().should("not.have.focus");

      cy.signInAsNormalUser();
      cy.visit("/");
      H.getProfileLink().click();
      H.popover().findByText("Help").click();
      helpLink().should(
        "have.attr",
        "href",
        "https://example.org/custom-destination",
      );

      cy.log("Set default Help link");

      cy.signInAsAdmin();
      cy.visit("/admin/settings/whitelabel/conceal-metabase");

      cy.findByTestId("help-link-setting")
        .findByText("Link to Metabase help")
        .click();

      cy.wait("@putHelpLink");

      cy.visit("/");
      H.getProfileLink().click();
      H.popover().findByText("Help").click();

      helpLink()
        .should("have.attr", "href")
        .and("include", "https://www.metabase.com/help-premium?");

      cy.signInAsNormalUser();
      cy.visit("/");
      H.getProfileLink().click();
      H.popover().findByText("Help").click();

      helpLink()
        .should("have.attr", "href")
        .and("include", "https://www.metabase.com/help?");
    });

    it("should link to metabase help when the whitelabel feature is disabled (eg OSS)", () => {
      H.deleteToken();

      cy.signInAsNormalUser();
      cy.visit("/");
      H.getProfileLink().click();
      H.popover().findByText("Help").click();
      helpLink()
        .should("have.attr", "href")
        .and("include", "https://www.metabase.com/help?");
    });

    it("it should validate the url", () => {
      cy.signInAsAdmin();
      cy.visit("/admin/settings/whitelabel/conceal-metabase");

      cy.findByTestId("help-link-setting")
        .findByText("Go to a custom destination...")
        .click();

      getHelpLinkCustomDestinationInput()
        .clear()
        .type("ftp://something")
        .blur();
      H.main()
        .findByText(/This needs to be/i)
        .should("exist");

      getHelpLinkCustomDestinationInput().clear().type("https://").blur();

      H.main()
        .findByText("Please make sure this is a valid URL")
        .should("exist");

      getHelpLinkCustomDestinationInput().type("example").blur();

      H.main()
        .findByText("Please make sure this is a valid URL")
        .should("not.exist");
    });
  });

  describe("Landing Page (now moved to general tab metabase#38699)", () => {
    beforeEach(() => {
      cy.intercept("PUT", "/api/setting/landing-page").as("putLandingPage");
      cy.intercept("GET", "/api/setting").as("getSettings");
      cy.signInAsAdmin();
      cy.visit("/admin/settings/general");
    });

    it("should not render the widget when users does not have a valid license", () => {
      H.activateToken("starter");
      cy.reload();
      cy.findByLabelText("Landing page custom destination").should("not.exist");
    });

    it("should allow users to provide internal urls", () => {
      cy.findByLabelText("Landing page custom destination")
        .click()
        .clear()
        .type("/test-1")
        .blur();
      H.undoToast().findByText("Changes saved").should("be.visible");

      H.goToMainApp();
      cy.url().should("include", "/test-1");
    });

    it("should not allow users to provide external urls", () => {
      cy.findByLabelText("Landing page custom destination")
        .click()
        .clear()
        .type("/test-2")
        .blur();
      H.undoToast().findByText("Changes saved").should("be.visible");

      // set to valid value then test invalid value is not persisted
      cy.findByLabelText("Landing page custom destination")
        .click()
        .clear()
        .type("https://google.com")
        .blur();
      cy.findByTestId("admin-layout-content")
        .findByText("This field must be a relative URL.")
        .should("be.visible");

      H.goToMainApp();
      cy.url().should("include", "/test-2");
    });
  });
});

function changeLoadingMessage(message) {
  cy.visit("/admin/settings/whitelabel");
  cy.findByLabelText("Loading message").click();
  H.selectDropdown().findByText(message).click();
  cy.wait("@putLoadingMessage");
}

function setApplicationFontTo(font) {
  H.updateSetting("application-font", font);
}

const helpLink = () =>
  H.getHelpSubmenu().findByRole("menuitem", { name: "Get help" });

const getHelpLinkCustomDestinationInput = () =>
  cy.findByPlaceholderText("Enter a URL it should go to");
