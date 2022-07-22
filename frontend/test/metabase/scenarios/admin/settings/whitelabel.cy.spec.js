import { describeEE, restore } from "__support__/e2e/helpers";

function checkFavicon() {
  cy.request("/api/setting/application-favicon-url")
    .its("body")
    .should("include", "https://cdn.ecosia.org/assets/images/ico/favicon.ico");
}

function checkLogo() {
  cy.readFile("frontend/test/__support__/e2e/assets/logo.jpeg", "base64").then(
    logo_data => {
      cy.get(`img[src="data:image/jpeg;base64,${logo_data}"]`);
    },
  );
}

describeEE("formatting > whitelabel", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("company name", () => {
    const COMPANY_NAME = "Test Co";

    beforeEach(() => {
      cy.log("Change company name");
      cy.visit("/admin/settings/whitelabel");
      cy.findByLabelText("Application Name").clear().type(COMPANY_NAME);
      // Helps scroll the page up in order to see "Saved" notification
      cy.findByText("Application Name").click();
      cy.findByText("Saved");
      cy.findByDisplayValue(COMPANY_NAME);
      cy.log("Company name has been updated!");
    });

    it("changes should reflect in different parts of UI", () => {
      cy.log("New company should show up on activity page");
      cy.visit("/activity");
      cy.findByText(`${COMPANY_NAME} is up and running.`);
      cy.findByText("Metabase is up and running.").should("not.exist");

      cy.log("New company should show up when logged out");
      cy.signOut();
      cy.visit("/");
      cy.findByText(`Sign in to ${COMPANY_NAME}`);

      cy.log("New company should show up for a normal user");
      cy.signInAsNormalUser();
      cy.visit("/activity");
      cy.findByText(`${COMPANY_NAME} is up and running.`);
      cy.findByText("Metabase is up and running.").should("not.exist");
    });

    it.skip("should not show the old name in the admin panel (metabase#17043)", () => {
      cy.reload();

      cy.findByDisplayValue(COMPANY_NAME);
      cy.contains(
        `These are the primary colors used in charts and throughout ${COMPANY_NAME}.`,
      );
      cy.contains(`The top nav bar of ${COMPANY_NAME}.`);

      cy.visit("/admin/settings/general");
      cy.contains(`The name used for this instance of ${COMPANY_NAME}.`);
    });
  });

  describe("company logo", () => {
    beforeEach(() => {
      cy.log("Add a logo");
      cy.readFile(
        "frontend/test/__support__/e2e/assets/logo.jpeg",
        "base64",
      ).then(logo_data => {
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
      cy.visit("/question/1");
      cy.findByText("Doing science...");

      const runningQueryMessage = "Running query...";
      changeLoadingMessage(runningQueryMessage);
      cy.visit("/question/1");
      cy.findByText(runningQueryMessage);

      const loadingResultsMessage = "Loading results...";
      changeLoadingMessage(loadingResultsMessage);
      cy.visit("/question/1");
      cy.findByText(loadingResultsMessage);
    });
  });

  describe("metabot", () => {
    it("should toggle metabot visibility", () => {
      cy.visit("/");
      cy.findByAltText("Metabot");

      cy.visit("/admin/settings/whitelabel");
      cy.findByText("Display our little friend on the homepage").click();

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
