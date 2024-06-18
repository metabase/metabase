import { echartsContainer } from "e2e/support/helpers";
import {
  assertTimelineData,
  dismissOkToPlayWithQuestionsModal,
} from "e2e/test/scenarios/cross-version/helpers/cross-version-helpers";
import { version } from "e2e/test/scenarios/cross-version/source/helpers/cross-version-source-helpers.js";

describe(`smoke test the migration to the version ${version}`, () => {
  it("should already be set up", () => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sign in to Metabase");

    cy.findByLabelText("Email address").type("admin@metabase.test");
    cy.findByLabelText("Password").type("12341234");
    cy.button("Sign in").click();

    cy.findByPlaceholderText("Search…");

    // Question 1
    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quarterly Revenue").click();
    cy.wait("@cardQuery");

    dismissOkToPlayWithQuestionsModal(version);

    cy.get("circle");
    cy.get(".line");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Goal");
    cy.get(".x-axis-label").invoke("text").should("eq", "Created At");
    cy.get(".y-axis-label").invoke("text").should("eq", "Revenue");

    assertTimelineData(version);

    echartsContainer()
      .should("contain", "20,000")
      .and("contain", "100,000")
      .and("contain", "140,000");

    // Question 2
    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating of Best-selling Products").click();
    cy.wait("@cardQuery");

    cy.get(".bar").should("have.length", 4);
    echartsContainer()
      .should("contain", "Gizmo")
      .and("contain", "Gadget")
      .and("contain", "Doohickey")
      .and("contain", "Widget");

    echartsContainer()
      .should("contain", "3.27")
      .and("contain", "3.3")
      .and("contain", "3.71")
      .and("contain", "3.4");

    cy.get(".x-axis-label").invoke("text").should("eq", "Products → Category");
    cy.get(".y-axis-label")
      .invoke("text")
      .should("eq", "Average of Products → Rating");
  });
});
