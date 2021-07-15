import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS } = SAMPLE_DATASET;

const filter = {
  id: "774521fb-e03f-3df1-f2ae-e952c97035e3",
  name: "FILTER",
  "display-name": "Filter",
  type: "dimension",
  dimension: ["field-id", PRODUCTS.CATEGORY],
  "widget-type": "category",
  default: null,
};

const nativeQuery = {
  name: "14145",
  native: {
    query: "SELECT COUNT(*) FROM products WHERE {{filter}}",
    "template-tags": {
      filter,
    },
  },
};

describe.skip("issue 14145", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.addH2SampleDataset({
      name: "Sample2",
      auto_run_queries: true,
      is_full_sync: true,
    });

    cy.createNativeQuestion(nativeQuery).then(({ body }) => {
      cy.visit(`/question/${body.id}`);
    });
  });

  it("`field-id` should update when database source is changed (metabase#14145)", () => {
    // Change the source from "Sample Dataset" to the other database
    cy.findByText(/Open Editor/i).click();

    cy.get(".GuiBuilder-data")
      .as("source")
      .contains("Sample Dataset")
      .click();
    cy.findByText("Sample2").click();

    // First assert on the UI
    cy.icon("variable").click();
    cy.findByText(/Field to map to/)
      .siblings("a")
      .contains("Category");

    // Rerun the query and assert on the dimension (field-id) that didn't change
    cy.get(".NativeQueryEditor .Icon-play").click();

    cy.wait("@dataset").then(xhr => {
      const { dimension } = xhr.response.body.json_query.native[
        "template-tags"
      ].FILTER;

      expect(dimension).not.to.contain(PRODUCTS.CATEGORY);
    });
  });
});
