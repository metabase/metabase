import { restore, mockSessionProperty } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS } = SAMPLE_DATASET;

const filter = {
  id: "7795c137-a46c-3db9-1930-1d690c8dbc03",
  name: "filter",
  "display-name": "Filter",
  type: "dimension",
  dimension: ["field", PRODUCTS.CATEGORY, null],
  "widget-type": "string/=",
  default: null,
};

describe("issue 16739", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    mockSessionProperty("field-filter-operators-enabled?", true);
  });

  ["normal", "nodata"].forEach(user => {
    //Very related to the metabase#15981, only this time the issue happens with the "Field Filter" without the value being set.
    it(`filter feature flag shouldn't cause run-overlay of results in native editor for ${user} user (metabase#16739)`, () => {
      cy.createNativeQuestion({
        native: {
          query: "select * from PRODUCTS where {{ filter }}",
          "template-tags": { filter },
        },
      }).then(({ body: { id } }) => {
        cy.intercept("POST", `/api/card/${id}/query`).as("cardQuery");

        if (user === "nodata") {
          cy.signOut();
          cy.signIn(user);
        }

        cy.visit(`/question/${id}`);
        cy.wait("@cardQuery");
      });

      cy.icon("play").should("not.exist");
    });
  });
});
