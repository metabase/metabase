const { H } = cy;
import { USERS } from "e2e/support/cypress_data";

const sizes = [
  [1280, 800],
  [640, 360],
];
const { admin } = USERS;

describe("scenarios > auth > signin", () => {
  beforeEach(() => {
    H.restore();
    cy.signOut();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should redirect to / when logged in", () => {
    cy.signInAsAdmin();
    cy.visit("/auth/login");
    cy.url().should("not.contain", "auth/login");
    H.getProfileLink().should("exist");
  });

  it("should reject invalid credentials and allow login regardless of email case", () => {
    cy.intercept("POST", "/api/session").as("signIn");
    cy.visit("/");
    cy.location("pathname").should("eq", "/auth/login");
    cy.findByLabelText("Email address").should("be.focused");
    cy.clock();

    cy.log("reject invalid credentials");
    [
      { email: admin.email, password: "INVALID" + admin.password },
      { email: "INVALID" + admin.email, password: admin.password },
    ].forEach(({ email, password }) => {
      cy.findByLabelText("Email address").clear();
      cy.findByLabelText("Password").clear();
      cy.findByLabelText("Email address").type(email);
      cy.findByLabelText("Password").type(password);
      cy.button("Sign in").click();
      cy.wait("@signIn").its("response.statusCode").should("eq", 401);
      cy.findByRole("alert")
        .filter(':contains("did not match stored password")')
        .should("be.visible");
      cy.button("Failed").should("be.visible");
      cy.tick(5000);
      cy.button("Sign in").should("be.visible");
    });

    cy.log("allow login regardless of email case");
    cy.clock().invoke("restore");
    cy.findByLabelText("Email address").clear();
    cy.findByLabelText("Password").clear();
    cy.findByLabelText("Email address").type(admin.email.toUpperCase());
    cy.findByLabelText("Password").type(admin.password);
    cy.findByRole("checkbox", { name: "Remember me" }).should("be.checked");
    cy.findByLabelText("Remember me").click();
    cy.findByRole("checkbox", { name: "Remember me" }).should("not.be.checked");
    cy.button("Sign in").click();
    cy.wait("@signIn").its("response.statusCode").should("eq", 200);
    cy.findByTestId("greeting-message").should("contain.text", "Bobby");
  });

  it("should redirect to an unsaved question after login", () => {
    cy.signInAsAdmin();
    cy.visit("/");
    H.browseDatabases().click();
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

  sizes.forEach((size) => {
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
