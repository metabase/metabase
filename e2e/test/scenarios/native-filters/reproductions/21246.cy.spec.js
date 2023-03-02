import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  query: { "source-table": PRODUCTS_ID },
};

describe("issue 21246", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      const cardTagName = "#" + id;

      const nativeQuestionDetails = {
        native: {
          query: `with exclude_products as {{${cardTagName}}}\nselect count(*) from orders where true [[and {{filter}}]] [[and orders.created_at::date={{datevariable}}]]`,
          "template-tags": {
            filter: {
              id: "e1c37b07-7a85-1df9-a5e4-a0bf748e6dcf",
              name: "filter",
              "display-name": "Field Filter",
              type: "dimension",
              dimension: ["field", ORDERS.CREATED_AT, null],
              "widget-type": "date/month-year",
              default: null,
            },
            datevariable: {
              id: "d4a5fc2d-b223-a5ec-9436-bf6ea5e6b8bf",
              name: "datevariable",
              "display-name": "Date Variable",
              type: "date",
              default: null,
            },
            [cardTagName]: {
              id: "3a0be5e9-e46f-f34f-8e1b-f91567ca4317",
              name: cardTagName,
              "display-name": cardTagName,
              type: "card",
              "card-id": id,
            },
          },
        },
        display: "scalar",
      };

      cy.createNativeQuestion(nativeQuestionDetails, {
        wrapId: true,
      });

      cy.get("@questionId").then(id => {
        cy.visit(`/question/${id}`);
        cy.wait("@dataset");

        cy.get(".ScalarValue").invoke("text").should("eq", "18,760");
      });
    });
  });

  it("should be able to use sub-query referencing a GUI question and date based filters (metabase#21246)", () => {
    const fieldFilterValue = "filter=2018-02";
    const dateFilterValue = "datevariable=2018-02-19";

    cy.get("@questionId").then(id => {
      // Let's set filter values directly through URL, rather than through the UI
      // for the sake of speed and reliability
      cy.visit(`/question/${id}?${fieldFilterValue}`);
      cy.wait("@dataset");

      resultAssertion("404");

      cy.visit(`/question/${id}?${fieldFilterValue}&${dateFilterValue}`);
      cy.wait("@dataset");

      resultAssertion("12");
    });
  });
});

function resultAssertion(res) {
  cy.get(".ScalarValue").invoke("text").should("eq", res);
}
