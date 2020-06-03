import { restore, signIn } from "__support__/cypress";
import { new_user } from "admin"

describe("smoketest > new_user", () => {
  before(restore);

  it("should be able to do core useage", () => {
    // =================
    // should login
    // =================
    cy.visit("/")

    cy.get("input[name='username']")
        .type(new_user.username)
    cy.get("input[name='password']")
        .type(new_user.password)
    cy.findByText("Sign in").click()
    // *** check that you're signedin

    // =================
    // should see questions currently in the "Our Analytics" collection
    // =================

    // Q: should this be on the home page, or should you have to click the link?
    cy.findByText("Browse all items").click()
    cy.contains("")

    // =================
    // should see dashboard in the "Our Analytics" collection
    // =================

    cy.findByText("Dashboards").click()
    cy.contains("")

    // =================
    // Create my own question
    // =================

    cy.findByText("Ask a question").click()
    cy.findByText("Simple question").click()
    cy.findByText("Sample Dataset").click()
    cy.findByText("Reviews").click()

    cy.get(".Button")
        .contains("Summarize")
        .click()
    cy.findByText("Rating").click()
    cy.findByText("Done").click()

    // =================
    // Create my own dashboard
    // =================

    cy.get(".Icon-add").click()
    cy.findByText("New dashboard").click()
    cy.get("input[name='name']")
        .type("Demo Dash")
    cy.findByText("Create").click()

    cy.find("Save").click()
  });
});

