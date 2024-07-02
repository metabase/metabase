import { USERS } from "e2e/support/cypress_data";
import { browseDatabases, restore } from "e2e/support/helpers";

const sizes = [
  [1280, 800],
  [640, 360],
];
const { admin } = USERS;

describe("scenarios > auth > signin", () => {
  beforeEach(() => {
    restore();
    cy.signOut();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should redirect to /auth/login", () => {
    cy.visit("/");
    cy.url().should("contain", "auth/login");
  });

  it("should redirect to / when logged in", () => {
    cy.signInAsAdmin();
    cy.visit("/auth/login");
    cy.url().should("not.contain", "auth/login");
    cy.icon("gear").should("exist");
  });

  it("should display an error for incorrect passwords", () => {
    cy.visit("/");
    cy.findByLabelText("Email address").type(admin.email);
    cy.findByLabelText("Password").type("INVALID" + admin.password);
    cy.button("Sign in").click();
    cy.findByRole("alert")
      .filter(':contains("did not match stored password")')
      .should("be.visible");
  });

  it("should display same error for unknown users (to avoid leaking the existence of accounts)", () => {
    cy.visit("/");
    cy.findByLabelText("Email address").type("INVALID" + admin.email);
    cy.findByLabelText("Password").type(admin.password);
    cy.button("Sign in").click();
    cy.findByRole("alert")
      .filter(':contains("did not match stored password")')
      .should("be.visible");
  });

  it("should greet users after successful login", () => {
    cy.visit("/auth/login");
    cy.findByLabelText("Email address").should("be.focused").type(admin.email);
    cy.findByLabelText("Password").type(admin.password);
    cy.button("Sign in").click();
    cy.findByTestId("greeting-message").should("contain.text", "Bobby");
  });

  it("should allow login regardless of login email case", () => {
    cy.visit("/auth/login");
    cy.findByLabelText("Email address").type(admin.email.toUpperCase());
    cy.findByLabelText("Password").type(admin.password);
    cy.button("Sign in").click();
    cy.findByTestId("greeting-message").should("contain.text", "Bobby");
  });

  it("should allow toggling of Remember Me", () => {
    cy.visit("/auth/login");

    // default initial state
    cy.findByRole("checkbox").should("be.checked");

    cy.findByLabelText("Remember me").click();
    cy.findByRole("checkbox").should("not.be.checked");
  });

  it("should redirect to an unsaved question after login", () => {
    cy.signInAsAdmin();
    cy.visit("/");
    browseDatabases().click();
    cy.findByRole("heading", { name: "Sample Database" }).click();
    cy.findByRole("heading", { name: "Orders" }).click();
    cy.wait("@dataset");
    cy.findAllByRole("gridcell", { name: "37.65" });

    // signout and reload page with question hash in url
    cy.signOut();
    cy.reload();

    cy.findByRole("heading", { name: "Sign in to Metabase" });
    cy.findByLabelText("Email address").type(admin.email);
    cy.findByLabelText("Password").type(admin.password);
    cy.button("Sign in").click();

    cy.wait("@dataset");
    cy.findAllByRole("gridcell", { name: "37.65" });
  });

  sizes.forEach(size => {
    it(`should redirect from /auth/forgot_password back to /auth/login (viewport: ${size}) (metabase#12658)`, () => {
      if (Array.isArray(size)) {
        cy.viewport(size[0], size[1]);
      } else {
        cy.viewport(size);
      }

      cy.visit("/");
      cy.url().should("contain", "auth/login");
      cy.findByRole("link", {
        name: "I seem to have forgotten my password",
      }).click();
      cy.url().should("contain", "auth/forgot_password");
      cy.findByRole("link", { name: "Back to sign in" }).click();
      cy.url().should("contain", "auth/login");
    });
  });
});
