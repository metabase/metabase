import { restore } from "e2e/support/helpers";

const nativeQuery =
  "select * from products where created_at < {{max_date}} and created_at > {{from}} limit 5";

const questionDetails = {
  native: {
    query: nativeQuery,
    "template-tags": {
      max_date: {
        id: "32b7654f-38b1-2dfd-ded6-ed23c45ef5f6",
        name: "max_date",
        "display-name": "Max date",
        type: "date",
        default: "2030-01-01",
        required: true,
      },
      from: {
        id: "ddf7c404-38db-8b65-f90d-c6f4bd8127ec",
        name: "from",
        "display-name": "From",
        type: "date",
        default: "2022-10-02",
        required: true,
      },
    },
  },
};

describe("issue 35785", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.intercept("GET", "/api/search?*").as("getSearchResults");
  });

  it("should not redirect to the value of 'from' URL parameter after saving (metabase#35785)", () => {
    cy.findByTestId("native-query-editor-container")
      .findByTestId("visibility-toggler")
      .click();
    cy.findByTestId("native-query-editor").type("{backspace}4");

    cy.findByTestId("qb-header").findByRole("button", { name: "Save" }).click();

    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });

    cy.wait("@getSearchResults");

    cy.url().should("include", "/question");
  });
});
