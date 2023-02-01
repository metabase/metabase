import { restore } from "__support__/e2e/helpers";

import { USERS } from "__support__/e2e/cypress_data";

const { admin } = USERS;

function outputViolations(context) {
  Cypress.Screenshot.defaults({
    capture: "runner",
    overwrite: true,
  });
  return terminalLog.bind(this, context);
}

function generateId() {
  const iso8601Date = new Date().toISOString();
  const id = iso8601Date.replaceAll(":", "-");

  return id;
}

/**
 *
 * @param {String} context
 * @param {Array} violations
 */
function terminalLog(context, violations) {
  if (!context) {
    throw new Error("Context must be provided!");
  }

  const { baseName, relative } = Cypress.spec;
  const { title } = Cypress.currentTest;
  const fileName = title.toLowerCase().split(" ").join("-");
  const id = generateId();

  const REPORTS_FOLDER = `cypress/a11y-reports/${baseName}`;
  const SCREENSHOTS_FOLDER = `cypress/screenshots/${baseName}`;

  cy.screenshot(`${baseName}/${fileName}/${id}`);

  const o = {
    spec: baseName,
    location: relative,
    title,
    context,
    media: {
      screenshot: `${SCREENSHOTS_FOLDER}/${fileName}/${id}.png`,
      video: `cypress/videos/${baseName}.mp4`,
    },
    violations,
  };

  cy.writeFile(`${REPORTS_FOLDER}/${fileName}/${id}.json`, o);

  const violationData = violations.map(
    ({ id, impact, description, nodes }) => ({
      id,
      impact,
      description,
      nodes: nodes.length,
    }),
  );
  cy.writeFile(
    `${REPORTS_FOLDER}/${fileName}/${id}-summary.json`,
    violationData,
  );

  console.table(violationData);
}

// function simpleLog(violations) {
//   cy.log("Logging violations");
//   const violationData = violations.map(
//     ({ id, impact, description, nodes }) => ({
//       id,
//       impact,
//       description,
//       nodes: nodes.length,
//     }),
//   );

//   console.table(violationData);
// }

describe("accessibility testing", { tags: "@a11y" }, () => {
  it("Metabase setup page should not violate any a11y standards", () => {
    restore("blank");
    cy.visit("/");
    cy.injectAxe();

    cy.location("pathname").should("eq", "/setup");
    cy.checkA11y(null, null, outputViolations("Setup page upon load"), true);
  });

  it("should set up Metabase using only keyboard", () => {
    restore("blank");

    cy.visit("/");
    cy.injectAxe();

    cy.location("pathname").should("eq", "/setup");
    cy.findByText("Welcome to Metabase");

    cy.get("body").realClick().realPress("Tab");
    cy.focused().should("contain", "Let's get started").realPress("Space");
    cy.findByText("What's your preferred language?");
    cy.checkA11y(
      null,
      null,
      outputViolations("Before submitting a language"),
      true,
    );
    cy.focused().should("have.value", "en").and("be.checked").realPress("Tab");
    cy.focused()
      .should("have.text", "Next")
      .and("not.be.disabled")
      .realPress("Space");
    cy.findByText("What's your preferred language?").should("not.exist");
    cy.findByText("Your language is set to English");

    cy.focused()
      .realType(admin.first_name)
      .realPress("Tab")
      .realPress("Tab")
      .realType("admin@metabase.test")
      .realPress("Tab")
      .realType("Foo")
      .realPress("Tab")
      .realType("12341234")
      .realPress("Tab")
      .realType("12341234")
      .realPress("Tab");
    cy.checkA11y(
      null,
      null,
      outputViolations("Language set. Personal info filled out but not sent"),
      true,
    );
    cy.focused()
      .should("have.text", "Next")
      .and("not.be.disabled")
      .realPress("Space");

    cy.findByText(`Hi, ${admin.first_name}. Nice to meet you!`);

    cy.focused()
      .should("have.prop", "placeholder", "Search for a database…")
      .realPress("Tab");
    cy.focused().should("have.text", "Show more options").realPress("Space");
    cy.findByText("Show more options").should("not.exist");
    cy.findByText("Presto");
    cy.focused().should("have.text", "Show fewer options").realPress("Tab");
    cy.checkA11y(
      null,
      null,
      outputViolations("Add your data with expanded icons"),
      true,
    );
    cy.focused()
      .should("have.text", "I'll add my data later")
      .realPress("Space");

    cy.checkA11y(
      null,
      null,
      outputViolations("Analytics step before removing consent"),
      true,
    );
    cy.focused()
      .should("have.attr", "role", "switch")
      .and("be.checked")
      .realPress("Space");
    cy.focused()
      .should("have.attr", "role", "switch")
      .and("not.be.checked")
      .realPress("Tab");
    cy.focused().should("have.text", "Finish").realPress("Space");
    cy.findByText("We won't collect any usage events");
    cy.findByText("You're all set up!");
    cy.focused().should("have.value", "admin@metabase.test").realPress("Tab");
    cy.focused().should("have.text", "Subscribe").and("not.be.disabled");

    cy.realPress("Tab");
    cy.checkA11y(
      null,
      null,
      outputViolations("All set up without subscription"),
      true,
    );
    // For some reason, this button doesn't get clicked with "Space" like the others.
    // It needs to be clicked by pressing "Enter".
    cy.focused().should("have.text", "Take me to Metabase").realPress("Enter");
    cy.location("pathname").should("eq", "/");
  });

  it("can log in using only keyboard", () => {
    restore();

    cy.visit("/");
    cy.injectAxe();

    cy.location("pathname").should("eq", "/auth/login");
    cy.location("search").should("eq", "?redirect=%2F");

    cy.focused()
      .should("have.prop", "placeholder", "nicetoseeyou@email.com")
      .realType(admin.email)
      .realPress("Tab")
      // Let's intentionally skip password field
      .realPress("Tab");

    cy.contains("Password: required");
    cy.button("Sign in").should("be.disabled");
    cy.checkA11y(null, null, outputViolations("Password is missing"), true);

    cy.realPress(["Shift", "Tab"]);
    cy.focused()
      .should("have.attr", "type", "password")
      .realType(admin.password);
    cy.checkA11y(null, null, outputViolations("Password is missing"), true);

    cy.realPress("Enter");
    cy.location("pathname").should("eq", "/");
    cy.findByText("Our analytics");
  });
});
