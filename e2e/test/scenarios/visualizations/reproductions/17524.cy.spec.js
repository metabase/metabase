import {
  restore,
  filterWidget,
  filter,
  filterField,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const nativeQuestionDetails = {
  native: {
    query:
      "select * from (\nselect 'A' step, 41 users, 42 median union all\nselect 'B' step, 31 users, 32 median union all\nselect 'C' step, 21 users, 22 median union all\nselect 'D' step, 11 users, 12 median\n) x\n[[where users>{{num}}]]\n",
    "template-tags": {
      num: {
        id: "d7f1fb15-c7b8-6051-443d-604b6ed5457b",
        name: "num",
        "display-name": "Num",
        type: "number",
        default: null,
      },
    },
  },
  display: "funnel",
  visualization_settings: {
    "funnel.dimension": "STEP",
    "funnel.metric": "USERS",
  },
};

const questionDetails = {
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"], ["sum", ["field", PRODUCTS.PRICE, null]]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  display: "funnel",
  visualization_settings: {
    "funnel.metric": "count",
    "funnel.dimension": "CATEGORY",
  },
};

describe("issue 17524", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("scenario 1", () => {
    beforeEach(() => {
      cy.createNativeQuestion(nativeQuestionDetails, { visitQuestion: true });
    });

    it("should not alter visualization type when applying filter on a native question (metabase#17524-1)", () => {
      filterWidget().type("1");

      cy.get("polygon");

      cy.icon("play").last().click();

      cy.get("polygon");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").should("not.exist");
    });
  });

  describe("scenario 2", () => {
    beforeEach(() => {
      cy.createQuestion(questionDetails, { visitQuestion: true });
    });

    it("should not alter visualization type when applying filter on a QB question (metabase#17524-2)", () => {
      cy.get("polygon");

      filter();

      filterField("ID", {
        operator: "Greater than",
        value: "1",
      });
      cy.findByTestId("apply-filters").click();

      cy.get("polygon");
    });
  });
});
