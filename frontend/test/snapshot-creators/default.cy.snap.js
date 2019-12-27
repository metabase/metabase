import {
  snapshot,
  restore,
  ADMIN_CREDS,
  NORMAL_USER_CREDS,
} from "__support__/cypress";

describe("default", () => {
  it("default", () => {
    snapshot("blank");
    setup();
    updateSettings();
    createQuestionAndDashboard();
    addUser();
    snapshot("default");
    restore("blank");
  });
});

function setup() {
  cy.visit("/");
  cy.contains("Let's get started").click();

  // User
  const { username, password } = ADMIN_CREDS;
  cy.get('input[name="first_name"]').type("Bobby");
  cy.get('input[name="last_name"]').type("Tables");
  cy.get('input[name="email"]').type(username);
  cy.get('input[name="password"]').type(password);
  cy.get('input[name="password_confirm"]').type(password);
  cy.get('input[name="site_name"]').type("Epic Team");
  cy.contains("Next").click();

  // Database
  cy.contains("I'll add my data later").click();

  // Data Preferences
  cy.contains("Allow Metabase to anonymously collect usage events")
    .parents(".Form-field")
    .find("a")
    .click();
  cy.contains("Next").click();

  cy.contains("Take me to Metabase").click();
}

function updateSettings() {
  cy.visit("/admin/settings/public_sharing");
  cy.contains("Disabled")
    .prev()
    .click();
  cy.contains("Saved");
}

function addUser() {
  cy.visit("/admin/people");
  cy.contains("Add someone").click();

  const typeFieldInModal = (label, text) =>
    cy
      .get(".ModalContent")
      .contains(label)
      .next()
      .type(text);

  typeFieldInModal("First name", "Robert");
  typeFieldInModal("Last name", "Tableton");
  const { username, password } = NORMAL_USER_CREDS;
  typeFieldInModal("Email", username);
  cy.contains("Create").click();
  cy.contains("Show").click();
  cy.contains("Temporary Password")
    .parent()
    .next()
    .invoke("val")
    .as("tempPassword");

  // Log out of the admin account, so we can change the password
  cy.contains("Done").click();
  cy.get(".Icon-gear")
    .last()
    .click();
  cy.contains("Sign out").click();

  // On logout, the signin page briefly flashes before the app reloads and
  // displays it permanently. We need to wait for that reload so we don't start
  // typing too soon.
  cy.wait(1000);

  // log into the normal user account using the temp password
  cy.contains("Email address")
    .next()
    .type(username);
  cy.get("@tempPassword").then(t =>
    cy
      .contains("Password")
      .next()
      .type(t),
  );
  cy.get(".Button").click();

  // go to update password form
  cy.get(".Icon-gear").click();
  cy.contains("Account settings").click();
  cy.contains("Password").click();

  // update password
  cy.get("@tempPassword").then(t =>
    cy.get(`input[name="old_password"]`).type(t),
  );
  cy.get(`input[name="password"]`)
    .first()
    .type(password);
  cy.get(`input[name="password"]`)
    .last()
    .type(password);
  cy.contains("Save").click();
  cy.contains("Password updated successfully!");
}

function createQuestionAndDashboard() {
  cy.visit("/question/new");
  cy.contains("Simple question").click();
  cy.contains("Orders").click();
  cy.contains("37.65");
  cy.contains("Save").click(); // open save modal
  cy.get(".ModalContent")
    .contains(/^Save$/)
    .click(); // save question
  cy.contains("Saved!");
  cy.contains("Yes please!").click();
  cy.contains("Create a new dashboard").click();
  cy.contains("Name")
    .next()
    .type("orders in a dashboard");
  cy.get(".ModalContent")
    .contains("Create")
    .click();
  cy.contains("You are editing a dashboard");
  cy.contains("Save").click();
  cy.get(".EditHeader").should("have.length", 0);
}
