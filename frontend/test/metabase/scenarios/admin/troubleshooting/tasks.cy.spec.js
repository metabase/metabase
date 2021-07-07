import { restore } from "__support__/e2e/cypress";

describe("scenarios > admin > troubleshooting > tasks", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("pagination should work (metabase#14636)", () => {
    // Really ugly way to bump up total number of tasks (but more realistic than using fixture, or stubbing)
    // Since this happens async, that number may vary but it should always be greater than 50 [1] and less than 100 [2]
    // Note: each sync generates 6 tasks and we start with 12 tasks already for the testing sample dataset
    for (let i = 0; i < 13; i++) {
      cy.request("POST", "/api/database/1/sync_schema");
    }
    cy.server();
    cy.route("GET", "/api/task?limit=50&offset=0").as("tasks");

    cy.visit("/admin/troubleshooting/tasks");

    cy.wait("@tasks").then(xhr => {
      expect(xhr.response.body.total).to.be.greaterThan(50); /* [1] */
      expect(xhr.response.body.total).to.be.lessThan(100); /* [2] */
    });

    cy.findByText("Troubleshooting logs");
    cy.icon("chevronleft").as("previous");
    cy.icon("chevronright").as("next");

    cy.contains("1 - 50");
    shouldBeDisabled("@previous");
    shouldNotBeDisabled("@next");

    cy.get("@next").click();
    // 51 - any 2 digits number
    cy.contains(/51 - \d{2}/);
    cy.contains("1 - 50").should("not.exist");
    shouldNotBeDisabled("@previous");
    shouldBeDisabled("@next");
  });
});

function shouldNotBeDisabled(selector) {
  cy.get(selector)
    .parent()
    .should("not.have.attr", "disabled");
}

function shouldBeDisabled(selector) {
  cy.get(selector)
    .parent()
    .should("have.attr", "disabled");
}
