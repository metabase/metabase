const { H } = cy;

function executeCreateGlossaryTermFlow() {
  cy.intercept("POST", "/api/glossary").as("createGlossary");

  cy.findByRole("button", { name: /new term/i }).click();

  cy.findByPlaceholderText(/boat/i).type("  Boat  ");
  cy.findByPlaceholderText(/a small vessel.*/i).type(
    "  A small vessel for traveling on water.  {enter}",
  );

  cy.wait("@createGlossary").its("request.body").should("deep.equal", {
    term: "Boat",
    definition: "A small vessel for traveling on water.",
  });

  cy.get("table").within(() => {
    cy.findByDisplayValue("Boat").should("be.visible");
    cy.findByDisplayValue("A small vessel for traveling on water.").should(
      "be.visible",
    );
  });
}

function executeUpdateGlossaryTermFlow() {
  cy.intercept("PUT", "/api/glossary/*").as("updateGlossary");

  cy.get("table").findByDisplayValue("Boat").clear().type("Kitten{enter}");
  cy.wait("@updateGlossary").its("request.body").should("deep.equal", {
    term: "Kitten",
    definition: "A small vessel for traveling on water.",
  });

  cy.get("table")
    .findByDisplayValue("A small vessel for traveling on water.")
    .clear()
    .type("Young cat{enter}");
  cy.wait("@updateGlossary")
    .its("request.body")
    .should("deep.equal", { term: "Kitten", definition: "Young cat" });

  cy.get("table").within(() => {
    cy.findByDisplayValue("Kitten").should("be.visible");
    cy.findByDisplayValue("Young cat").should("be.visible");
  });
}

function executeDeleteGlossaryTermFlow() {
  cy.intercept("DELETE", "/api/glossary/*").as("deleteGlossary");

  cy.get("table").within(() => {
    cy.findByDisplayValue("Kitten").should("be.visible").realHover();
    cy.findByRole("button", { name: /delete/i }).click();
  });

  cy.findByRole("dialog").within(() => {
    cy.findByRole("button", { name: /delete/i }).click();
  });

  cy.wait("@deleteGlossary");
  cy.get("table").findByDisplayValue("Kitten").should("not.exist");
}

describe("data reference > glossary", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  function visitGlossary() {
    cy.visit("/reference/glossary");
  }

  it("fetches existing definitions", () => {
    cy.intercept("GET", "/api/glossary", {
      statusCode: 200,
      body: {
        data: [
          { id: 1, term: "Alpha", definition: "First" },
          { id: 2, term: "Beta", definition: "Second" },
        ],
        can_write: true,
      },
    }).as("getGlossary");

    visitGlossary();

    cy.wait("@getGlossary");
    cy.get("table").within(() => {
      cy.findByDisplayValue("Alpha").should("be.visible");
      cy.findByDisplayValue("Beta").should("be.visible");
    });
  });
});

describe("data studio > glossary", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  function visitDataStudioGlossary() {
    H.DataModel.visitDataStudio();
    H.DataStudio.nav().findByLabelText("Glossary").click();
    cy.findByRole("heading", { name: "Glossary" }).should("be.visible");
  }

  it("should create, update, and delete definitions and track each operation", () => {
    visitDataStudioGlossary();
    executeCreateGlossaryTermFlow();
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_glossary_term_created",
    });

    executeUpdateGlossaryTermFlow();
    H.expectUnstructuredSnowplowEvent(
      { event: "data_studio_glossary_term_updated" },
      2,
    );

    executeDeleteGlossaryTermFlow();
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_glossary_term_deleted",
    });
  });
});
