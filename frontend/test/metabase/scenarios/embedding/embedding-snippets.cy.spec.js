import { restore, popover, visitDashboard } from "__support__/e2e/cypress";

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

    const JS_CODE = new RegExp(
      `// you will need to install via 'npm install jsonwebtoken' or in your package.json

var jwt = require("jsonwebtoken");

var METABASE_SITE_URL = "http://localhost:PORTPORTPORT";
var METABASE_SECRET_KEY = "KEYKEYKEY";
var payload = {
  resource: { dashboard: 1 },
  params: {},
  exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration
};
var token = jwt.sign(payload, METABASE_SECRET_KEY);

var iframeUrl = METABASE_SITE_URL + "/embed/dashboard/" + token + "#bordered=true&titled=true";`
        .split("\n")
        .join("")
        .replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
        .replace("KEYKEYKEY", ".*")
        .replace("PORTPORTPORT", ".*"),
    );

    const IFRAME_CODE = `<iframe
    src="{{iframeUrl}}"
    frameborder="0"
    width="800"
    height="600"
    allowtransparency
></iframe>`
      .split("\n")
      .join("");

    cy.get(".ace_content")
      .first()
      .invoke("text")
      .should("match", JS_CODE);

    cy.get(".ace_content")
      .last()
      .should("have.text", IFRAME_CODE);

    cy.findAllByTestId("select-button")
      .first()
      .should("contain", "Node.js")
      .click();

    popover()
      .should("contain", "Node.js")
      .and("contain", "Ruby")
      .and("contain", "Python")
      .and("contain", "Clojure");

    cy.findAllByTestId("select-button")
      .last()
      .should("contain", "Mustache")
      .click();

    popover()
      .should("contain", "Mustache")
      .and("contain", "Pug / Jade")
      .and("contain", "ERB")
      .and("contain", "JSX");
  });
});
