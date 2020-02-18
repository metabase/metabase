import { signInAsAdmin, popover, modal } from "__support__/cypress";

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

  it("should let you add a parameter to a dashboard with a text box", () => {
    cy.visit("/dashboard/1");
    // click pencil icon to edit
    cy.get(".Icon-pencil").click();
    // add text box with text
    cy.get(".Icon-string").click();
    cy.get(".DashCard")
      .last()
      .find("textarea")
      .type("text text text");
    cy.get(".Icon-funnel_add").click();
    popover()
      .contains("Other Categories")
      .click();
    cy.contains("Done").click();
    cy.contains("Save").click();

    // confirm text box and filter are still there
    cy.contains("text text text");
    cy.get("input[placeholder=Category]");

    // reset
    // remove text box
    cy.get(".Icon-pencil").click();
    cy.get(".DashCard")
      .last()
      .find(".Icon-close")
      .click({ force: true });
    modal()
      .contains("button", "Remove")
      .click({ force: true });
    // remove filter
    cy.contains("Remove").click();
    cy.contains("Save").click();
  });

  it("should parse duplicate parameter query params", () => {
    cy.visit("/browse/1");
    cy.contains("Orders").click();
    cy.contains("Save").click();
    modal()
      .contains("button", "Save")
      .click();
    modal()
      .contains("Yes please!")
      .click();
    modal()
      .contains("Create a new dashboard")
      .click();
    modal()
      .contains("Name")
      .next()
      .type("my dash");
    cy.url().as("questionUrl"); // this is for resetting
    modal()
      .contains("Create")
      .click();

    // add an id parameter
    cy.get(".Icon-funnel_add").click();
    popover()
      .contains("ID")
      .click();
    cy.contains("Select…").click();
    popover()
      .contains("ID")
      .first()
      .click({ force: true });
    cy.contains("Done").click();
    cy.contains("Save").click();

    // reload page with param
    cy.url().as("dashboardUrl");
    cy.get("@dashboardUrl").then(url => cy.visit(url + "?id=123&id=321"));

    // wait for dashboard load
    cy.contains("my dash");
    // card should be filtered to two ids
    cy.contains("Rows 1-1 of 2");

    //reset
    cy.get("@dashboardUrl").then(url => {
      const id = url.match(/\d+$/)[0];
      cy.request("PUT", `/api/dashboard/${id}`, { archive: true });
    });
    cy.get("@questionUrl").then(url => {
      const id = url.match(/\d+$/)[0];
      cy.request("PUT", `/api/card/${id}`, { archive: true });
    });
  });
});
