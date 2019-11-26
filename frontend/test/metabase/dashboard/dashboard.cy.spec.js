import { signInAsAdmin } from "__support__/cypress";

describe("dashboard", () => {
  Cypress.on("uncaught:exception", (err, runnable) => false);
  beforeEach(signInAsAdmin);
  const JS_CODE = `// you will need to install via 'npm install jsonwebtoken' or in your package.json

var jwt = require("jsonwebtoken");

var METABASE_SITE_URL = "http://localhost:3000";
var METABASE_SECRET_KEY = "e893e786425e7604263d8d9590937e7a59d41d940fe99d529690b0e2cd3662a5";

var payload = {
  resource: { dashboard: 1 },
  params: {},
  exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration
};
var token = jwt.sign(payload, METABASE_SECRET_KEY);

var iframeUrl = METABASE_SITE_URL + "/embed/undefined/" + token + "#bordered=true&titled=true";`
    .split("\n")
    .join("");

  const IFRAME_CODE = `<iframe
    src="{{iframeUrl}}"
    frameborder="0"
    width="800"
    height="600"
    allowtransparency
></iframe>`
    .split("\n")
    .join("");

  it("should have the correct embed snippet", () => {
    cy.visit("/dashboard/1");
    cy.get(".Icon-share").click();
    cy.contains(/Embed this .* in an application/).click();
    cy.contains("Code").click();
    cy.get(".ace_content")
      .first()
      .should("have.text", JS_CODE);
    cy.get(".ace_content")
      .last()
      .should("have.text", IFRAME_CODE);
  });
});
