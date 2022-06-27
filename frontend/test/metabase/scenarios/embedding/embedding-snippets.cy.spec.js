import {
  restore,
  popover,
  visitDashboard,
  isEE,
} from "__support__/e2e/helpers";

import { JS_CODE, IFRAME_CODE } from "./embedding-snippets";

describe("scenarios > embedding > code snippets", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("dashboard should have the correct embed snippet", () => {
    visitDashboard(1);
    cy.icon("share").click();
    cy.contains(/Embed this .* in an application/).click();
    cy.contains("Code").click();

    cy.findByText("To embed this dashboard in your application:");
    cy.findByText(
      "Insert this code snippet in your server code to generate the signed embedding URL",
    );

    cy.get(".ace_content")
      .first()
      .invoke("text")
      .should("match", JS_CODE({ isEE }));

    // hide download button for pro/enterprise users metabase#23477
    if (isEE) {
      cy.findByLabelText(
        "Enable users to download data from this embed?",
      ).click();

      cy.get(".ace_content")
        .first()
        .invoke("text")
        .should("match", JS_CODE({ isEE, hideDownloadButton: true }));
    }

    cy.get(".ace_content")
      .last()
      .should("have.text", IFRAME_CODE);

    cy.findAllByTestId("embed-backend-select-button")
      .should("contain", "Node.js")
      .click();

    popover()
      .should("contain", "Node.js")
      .and("contain", "Ruby")
      .and("contain", "Python")
      .and("contain", "Clojure");

    cy.findAllByTestId("embed-frontend-select-button")
      .should("contain", "Mustache")
      .click();

    popover()
      .should("contain", "Mustache")
      .and("contain", "Pug / Jade")
      .and("contain", "ERB")
      .and("contain", "JSX");
  });
});
