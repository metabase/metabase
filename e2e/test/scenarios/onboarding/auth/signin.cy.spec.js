import { browse, restore } from "e2e/support/helpers";
import { USERS } from "e2e/support/cypress_data";

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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sign in").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("did not match stored password");
  });

  it("should display same error for unknown users (to avoid leaking the existence of accounts)", () => {
    cy.visit("/");
    cy.findByLabelText("Email address").type("INVALID" + admin.email);
    cy.findByLabelText("Password").type(admin.password);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sign in").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("did not match stored password");
  });

  it("should greet users after successful login", () => {
    cy.visit("/auth/login");
    cy.findByLabelText("Email address").should("be.focused").type(admin.email);
    cy.findByLabelText("Password").type(admin.password);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sign in").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/[a-z ]+, Bob/i);
  });

  it("should allow login regardless of login email case", () => {
    cy.visit("/auth/login");
    cy.findByLabelText("Email address").type(admin.email.toUpperCase());
    cy.findByLabelText("Password").type(admin.password);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sign in").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/[a-z ]+, Bob/i);
  });

  it("should allow toggling of Remember Me", () => {
    cy.visit("/auth/login");

    // default initial state
    cy.findByRole("checkbox").should("be.checked");

    cy.findByLabelText("Remember me").click();
    cy.findByRole("checkbox").should("not.be.checked");
  });

  it("should redirect to a unsaved question after login", () => {
    cy.signInAsAdmin();
    cy.visit("/");
    // Browse data moved to an icon
    browse().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sample Database").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Orders").click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");

    // signout and reload page with question hash in url
    cy.signOut();
    cy.reload();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sign in to Metabase");
    cy.findByLabelText("Email address").type(admin.email);
    cy.findByLabelText("Password").type(admin.password);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sign in").click();

    // order table should load after login
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
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
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("I seem to have forgotten my password").click();
      cy.url().should("contain", "auth/forgot_password");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Back to sign in").click();
      cy.url().should("contain", "auth/login");
    });
  });
});
