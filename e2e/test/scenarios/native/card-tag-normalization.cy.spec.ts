const { H } = cy;

// The frontend names card template tags `#<card-id>-<slugg(card.name)>` (see NativeQuery.ts), but any
// `#<id>-<slug>` is accepted. The backend stores tag names verbatim on save — names are only rewritten
// during serdes import, when the referenced card's id changes. These tests pin the FE->BE->FE edit
// cycle: saving never errors and never rewrites what the frontend sent.

describe("scenarios > native > card template tag normalization", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("saves multiple differently-named references to the same card without erroring or rewriting", () => {
    H.createNativeQuestion({
      name: "Basic Aggregations",
      native: { query: 'SELECT COUNT(*) AS "count" FROM PEOPLE' },
    }).then(({ body: { id: cardId } }) => {
      H.startNewNativeQuestion({ query: "" });
      H.NativeEditor.type(
        `SELECT 1 FROM {{#${cardId}-foo}} AS a, {{#${cardId}-bar}} AS b`,
        { allowFastSet: true },
      );
      H.saveQuestion("Duplicate Card Refs", { wrapId: true });

      cy.get("@questionId").then((questionId) => {
        cy.request("GET", `/api/card/${questionId}`).then(({ body }) => {
          const query = JSON.stringify(body.dataset_query);
          expect(query).to.contain(`#${cardId}-foo`);
          expect(query).to.contain(`#${cardId}-bar`);
        });
      });
    });
  });

  it("reopens clean when the tag name matches what the frontend generated", () => {
    H.createNativeQuestion({
      name: "Bob's Café",
      native: { query: 'SELECT COUNT(*) AS "count" FROM PEOPLE' },
    }).then(({ body: { id: cardId } }) => {
      // slugg("Bob's Café") === "bobs-cafe", so this is the exact tag name the frontend generates
      const frontendTag = `#${cardId}-bobs-cafe`;

      H.startNewNativeQuestion({ query: "" });
      H.NativeEditor.type(`SELECT * FROM {{${frontendTag}}}`, {
        allowFastSet: true,
      });
      H.saveQuestion("Cafe Ref", { wrapId: true });

      cy.get("@questionId").then((questionId) => {
        H.visitQuestion(questionId);
      });
      cy.findByText("Open Editor").click();
      H.NativeEditor.get().should("contain", `{{${frontendTag}}}`);
      cy.findByTestId("qb-header").button("Save").should("not.exist");
    });
  });
});
