import {
  restore,
  signInAsAdmin,
  signOut,
  signInAsNormalUser,
  openOrdersTable,
  describeWithToken,
} from "../../../../../frontend/test/__support__/cypress";

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
    // *** In html, is not text, only value
    cy.findByText("Application Name").click();

    cy.findByText("Saved");
    cy.get("input").should("have.value", "Test Co");
    cy.log("Company name has been updated");

    cy.log("New company show show up on activity page");
    // signInAsAdmin();
    cy.visit("/activity");
    cy.findByText("Test Co is up and running.");
    cy.findByText("Metabase is up and running.").should("not.exist");

    cy.log("New company should show up when logged out");
    signOut();
    cy.visit("/");
    cy.findByText("Sign in to Test Co");

    cy.log("new company should show up as a normal user");
    signInAsNormalUser();
    cy.visit("/activity");
    cy.findByText("Test Co is up and running.");
    cy.findByText("Metabase is up and running.").should("not.exist");
  });

  describe("Changes to theme colors work", () => {
    it("should change theme colors in admin panel", () => {
      signInAsAdmin();
      cy.visit("/admin/settings/whitelabel");

      // Select color with squares
      changeThemeColor(1, colors.primary.hex);

      // Select color by entering rgb
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

      // Select colors with squares
      changeThemeColor(9, colors.accent1.hex);
      changeThemeColor(13, colors.accent2.hex);
      changeThemeColor(17, colors.additional1.hex);
      changeThemeColor(21, colors.additional2.hex);
      changeThemeColor(25, colors.additional3.hex);

      // Select color by typing hex code
      cy.get("td")
        .eq(29)
        .click();
      cy.get(".sketch-picker")
        .find("input")
        .first()
        .clear()
        .type(colors.additional4.hex);
      cy.findByText("Done").click();

      changeThemeColor(33, colors.additional5.hex);

      cy.get(".Icon-close").should("have.length", 10);
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

  it("should add a custom favicon", () => {
    signInAsAdmin();
    cy.visit("/admin/settings/whitelabel");

    cy.server();

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
