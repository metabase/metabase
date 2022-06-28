import { restore, visitEmbeddedPage } from "__support__/e2e/helpers";

const defaultFilterValues = [undefined, "10"];

defaultFilterValues.forEach(value => {
  const conditionalPartOfTestTitle = value
    ? "and the required filter with the default value"
    : "";

  describe("issue 20845", () => {
    beforeEach(() => {
      cy.intercept("PUT", "/api/card/*").as("publishChanges");

      restore();
      cy.signInAsAdmin();

      const questionDetails = getQuestionDetails(value);

      cy.createNativeQuestion(questionDetails, {
        visitQuestion: true,
        wrapId: true,
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

      cy.button("Publish").click();
      cy.wait(["@publishChanges", "@publishChanges"]);

      cy.signOut();
    });

    it(`locked parameter should work with numeric values ${conditionalPartOfTestTitle} (metabase#20845)`, () => {
      // This issue is not possible to reproduce using UI from this point on.
      // We have to manually send the payload in order to make sure it works for both strings and integers.
      ["string", "integer"].forEach(type => {
        cy.log(`Make sure it works with ${type.toUpperCase()} in the payload`);

        cy.get("@questionId").then(questionId => {
          visitEmbeddedPage({
            resource: { question: questionId },
            params: {
              qty_locked: type === "string" ? "15" : 15, // IMPORTANT: integer
            },
          });
        });

        cy.findByTestId("column-header").should("contain", "COUNT(*)");
        cy.findByTestId("cell-data").should("contain", "5");
      });
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
