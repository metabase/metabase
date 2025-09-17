// e2e/test/scenarios/data-reference/glossary.cy.spec.ts
// Tests for Data Reference > Glossary feature: fetch, create, update, delete

const { H } = cy;

describe("data reference > glossary", () => {
  beforeEach(() => {
    // Reset state and sign in
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
    cy.intercept("POST", "/api/glossary", (req) => {
      expect(req.body).to.deep.equal({
        term: "Bird",
        definition: "A thing with wings.",
      });
    }).as("createGlossary");

    visitGlossary();

    cy.findByRole("button", { name: /new term/i }).click();

    cy.findByPlaceholderText(/bird/i).type("  Bird  ");
    cy.findByPlaceholderText(/a warm-blooded.*/i).type(
      "  A thing with wings.  ",
    );

    cy.findByLabelText("Save").click();

    cy.wait("@createGlossary");

    cy.get("table").within(() => {
      cy.findByText("Bird").should("be.visible");
      cy.findByText("A thing with wings.").should("be.visible");
    });
  });

  it("updates an existing definition and makes PUT /api/glossary/:id", () => {
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

      visitGlossary();

      cy.get("table").within(() => {
        cy.findByText("Cat").click();
      });

      cy.findByPlaceholderText(/bird/i).clear().type("Kitten");
      cy.findByPlaceholderText(/a warm-blooded.*/i)
        .clear()
        .type("Young cat");

      cy.findByRole("button", { name: /save/i }).click();

      cy.wait("@updateGlossary");

      cy.get("table").within(() => {
        cy.findByText("Kitten").should("be.visible");
        cy.findByText("Young cat").should("be.visible");
      });
    });
  });

  it("deletes an existing definition and makes DELETE /api/glossary/:id", () => {
    cy.request("POST", "/api/glossary", {
      term: "DeleteMe",
      definition: "To be removed",
    }).then(({ body }) => {
      const { id } = body;
      cy.intercept("DELETE", `/api/glossary/${id}`).as("deleteGlossary");

      visitGlossary();

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
  });
});
