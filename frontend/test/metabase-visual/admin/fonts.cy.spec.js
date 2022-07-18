import {
  restore,
  describeEE,
  typeAndBlurUsingLabel,
} from "__support__/e2e/helpers";

const CUSTOM_FONT_URL =
  "https://fonts.gstatic.com/s/robotomono/v21/L0xuDF4xlVMF-BfR8bXMIhJHg45mwgGEFl0_3vq_ROW-AJi8SJQt.woff";

describeEE("visual tests > admin > fonts", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/app/fonts/**").as("getFont");
  });

  it("should set a built-in font", () => {
    cy.visit("/admin/settings/whitelabel");

    cy.findByText("Lato").click();
    cy.findByText("Roboto Mono").click();
    waitForFont("Roboto Mono");

    cy.percySnapshot();
  });

  it("should set a custom font", () => {
    cy.visit("/admin/settings/whitelabel");

    cy.findByText("Lato").click();
    cy.findByText("Custom…").click();
    typeAndBlurUsingLabel("Regular", CUSTOM_FONT_URL);
    waitForFont("Custom");

    cy.percySnapshot();
  });
});

const waitForFont = font => {
  cy.document().its("fonts").invoke("check", `14px ${font}`).should("be.true");
};
