import {
  restore,
  signInAsAdmin,
  signOut,
  signInAsNormalUser,
  openOrdersTable,
  describeWithToken,
} from "__support__/cypress";

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
  cy.readFile(
    "enterprise/frontend/test/metabase-enterprise/_support_/logo.jpeg",
    "base64",
  ).then(logo_data => {
    cy.get(`img[src="data:image/jpeg;base64,${logo_data}"]`);
  });
}

describeWithToken("formatting > whitelabel", () => {
  before(restore);

  it("should be able to change company name", () => {
    signInAsAdmin();
    cy.visit("/admin/settings/whitelabel");
    cy.findByPlaceholderText("Metabase")
      .clear()
      .type("Test Co");
    // Helps scroll the page up in order to see "Saved" notification
    cy.findByText("Application Name").click();
    cy.findByText("Saved");
    cy.findByDisplayValue("Test Co");
    cy.log("Company name has been updated!");

    cy.log("**--1. New company should show up on activity page--**");
    cy.visit("/activity");
    cy.findByText("Test Co is up and running.");
    cy.findByText("Metabase is up and running.").should("not.exist");

    cy.log("**--2. New company should show up when logged out--**");
    signOut();
    cy.visit("/");
    cy.findByText("Sign in to Test Co");

    cy.log("**--3. New company should show up for a normal user--**");
    signInAsNormalUser();
    cy.visit("/activity");
    cy.findByText("Test Co is up and running.");
    cy.findByText("Metabase is up and running.").should("not.exist");
  });

  it("should be able to set colors using color-picker dialog", () => {
    signInAsAdmin();
    cy.visit("/admin/settings/whitelabel");

    cy.log("**--1. Select color with squares--**");
    changeThemeColor(1, colors.primary.hex);

    cy.log("**--2. Select color by entering rgb value--**");
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

    cy.log("**--3. Select color by typing hex code--**");
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

  describe("Changes to theme colors work", () => {
    beforeEach(() => {
      signInAsAdmin();
      cy.request("PUT", "/api/setting/application-colors", {
        value: {
          accent1: "#417505",
          accent2: "#7ed321",
          accent3: "#b8e986",
          accent4: "#50e3c2",
          accent5: "#4a90e2",
          accent6: "#082cbe",
          accent7: "#f8e71c",
          brand: "#8b572a",
          nav: "#284e07",
        },
      });
    });

    it("should show color changes", () => {
      signOut();
      cy.visit("/");
      cy.contains("Sign in");

      // Note that if we have modified the logo, the entire background turns the brand color.
      // But if we _haven't_, as is the case now, then the existing logo is branded
      // As is the "Remember me" and "Sign in" inputs
      cy.get(".Icon").should(
        "have.css",
        "color",
        `rgb(${colors.primary.rgb.join(", ")})`,
      );

      cy.findByLabelText("Email address").type("some@email.com");
      cy.findByLabelText("Password").type("1234");
      cy.get(".Button--primary").should(
        "have.css",
        "background-color",
        `rgb(${colors.primary.rgb.join(", ")})`,
      );

      cy.log("Normal users should have a green header");
      signInAsNormalUser();
      cy.visit("/");
      cy.get(".Nav").should(
        "have.css",
        "background-color",
        `rgb(${colors.nav.rgb.join(", ")})`,
      );

      cy.log(
        "Admin users should also have a green header, but yellow in the admin panel",
      );
      signInAsAdmin();
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
      signInAsNormalUser();
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

  describe("Logo customization", () => {
    beforeEach(() => {
      signInAsAdmin();

      cy.log("**Add a logo**");
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
      cy.visit("/");
      checkLogo();
    });

    it("should reflect logo change while signed out", () => {
      signOut();
      cy.visit("/");
      checkLogo();
    });

    it("should reflect logo change on user's dashboard", () => {
      signInAsNormalUser();
      cy.visit("/");
      checkLogo();
    });
  });

  it("should add a custom favicon", () => {
    signInAsAdmin();
    cy.visit("/admin/settings/whitelabel");

    cy.findByPlaceholderText("frontend_client/favicon.ico").type(
      "https://cdn.ecosia.org/assets/images/ico/favicon.ico",
    );
    cy.get("ul")
      .eq(2)
      .click("right");
    cy.findByText("Saved");
    checkFavicon();

    cy.log("New favicon should show up in user's HTML");
    signInAsNormalUser();
    cy.visit("/");
    cy.get('head link[rel="icon"]')
      .get('[href="https://cdn.ecosia.org/assets/images/ico/favicon.ico"]')
      .should("have.length", 1);
  });
});
