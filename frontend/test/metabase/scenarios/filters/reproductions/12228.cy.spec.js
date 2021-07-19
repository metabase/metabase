import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS } = SAMPLE_DATASET;

const filter = {
  id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
  name: "created_at",
  "display-name": "Created at",
  type: "dimension",
  dimension: ["field", ORDERS.CREATED_AT, null],
  "widget-type": "date/month-year",
};

const nativeQuery = {
  name: "12228",
  native: {
    query: "select count(*) from orders where {{created_at}}",
    "template-tags": {
      created_at: filter,
    },
  },
  display: "scalar",
};

describe("issue 12228", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("can load a question with a date filter (metabase#12228)", () => {
    cy.createNativeQuestion(nativeQuery).then(response => {
      cy.visit(`/question/${response.body.id}?created_at=2020-01`);
      cy.contains("580");
    });
  });
});
