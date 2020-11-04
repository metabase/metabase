import {
  restore,
  signInAsAdmin,
  signOut,
  signInAsNormalUser,
  openOrdersTable,
  describeWithToken,
} from "../../../../../frontend/test/__support__/cypress";

const main_color = {
  // brown - button, links, chart
  hex: "8B572A",
  rgb: "(139, 87, 42)",
};

//green - nav bar
const header_color = "rgb(40, 78, 7)";

function changeThemeColor(location, colorhex) {
  cy.get("td")
    .eq(location)
    .click();
  cy.get(`div[title='#${colorhex}']`).click();
  cy.findByText("Done").click();
}
function checkFavicon() {
  cy.request("/api/setting/application-favicon-url")
    .its("body")
    .should("include", "https://cdn.ecosia.org/assets/images/ico/favicon.ico");
}
function checkLogo() {
  cy.readFile(
    "enterprise/frontend/test/metabase-enterprise/_support_/logo.jpeg",
    "base64",
  ).then(logo_data => {
    cy.get(`img[src="data:image/jpeg;base64,${logo_data}"]`);
  });
}

describeWithToken("formatting > whitelabel", () => {
  before(restore);

  describe("Changes to company name work", () => {
    beforeEach(signOut);

    it("should change company name", () => {
      signInAsAdmin();
      cy.visit("/admin/settings/whitelabel");
      cy.findByPlaceholderText("Metabase")
        .clear()
        .type("Test Co");
      // *** In html, is not text, only value
      cy.findByText("Application Name").click();

      cy.findByText("Saved");
      cy.get("input").should("have.value", "Test Co");
    });

    it("should show new name on activity page as admin", () => {
      signInAsAdmin();
      cy.visit("/activity");
      cy.findByText("Test Co is up and running.");
      cy.findByText("Metabase is up and running.").should("not.exist");
    });

    it("should show new name when logged out", () => {
      cy.visit("/");
      cy.wait(2000).findByText("Sign in to Test Co");
    });

    it("should show new name on activity page as user", () => {
      signInAsNormalUser();
      cy.visit("/activity");
      cy.findByText("Test Co is up and running.");
      cy.findByText("Metabase is up and running.").should("not.exist");
    });
  });

  describe("Changes to theme colors work", () => {
    it("should change theme colors in admin panel", () => {
      signInAsAdmin();
      cy.visit("/admin/settings/whitelabel");

      // Select color with squares
      changeThemeColor(1, main_color.hex);

      // Select color by entering rgb
      cy.get("td")
        .eq(5)
        .click();
      cy.get(".sketch-picker")
        .find("input")
        .eq(1)
        .clear()
        .type("40");
      cy.get(".sketch-picker")
        .find("input")
        .eq(2)
        .clear()
        .type("78");
      cy.get(".sketch-picker")
        .find("input")
        .eq(3)
        .clear()
        .type("7");
      cy.findByText("Done").click();

      // Select colors with squares
      changeThemeColor(9, "417505");
      changeThemeColor(13, "7ED321");
      changeThemeColor(17, "B8E986");
      changeThemeColor(21, "50E3C2");
      changeThemeColor(25, "4A90E2");

      // Select color by typing hex code
      cy.get("td")
        .eq(29)
        .click();
      cy.get(".sketch-picker")
        .find("input")
        .first()
        .clear()
        .type("082CBE");
      cy.findByText("Done").click();

      changeThemeColor(33, "F8E71C");

      cy.get(".Icon-close").should("have.length", 10);
    });

    it("should show color changes on admin's dashboard", () => {
      signInAsAdmin();
      cy.visit("/");
      cy.get(`[style='background-color: ${header_color};']`);
    });

    it("should show color changes when signed out", () => {
      signOut();
      cy.visit("/");
      cy.get(
        `[style='width: 16px; height: 16px; background-color: rgb${main_color.rgb}; border: 2px solid rgb${main_color.rgb};']`,
      );
    });

    it("should show color changes on user's dashboard", () => {
      signInAsNormalUser();
      cy.visit("/");
      cy.get(`[style='background-color: ${header_color};']`);
    });

    it.skip("should show color changes reflected in q visualizations (metabase-enterprise #470)", () => {
      // *** Test should pass when issue #470 is resolved
      signInAsNormalUser();
      openOrdersTable();
      cy.wait(3000)
        .findAllByText("Summarize")
        .first()
        .click();
      cy.wait(1000)
        .findByText("Price")
        .click();
      cy.findByText("Done").click();

      cy.get(`div[fill='#${main_color.hex};']`);
      cy.get(`rect[fill='#509EE3']`).should("not.exist");
    });
  });

  describe("Changes to logo work", () => {
    it("should add a logo", () => {
      signInAsAdmin();
      cy.visit("/admin/settings/whitelabel");

      cy.server();
      cy.readFile(
        "enterprise/frontend/test/metabase-enterprise/_support_/logo.jpeg",
        "base64",
      ).then(logo_data => {
        cy.request("PUT", "/api/setting/application-logo-url", {
          placeholder:
            "enterprise/frontend/test/metabase-enterprise/_support_/logo.jpeg",
          default: "app/assets/img/logo.svg",
          description:
            "For best results, use an SVG file with a transparent background.",
          display_name: "Logo",
          env_name: "MB_APPLICATION_LOGO_URL",
          is_env_setting: false,
          type: "string",
          value: `data:image/jpeg;base64,${logo_data}`,
          originalValue: null,
        });
      });
    });

    it("should reflect logo change on admin's dashboard", () => {
      signInAsAdmin();
      cy.visit("/");
      checkLogo();
    });

    it("should reflect logo change while signed out", () => {
      cy.visit("/");
      checkLogo();
    });

    it("should reflect logo change on user's dashboard", () => {
      signInAsNormalUser();
      cy.visit("/");
      checkLogo();
    });
  });

  describe("Changes to favicon work", () => {
    it("should add a favicon", () => {
      signInAsAdmin();
      cy.visit("/admin/settings/whitelabel");

      cy.server();

      cy.findByPlaceholderText("frontend_client/favicon.ico").type(
        "https://cdn.ecosia.org/assets/images/ico/favicon.ico",
      );
      cy.get("ul")
        .eq(2)
        .click("right");
      cy.wait(10).findByText("Saved");

      checkFavicon();
    });

    it("should reflect favicon change in API", () => {
      signInAsAdmin();
      cy.visit("/");
      checkFavicon();
    });

    it("should reflect favicon change in HTML", () => {
      signInAsNormalUser();
      cy.visit("/");
      cy.get('head link[rel="icon"]')
        .get('[href="https://cdn.ecosia.org/assets/images/ico/favicon.ico"]')
        .should("have.length", 1);
    });
  });
});
