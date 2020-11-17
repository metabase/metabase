import { signInAsAdmin, restore, popover, modal } from "__support__/cypress";

describe("scenarios > dashboard > embed", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should have the correct embed snippet", () => {
    cy.visit("/dashboard/1");
    cy.get(".Icon-share").click();
    cy.contains(/Embed this .* in an application/).click();
    cy.contains("Code").click();

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
  });

  it("should update the name and description", () => {
    cy.visit("/dashboard/1");
    // click pencil icon to edit
    cy.get(".Icon-ellipsis").click();
    // update title
    popover().within(() =>
      cy.findByText("Change title and description").click(),
    );

    modal().within(() => {
      cy.findByText("Change title and description");
      cy.findByLabelText("Name").type("{selectall}Orders per year");
      cy.findByLabelText("Description").type(
        "{selectall}How many orders were placed in each year?",
      );
      cy.findByText("Update").click();
    });

    // refresh page and check that title/desc were updated
    cy.visit("/dashboard/1");
    cy.findByText("Orders per year")
      .next()
      .trigger("mouseenter");
    cy.findByText("How many orders were placed in each year?");
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
    cy.get(".Icon-filter").click();
    popover().within(() => cy.findByText("Other Categories").click());
    cy.findByText("Save").click();

    // confirm text box and filter are still there
    cy.findByText("text text text");
    cy.findByPlaceholderText("Category");
  });
});
