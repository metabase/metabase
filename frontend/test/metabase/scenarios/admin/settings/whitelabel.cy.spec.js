import {
  restore,
  openOrdersTable,
  describeWithToken,
} from "__support__/e2e/cypress";

// Define colors that we use for whitelabeling
// If rbg values exist, it's because we explicit test those
const colors = {
  primary: { hex: "8B572A", rgb: [139, 87, 42] },
  nav: { hex: "284E07", rgb: [40, 78, 7] },
  accent1: { hex: "417505" },
  accent2: { hex: "7ED321" },
  additional1: { hex: "B8E986" },
  additional2: { hex: "50E3C2" },
  additional3: { hex: "4A90E2" },
  additional4: { hex: "082CBE" },
  additional5: { hex: "F8E71C", rgb: [248, 231, 28] },
};

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
  cy.readFile("frontend/test/__support__/e2e/assets/logo.jpeg", "base64").then(
    logo_data => {
      cy.get(`img[src="data:image/jpeg;base64,${logo_data}"]`);
    },
  );
}

describeWithToken("formatting > whitelabel", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("admin", () => {
    it("should be able to set colors using color-picker dialog", () => {
      cy.visit("/admin/settings/whitelabel");

      cy.log("Select color with squares");
      changeThemeColor(1, colors.primary.hex);

      cy.log("Select color by entering rgb value");
      cy.get("td")
        .eq(5)
        .click();
      cy.get(".sketch-picker")
        .find("input")
        .eq(1)
        .clear()
        .type(colors.nav.rgb[0]);
      cy.get(".sketch-picker")
        .find("input")
        .eq(2)
        .clear()
        .type(colors.nav.rgb[1]);
      cy.get(".sketch-picker")
        .find("input")
        .eq(3)
        .clear()
        .type(colors.nav.rgb[2]);
      cy.findByText("Done").click();

      cy.log("Select color by typing hex code");
      cy.get("td")
        .eq(29)
        .click();
      cy.get(".sketch-picker")
        .find("input")
        .first()
        .clear()
        .type(colors.additional4.hex);
      cy.findByText("Done").click();
    });
  });

  describe("company name", () => {
    const COMPANY_NAME = "Test Co";

    beforeEach(() => {
      cy.log("Change company name");
      cy.visit("/admin/settings/whitelabel");
      cy.findByPlaceholderText("Metabase")
        .clear()
        .type(COMPANY_NAME);
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
  });

  describe("company color theme", () => {
    beforeEach(() => {
      cy.request("PUT", "/api/setting/application-colors", {
        value: {
          accent1: `#${colors.accent1.hex}`,
          accent2: `#${colors.accent2.hex}`,
          accent3: `#${colors.additional1.hex}`,
          accent4: `#${colors.additional2.hex}`,
          accent5: `#${colors.additional3.hex}`,
          accent6: `#${colors.additional4.hex}`,
          accent7: `#${colors.additional5.hex}`,
          brand: `#${colors.primary.hex}`,
          nav: `#${colors.nav.hex}`,
        },
      });
    });

    it("should reflect color changes", () => {
      cy.signOut();
      cy.visit("/");

      // Note that if we have modified the logo, the entire background turns the brand color.
      // But if we _haven't_, as is the case now, then the existing logo is branded
      // As is the "Remember me" and "Sign in" inputs
      cy.get(".Icon.text-brand").should(
        "have.css",
        "color",
        `rgb(${colors.primary.rgb.join(", ")})`,
      );

      cy.findByLabelText("Email address").type("some@email.test");
      cy.findByLabelText("Password").type("1234");
      cy.get(".Button--primary").should(
        "have.css",
        "background-color",
        `rgb(${colors.primary.rgb.join(", ")})`,
      );

      cy.log("Normal users should have a green header");
      cy.signInAsNormalUser();
      cy.visit("/");
      cy.get(".Nav").should(
        "have.css",
        "background-color",
        `rgb(${colors.nav.rgb.join(", ")})`,
      );

      cy.log(
        "Admin users should also have a green header, but yellow in the admin panel",
      );
      cy.signInAsAdmin();
      cy.visit("/");
      cy.get(".Nav").should(
        "have.css",
        "background-color",
        `rgb(${colors.nav.rgb.join(", ")})`,
      );
      cy.visit("/admin");
      cy.get(".Nav").should(
        "have.css",
        "background-color",
        `rgb(${colors.additional5.rgb.join(", ")})`,
      );
    });

    it.skip("should show color changes reflected in q visualizations (metabase-enterprise #470)", () => {
      // *** Test should pass when issue #470 is resolved
      cy.signInAsNormalUser();
      openOrdersTable();
      cy.findAllByText("Summarize")
        .first()
        .click();
      cy.findByText("Price").click();
      cy.findByText("Done").click();

      cy.get(`div[fill='#${colors.primary.hex};']`);
      cy.get(`rect[fill='#509EE3']`).should("not.exist");
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
      cy.findByPlaceholderText("/app/assets/img/favicon.ico").type(
        "https://cdn.ecosia.org/assets/images/ico/favicon.ico",
      );
      cy.get("ul")
        .eq(2)
        .click("right");
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
});
