import { signInAsAdmin } from "__support__/cypress";

describe("dashboard", () => {
  beforeEach(signInAsAdmin);

  it("should have the correct embed snippet", () => {
    cy.visit("/dashboard/1");
    cy.get(".Icon-share").click();
    cy.contains(/Embed this .* in an application/).click();
    cy.contains("Code").click();

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

var iframeUrl = METABASE_SITE_URL + "/embed/dashboard/" + token + "#bordered=true&titled=true";`
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

    cy.get(".ace_content")
      .first()
      .should("have.text", JS_CODE);
    cy.get(".ace_content")
      .last()
      .should("have.text", IFRAME_CODE);
  });

  it("should update the name and description", () => {
    cy.visit("/dashboard/1");
    // click pencil icon to edit
    cy.get(".Icon-pencil").click();
    // update title
    cy.get(".Header-title input")
      .first()
      .type("{selectall}Orders per year");
    // update desc
    cy.get(".Header-title input")
      .last()
      .type("{selectall}How many orders were placed in each year?");
    cy.contains("Save").click();

    // refresh page and check that title/desc were updated
    cy.visit("/dashboard/1");
    cy.contains("Orders per year")
      .next()
      .trigger("mouseenter");
    cy.contains("How many orders were placed in each year?");

    // reset title/desc
    cy.get(".Icon-pencil").click();
    cy.get(".Header-title input")
      .first()
      .type("{selectall}Orders over time");
    cy.get(".Header-title input")
      .last()
      .clear();
    cy.contains("Save").click();
  });
});
