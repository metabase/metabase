import {
  restore,
  mockSessionProperty,
  filterWidget,
  popover,
} from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS } = SAMPLE_DATASET;

const inputValue =
  "A long value that hides the close icon after reopening the filter widget";

const questionDetails = {
  native: {
    query: "{{filter}}",
    "template-tags": {
      filter: {
        id: "3ae0f2d7-c78e-a474-77b3-c3a827d8b919",
        name: "filter",
        "display-name": "Filter",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "string/=",
        default: inputValue,
      },
    },
  },
};

describe("issue 17751", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    mockSessionProperty("field-filter-operators-enabled?", true);

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("should handle long filter values correctly with the visible 'close' icon  (metabase#17751)", () => {
    filterWidget()
      .find(".Icon-close")
      .should("be.visible");

    cy.findByText(inputValue).click();

    popover()
      .contains(inputValue)
      .closest("li")
      .find(".Icon-close")
      .should("be.visible");
  });
});
