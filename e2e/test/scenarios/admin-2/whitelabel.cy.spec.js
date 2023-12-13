import {
  appBar,
  describeEE,
  main,
  popover,
  restore,
  setTokenFeatures,
} from "e2e/support/helpers";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

function checkFavicon() {
  cy.request("/api/setting/application-favicon-url")
    .its("body")
    .should("include", "https://cdn.ecosia.org/assets/images/ico/favicon.ico");
}

function checkLogo() {
  cy.readFile("e2e/support/assets/logo.jpeg", "base64").then(logo_data => {
    cy.get(`img[src="data:image/jpeg;base64,${logo_data}"]`);
  });
}

describeEE("formatting > whitelabel", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  describe("company name", () => {
    const COMPANY_NAME = "Test Co";

    beforeEach(() => {
      cy.log("Change company name");
      cy.visit("/admin/settings/whitelabel");
      cy.findByLabelText("Application Name").clear().type(COMPANY_NAME);
      // Helps scroll the page up in order to see "Saved" notification
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Application Name").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Saved");
      cy.findByDisplayValue(COMPANY_NAME);
      cy.log("Company name has been updated!");
    });

    it.skip("should not show the old name in the admin panel (metabase#17043)", () => {
      cy.reload();

      cy.findByDisplayValue(COMPANY_NAME);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(
        `These are the primary colors used in charts and throughout ${COMPANY_NAME}.`,
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(`The top nav bar of ${COMPANY_NAME}.`);

      cy.visit("/admin/settings/general");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(`The name used for this instance of ${COMPANY_NAME}.`);
    });
  });

  describe("company logo", () => {
    beforeEach(() => {
      cy.log("Add a logo");
      cy.readFile("e2e/support/assets/logo.jpeg", "base64").then(logo_data => {
        cy.request("PUT", "/api/setting/application-logo-url", {
          value: `data:image/jpeg;base64,${logo_data}`,
        });
      });
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
    beforeEach(() => {
      cy.visit("/admin/settings/whitelabel");

      cy.log("Add favicon");
      cy.findByLabelText("Favicon").type(
        "https://cdn.ecosia.org/assets/images/ico/favicon.ico",
      );
      cy.get("ul").eq(1).click("right");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Saved");
      checkFavicon();
    });
    it("should show up in user's HTML", () => {
      cy.signInAsNormalUser();
      cy.visit("/");
      cy.get('head link[rel="icon"]')
        .get('[href="https://cdn.ecosia.org/assets/images/ico/favicon.ico"]')
        .should("have.length", 1);
    });
  });

  describe("loading message", () => {
    it("should update loading message", () => {
      cy.visit("/question/" + ORDERS_QUESTION_ID);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Doing science...");

      const runningQueryMessage = "Running query...";
      changeLoadingMessage(runningQueryMessage);
      cy.visit("/question/" + ORDERS_QUESTION_ID);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(runningQueryMessage);

      const loadingResultsMessage = "Loading results...";
      changeLoadingMessage(loadingResultsMessage);
      cy.visit("/question/" + ORDERS_QUESTION_ID);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(loadingResultsMessage);
    });
  });

  describe("metabot", () => {
    it("should toggle metabot visibility", () => {
      cy.visit("/");
      cy.findByAltText("Metabot");

      cy.visit("/admin/settings/whitelabel");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Display welcome message on the homepage").click();

      cy.visit("/");
      cy.findByAltText("Metabot").should("not.exist");
    });
  });

  describe("font", () => {
    const font = "Open Sans";
    beforeEach(() => {
      cy.log("Change Application Font");
      cy.signInAsAdmin();
      setApplicationFontTo(font);
    });

    it("should apply correct font", () => {
      cy.signInAsNormalUser();
      cy.visit("/");
      cy.get("body").should("have.css", "font-family", `"${font}", sans-serif`);
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
      cy.visit("/admin/settings/whitelabel");

      cy.findByLabelText("Link to Metabase help").should("be.checked");

      cy.findByTestId("help-link-setting").findByText("Hide it").click();
      cy.wait("@putHelpLink");

      cy.signInAsNormalUser();

      cy.visit("/");
      openSettingsMenu();
      helpLink().should("not.exist");

      cy.log("Set custom Help link");

      cy.signInAsAdmin();
      cy.visit("/admin/settings/whitelabel");

      cy.findByTestId("help-link-setting")
        .findByText("Go to a custom destination...")
        .click();

      getHelpLinkCustomDestinationInput()
        .should("have.focus")
        .type("https://example.org/custom-destination")
        .blur();

      cy.wait("@putHelpLinkUrl");

      cy.wait("@putHelpLink");

      cy.log("Check that on page load the text field is not focused");
      cy.reload();

      getHelpLinkCustomDestinationInput().should("not.have.focus");

      cy.signInAsNormalUser();
      cy.visit("/");
      openSettingsMenu();
      helpLink().should(
        "have.attr",
        "href",
        "https://example.org/custom-destination",
      );

      cy.log("Set default Help link");

      cy.signInAsAdmin();
      cy.visit("/admin/settings/whitelabel");

      cy.findByTestId("help-link-setting")
        .findByText("Link to Metabase help")
        .click();

      cy.wait("@putHelpLink");

      cy.visit("/");
      openSettingsMenu();

      helpLink()
        .should("have.attr", "href")
        .and("include", "https://www.metabase.com/help-premium?");

      cy.signInAsNormalUser();
      cy.visit("/");
      openSettingsMenu();

      helpLink()
        .should("have.attr", "href")
        .and("include", "https://www.metabase.com/help?");
    });

    it("should link to metabase help when the whitelabel feature is disabled (eg OSS)", () => {
      setTokenFeatures("none");

      cy.signInAsNormalUser();
      cy.visit("/");
      openSettingsMenu();

      helpLink()
        .should("have.attr", "href")
        .and("include", "https://www.metabase.com/help?");
    });

    it("it should validate the url", () => {
      cy.signInAsAdmin();
      cy.visit("/admin/settings/whitelabel");

      cy.findByTestId("help-link-setting")
        .findByText("Go to a custom destination...")
        .click();

      getHelpLinkCustomDestinationInput()
        .clear()
        .type("ftp://something")
        .blur();
      main()
        .findByText(/This needs to be/i)
        .should("exist");

      getHelpLinkCustomDestinationInput().clear().type("https://").blur();

      main().findByText("Please make sure this is a valid URL").should("exist");

      getHelpLinkCustomDestinationInput().type("examp");

      main()
        .findByText("Please make sure this is a valid URL")
        .should("not.exist");
    });
  });
});

function changeLoadingMessage(message) {
  cy.visit("/admin/settings/whitelabel");
  cy.findByTestId("loading-message-select-button").click();
  cy.findByText(message).click();
}

function setApplicationFontTo(font) {
  cy.request("PUT", "/api/setting/application-font", {
    value: font,
  });
}

const openSettingsMenu = () => appBar().icon("gear").click();

const helpLink = () => popover().findByRole("link", { name: "Help" });

const getHelpLinkCustomDestinationInput = () =>
  cy.findByPlaceholderText("Enter a URL it should go to");
