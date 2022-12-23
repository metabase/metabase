import { restore, filterWidget } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS } = SAMPLE_DATABASE;

const ORIGINAL_QUERY = "SELECT * FROM ORDERS WHERE {{filter}} LIMIT 2";

const filter = {
  id: "a3b95feb-b6d2-33b6-660b-bb656f59b1d7",
  name: "filter",
  "display-name": "Filter",
  type: "dimension",
  dimension: ["field", ORDERS.CREATED_AT, null],
  "widget-type": "date/all-options",
  default: null,
};

const nativeQuery = {
  name: "26861",
  native: {
    query: ORIGINAL_QUERY,
    "template-tags": {
      filter,
    },
  },
};

describe.skip("issue 26861", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(nativeQuery, { visitQuestion: true });
  });

  it("exclude filter shouldn't break native questions with field filters (metabase#26861)", () => {
    filterWidget().click();
    cy.findByText("Exclude...").click();

    cy.findByText("Days of the week...").click();
    cy.findByText("Tuesday").click();

    cy.button("Update filter").click();
    // In all other places in application, POST /api/dataset fires immediately after "Update filter"
    // A part of this bug is that we have to manually run the query so the next step will fail
    cy.wait("@dataset");

    cy.findByText("CREATED_AT excludes Tuesday");
    cy.findByText("117.03").should("not.exist");
  });
});
