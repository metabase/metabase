import {
  filterWidget,
  popover,
  restore,
  visitEmbeddedPage,
} from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > embedding > filters source", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("x", () => {
    cy.createNativeQuestion(getSourceQuestion()).then(({ body: { id } }) => {
      cy.createNativeQuestion(getQuestionWithQuestionSource(id)).then(
        ({ body: { id } }) => {
          visitEmbeddedPage({ resource: { question: id }, params: {} });
        },
      );
    });

    addFilter({ name: "Category", value: "Gadget" });
  });
});

const getSourceQuestion = () => ({
  name: "Source",
  native: {
    query: "select 'Gadget' union all select 'Widget'",
  },
});

const getEmbedQuestion = (sourceType, sourceConfig) => ({
  name: "Embed",
  native: {
    query: "select * from PRODUCTS where {{tag}}",
    "template-tags": {
      tag: {
        id: "93961154-c3d5-7c93-7b59-f4e494fda499",
        name: "tag",
        "display-name": "Category",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        values_source_type: sourceType,
        values_source_config: sourceConfig,
      },
    },
  },
  database: SAMPLE_DB_ID,
  enable_embedding: true,
  embedding_params: {
    tag: "enabled",
  },
});

const getQuestionWithQuestionSource = questionId => {
  return getEmbedQuestion("card", {
    card_id: questionId,
    value_field: ["field", "COLUMN", null],
  });
};

const addFilter = ({ name, value }) => {
  filterWidget().within(() => {
    cy.findByText(name).click();
  });

  popover().within(() => {
    cy.findByPlaceholderText("Enter some text").type(value);
    cy.button("Add filter").click();
  });
};
