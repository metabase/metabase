import { restore, visitQuestion } from "__support__/e2e/cypress";

const defaultFilterValues = [undefined, "10"];

describe.skip("issue 20845", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  defaultFilterValues.forEach(value => {
    const conditionalPartOfTestTitle = value
      ? "and the required filter with the default value"
      : "";

    it(`locked parameter should work with numeric values ${conditionalPartOfTestTitle} (metabase#20845)`, () => {
      const questionDetails = getQuestionDetails(value);

      cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
        cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

        visitQuestion(id);
      });

      cy.icon("share").click();
      cy.findByText("Embed this question in an application").click();

      cy.findByText("Disabled").click();
      cy.findByText("Locked").click();

      cy.findByText("Preview Locked Parameters")
        .parent()
        .within(() => {
          cy.findByPlaceholderText("Qty locked").type("15{enter}");
        });

      cy.document().then(doc => {
        const iframe = doc.querySelector("iframe");

        cy.signOut();
        cy.visit(iframe.src);
      });

      cy.findByText("COUNT(*)");
      cy.findByText("5");
    });
  });
});

/**
 * @param {string} defaultValue - The default value for the defined filter
 * @returns object
 */
function getQuestionDetails(defaultValue = undefined) {
  return {
    name: "20845",
    native: {
      "template-tags": {
        qty_locked: {
          id: "6bd8d7be-bd5b-382c-cfa2-683461891663",
          name: "qty_locked",
          "display-name": "Qty locked",
          type: "number",
          required: defaultValue ? true : false,
          default: defaultValue,
        },
      },
      query: "select count(*) from orders where quantity={{qty_locked}}",
    },
  };
}
