const { H } = cy;

function executeCreateGlossaryTermFlow() {
  cy.intercept("POST", "/api/glossary", (req) => {
    expect(req.body).to.deep.equal({
      term: "Boat",
      definition: "A small vessel for traveling on water.",
    });
  }).as("createGlossary");

  cy.findByRole("button", { name: /new term/i }).click();

  cy.findByPlaceholderText(/boat/i).type("  Boat  ");
  cy.findByPlaceholderText(/a small vessel.*/i).type(
    "  A small vessel for traveling on water.  ",
  );

  cy.findByLabelText("Save").click();

  cy.wait("@createGlossary");

  cy.get("table").within(() => {
    cy.findByText("Boat").should("be.visible");
    cy.findByText("A small vessel for traveling on water.").should(
      "be.visible",
    );
  });
}

function executeUpdateGlossaryTermFlow(visitPageFn: VoidFunction) {
  cy.request("POST", "/api/glossary", {
    term: "Cat",
    definition: "Meows",
  }).then(({ body }) => {
    const { id } = body;

    cy.intercept("PUT", `/api/glossary/${id}`, (req) => {
      expect(req.body).to.deep.equal({
        term: "Kitten",
        definition: "Young cat",
      });
    }).as("updateGlossary");

    visitPageFn();

    cy.get("table").within(() => {
      cy.findByText("Cat").click();
    });

    cy.findByPlaceholderText(/boat/i).clear().type("Kitten");
    cy.findByPlaceholderText(/a small vessel.*/i)
      .clear()
      .type("Young cat");

    cy.findByRole("button", { name: /save/i }).click();

    cy.wait("@updateGlossary");

    cy.get("table").within(() => {
      cy.findByText("Kitten").should("be.visible");
      cy.findByText("Young cat").should("be.visible");
    });
  });
}

function executeDeleteGlossaryTermFlow(visitPageFn: VoidFunction) {
  cy.request("POST", "/api/glossary", {
    term: "DeleteMe",
    definition: "To be removed",
  }).then(({ body }) => {
    const { id } = body;
    cy.intercept("DELETE", `/api/glossary/${id}`).as("deleteGlossary");

    visitPageFn();

    cy.get("table").within(() => {
      cy.findByText("DeleteMe").should("be.visible").realHover();
      cy.findByRole("button", { name: /delete/i }).click();
    });

    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: /delete/i }).click();
    });

    cy.wait("@deleteGlossary");

    cy.get("table").within(() => {
      cy.findByText("DeleteMe").should("not.exist");
    });
  });
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
      },
    }).as("getGlossary");

    visitGlossary();

    cy.wait("@getGlossary");
    cy.get("table").within(() => {
      cy.findByText("Alpha").should("be.visible");
      cy.findByText("Beta").should("be.visible");
    });
  });

  it("creates a new definition and makes POST /api/glossary with trimmed values", () => {
    visitGlossary();
    executeCreateGlossaryTermFlow();
  });

  it("updates an existing definition and makes PUT /api/glossary/:id", () => {
    executeUpdateGlossaryTermFlow(visitGlossary);
  });

  it("deletes an existing definition and makes DELETE /api/glossary/:id", () => {
    executeDeleteGlossaryTermFlow(visitGlossary);
  });
});

describe("data studio > glossary", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  function visitDataStudioGlossary() {
    H.DataModel.visitDataStudio();
    H.DataStudio.nav().findByLabelText("Glossary").click();
    cy.findByRole("heading", { name: "Glossary" }).should("be.visible");
  }

  it("should allow creating a new definition and trigger tracking event", () => {
    visitDataStudioGlossary();
    executeCreateGlossaryTermFlow();
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_glossary_term_created",
    });
  });

  it("should allow updating an existing definition and trigger tracking event", () => {
    executeUpdateGlossaryTermFlow(visitDataStudioGlossary);
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_glossary_term_updated",
    });
  });

  it("should allow deleting an existing definition and trigger tracking event", () => {
    executeDeleteGlossaryTermFlow(visitDataStudioGlossary);
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_glossary_term_deleted",
    });
  });
});
