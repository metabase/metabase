export const version = Cypress.env("SOURCE_VERSION");

export function setupLanguage() {
  // Make sure English is the default selected language
  cy.findByText("English")
    .should("have.css", "background-color")
    .and("eq", "rgb(80, 158, 227)");

  cy.button("Next").click();
  cy.findByText("Your language is set to English");
}

export function setupInstance(version) {
  const companyLabel =
    version === "v0.41.3.1"
      ? "Your company or team name"
      : "Company or team name";

  const finalSetupButton = version === "v0.41.3.1" ? "Next" : "Finish";

  cy.findByLabelText("First name").type("Superuser");
  cy.findByLabelText("Last name").type("Tableton");
  cy.findByLabelText("Email").type("admin@metabase.test");
  cy.findByLabelText(companyLabel).type("Metabase");
  cy.findByLabelText("Create a password").type("12341234");
  cy.findByLabelText("Confirm your password").type("12341234");
  cy.button("Next").click();
  cy.findByText("Hi, Superuser. Nice to meet you!");

  cy.findByText("I'll add my data later").click();
  cy.findByText("I'll add my own data later");

  // Collection defaults to on and describes data collection
  cy.findByText("All collection is completely anonymous.");
  // turn collection off, which hides data collection description
  cy.findByLabelText(
    "Allow Metabase to anonymously collect usage events",
  ).click();
  cy.findByText("All collection is completely anonymous.").should("not.exist");
  cy.findByText(finalSetupButton).click();
  cy.findByText("Take me to Metabase").click();

  cy.location("pathname").should("eq", "/");
  cy.contains("Reviews");
}
