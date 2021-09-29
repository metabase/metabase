import { browse, restore } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";

const sizes = [[1280, 800], [640, 360]];
const { admin } = USERS;

describe("scenarios > auth > signin", () => {
  beforeEach(() => {
    restore();
    cy.signOut();
  });

  it("should redirect to  /auth/login", () => {
    cy.visit("/");
    cy.url().should("contain", "auth/login");
  });

  it("should display an error for incorrect passwords", () => {
    cy.visit("/");
    cy.findByLabelText("Email address").type(admin.email);
    cy.findByLabelText("Password").type("INVALID" + admin.password);
    cy.findByText("Sign in").click();
    cy.contains("did not match stored password");
  });

  it("should display same error for unknown users (to avoid leaking the existence of accounts)", () => {
    cy.visit("/");
    cy.findByLabelText("Email address").type("INVALID" + admin.email);
    cy.findByLabelText("Password").type(admin.password);
    cy.findByText("Sign in").click();
    cy.contains("did not match stored password");
  });

  it("should greet users after successful login", () => {
    cy.visit("/auth/login");
    cy.findByLabelText("Email address")
      .should("be.focused")
      .type(admin.email);
    cy.findByLabelText("Password").type(admin.password);
    cy.findByText("Sign in").click();
    cy.contains(/[a-z ]+, Bob/i);
  });

  it("should allow login regardless of login email case", () => {
    cy.visit("/auth/login");
    cy.findByLabelText("Email address").type(admin.email.toUpperCase());
    cy.findByLabelText("Password").type(admin.password);
    cy.findByText("Sign in").click();
    cy.contains(/[a-z ]+, Bob/i);
  });

  it("should redirect to a unsaved question after login", () => {
    cy.signInAsAdmin();
    cy.visit("/");
    // Browse data moved to an icon
    browse().click();
    cy.contains("Sample Dataset").click();
    cy.contains("Orders").click();
    cy.contains("37.65");

    // signout and reload page with question hash in url
    cy.signOut();
    cy.reload();

    cy.contains("Sign in to Metabase");
    cy.findByLabelText("Email address").type(admin.email);
    cy.findByLabelText("Password").type(admin.password);
    cy.findByText("Sign in").click();

    // order table should load after login
    cy.contains("37.65");
  });

  sizes.forEach(size => {
    it(`should redirect from /auth/forgot_password back to /auth/login (viewport: ${size}) (metabase#12658)`, () => {
      if (Cypress._.isArray(size)) {
        cy.viewport(size[0], size[1]);
      } else {
        cy.viewport(size);
      }

      cy.visit("/");
      cy.url().should("contain", "auth/login");
      cy.findByText("I seem to have forgotten my password").click();
      cy.url().should("contain", "auth/forgot_password");
      cy.findByText("Back to login").click();
      cy.url().should("contain", "auth/login");
    });
  });
});
