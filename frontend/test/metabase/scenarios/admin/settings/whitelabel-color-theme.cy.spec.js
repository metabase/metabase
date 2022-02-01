import { restore, describeWithToken } from "__support__/e2e/cypress";

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
  cy.get("td").eq(location).click();
  cy.get(`div[title='#${colorhex}']`).click();
  cy.findByText("Done").click();
}

describeWithToken("formatting > whitelabel > color theme", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should change the brand color", () => {
    cy.visit("/admin/settings/whitelabel");
    cy.intercept("GET", `/api/setting`).as("setting");
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");

    // brand color
    changeThemeColor(1, colors.primary.hex);
    cy.wait("@setting");

    cy.wait("@sessionProperties").then(xhr => {
      console.log(xhr.response.body);
      console.log(xhr.response.body["application-colors"]);
    });

    cy.signOut();

    cy.visit("/");

    // "Remember me" checkbox has to have the branded background color
    cy.get('div span[size="16"]').should(
      "have.css",
      "background-color",
      `rgb(${colors.primary.rgb.join(", ")})`,
    );
  });

  it("should change the navigation color", () => {
    cy.visit("/admin/settings/whitelabel");
    cy.intercept("GET", `/api/setting`).as("setting");
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");

    // brand color
    cy.get("td").eq(5).click();
    cy.get(".sketch-picker").find("input").first().clear().type(colors.nav.hex);
    cy.findByText("Done").click();
    cy.wait("@setting");

    cy.wait("@sessionProperties").then(xhr => {
      console.log(xhr.response.body);
      console.log(xhr.response.body["application-colors"]);
    });

    cy.signOut();

    cy.visit("/");

    cy.log("Normal users should have a green header");
    cy.signInAsNormalUser();
    cy.visit("/");
    cy.get(".Nav").should(
      "have.css",
      "background-color",
      `rgb(${colors.nav.rgb.join(", ")})`,
    );
  });

  it("should change the special navigation bar in the admin panel", () => {
    cy.visit("/admin/settings/whitelabel");
    cy.intercept("GET", `/api/setting`).as("setting");
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");

    // admin nav
    cy.get("td").eq(33).click();
    cy.get(".sketch-picker")
      .find("input")
      .first()
      .clear()
      .type(colors.additional5.hex);
    cy.findByText("Done").click();
    cy.wait("@setting");

    cy.wait("@sessionProperties").then(xhr => {
      console.log(xhr.response.body);
      console.log(xhr.response.body["application-colors"]);
    });

    cy.scrollTo("top");

    cy.log("Admin panel should be yellow");
    cy.get(".Nav").should(
      "have.css",
      "background-color",
      `rgb(${colors.additional5.rgb.join(", ")})`,
    );
  });
});
