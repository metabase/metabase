import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  runNativeQuery,
  saveSavedQuestion,
} from "e2e/support/helpers";

const { PRODUCTS } = SAMPLE_DATABASE;

describe("issue 33208", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createNativeQuestion(
      {
        native: {
          query:
            "select distinct category from products where {{category}} order by category",
          "template-tags": {
            category: {
              type: "dimension",
              name: "category",
              id: "82e3e985-5bd8-4503-a628-15201bad321b",
              "display-name": "Category",
              required: true,
              default: ["Doohickey", "Gizmo"],
              dimension: ["field", PRODUCTS.CATEGORY, null],
              "widget-type": "string/=",
            },
          },
        },
        display: "scalar",
      },
      { visitQuestion: true },
    );
  });

  it("should not auto-select chart type when opening a saved native question with parameters that have default values (metabase#33208)", () => {
    // The default value for the category parameter is ["Doohickey","Gizmo"], which means the query results should have two rows, meaning
    // scalar is not a sensible chart type. Normally the chart type would be automatically changed to table, but this shouldn't happen.
    cy.findByTestId("scalar-value").should("be.visible");
  });

  it("should not auto-select chart type when saving a native question with parameters that have default values", () => {
    cy.findByTestId("query-builder-main").findByText("Open Editor").click();
    cy.get(".ace_editor").type(" ");
    saveSavedQuestion("top category");
    runNativeQuery({ wait: false });
    cy.findByTestId("scalar-value").should("be.visible");
  });
});
