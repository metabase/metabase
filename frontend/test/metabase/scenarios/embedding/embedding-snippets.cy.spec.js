import {
  restore,
  popover,
  visitDashboard,
  visitQuestion,
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
    cy.contains("Embed this dashboard in an application").click();
    cy.contains("Code").click();

    cy.findByText("To embed this dashboard in your application:");
    cy.findByText(
      "Insert this code snippet in your server code to generate the signed embedding URL",
    );

    cy.get(".ace_content")
      .first()
      .invoke("text")
      .should("match", JS_CODE({ type: "dashboard" }));

    // set transparent background metabase#23477
    cy.findByText("Transparent").click();
    cy.get(".ace_content")
      .first()
      .invoke("text")
      .should("match", JS_CODE({ type: "dashboard", theme: "transparent" }));

    // No download button for dashboards even for pro/enterprise users metabase#23477
    cy.findByLabelText("Enable users to download data from this embed?").should(
      "not.exist",
    );

    cy.get(".ace_content").last().should("have.text", IFRAME_CODE);

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

  it("question should have the correct embed snippet", () => {
    visitQuestion(1);
    cy.icon("share").click();
    cy.contains("Embed this question in an application").click();
    cy.contains("Code").click();

    cy.findByText("To embed this question in your application:");
    cy.findByText(
      "Insert this code snippet in your server code to generate the signed embedding URL",
    );

    cy.get(".ace_content")
      .first()
      .invoke("text")
      .should("match", JS_CODE({ type: "question" }));

    // set transparent background metabase#23477
    cy.findByText("Transparent").click();
    cy.get(".ace_content")
      .first()
      .invoke("text")
      .should("match", JS_CODE({ type: "question", theme: "transparent" }));

    // hide download button for pro/enterprise users metabase#23477
    if (isEE) {
      cy.findByLabelText(
        "Enable users to download data from this embed?",
      ).click();

      cy.get(".ace_content")
        .first()
        .invoke("text")
        .should(
          "match",
          JS_CODE({
            type: "question",
            theme: "transparent",
            hideDownloadButton: true,
          }),
        );
    }

    cy.get(".ace_content").last().should("have.text", IFRAME_CODE);

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
