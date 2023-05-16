import { restore } from "e2e/support/helpers";

const filterName = "Number comma";

const questionDetails = {
  native: {
    query: "select count(*) from orders where user_id in ({{number_comma}})",
    "template-tags": {
      number_comma: {
        id: "d8870111-7b0f-26f2-81ce-6ec911e54048",
        name: "number_comma",
        "display-name": filterName,
        type: "number",
      },
    },
  },
  display: "scalar",
};

describe("issue 21160", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("number filter should work with values separated by comma (metabase#21160)", () => {
    getInput().type("1,2,3{enter}", { delay: 0 });

    runQuery();
    resultAssertion("21");

    getInput().clear().type("123,456,789,321{enter}");

    runQuery();
    resultAssertion("18");
  });
});

function runQuery() {
  cy.findByTestId("qb-header").within(() => {
    cy.icon("play").click();
  });

  cy.wait("@cardQuery");
}

function resultAssertion(res) {
  cy.get(".ScalarValue").invoke("text").should("eq", res);
}

function getInput() {
  return cy.findByPlaceholderText(filterName);
}
