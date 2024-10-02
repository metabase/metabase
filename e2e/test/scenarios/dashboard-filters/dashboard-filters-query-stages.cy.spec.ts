import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createDashboardWithTabs,
  createQuestion,
  editDashboard,
  getDashboardCard,
  popover,
  restore,
  visitDashboard,
} from "e2e/support/helpers";
import type {
  Card,
  ConcreteFieldReference,
  StructuredQuery,
} from "metabase-types/api";

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

const CARD_HEIGHT = 4;
const CARD_WIDTH = 12;

const DATE_PARAMETER = {
  name: "Date",
  slug: "date",
  id: "717a5624",
  type: "date/all-options",
  sectionId: "date",
};

const TEXT_PARAMETER = {
  name: "Text",
  slug: "text",
  id: "76817b51",
  type: "string/=",
  sectionId: "string",
};

const NUMBER_PARAMETER = {
  name: "Number",
  slug: "number",
  id: "f5944ad9",
  type: "number/=",
  sectionId: "number",
};

const TOTAL_FIELD: ConcreteFieldReference = [
  "field",
  "TOTAL",
  {
    "base-type": "type/Float",
  },
];

const TAX_FIELD: ConcreteFieldReference = [
  "field",
  "TAX",
  {
    "base-type": "type/Float",
  },
];

const PRODUCT_ID_FIELD: ConcreteFieldReference = [
  "field",
  "PRODUCT_ID",
  {
    "base-type": "type/Float",
  },
];

const ORDERS_DATE_COLUMNS = ["Created At"];
const ORDERS_NUMBER_COLUMNS = [
  "Subtotal",
  "Tax",
  "Total",
  "Discount",
  "Quantity",
];

const PRODUCTS_DATE_COLUMNS = ["Created At"];
const PRODUCTS_TEXT_COLUMNS = ["Ean", "Title", "Category", "Vendor"];
const PRODUCTS_NUMBER_COLUMNS = ["Price", "Rating"];

const PEOPLE_DATE_COLUMNS = ["Birth Date", "Created At"];
const PEOPLE_TEXT_COLUMNS = ["Address", "Email", "Password", "Name", "Source"];
const PEOPLE_NUMBER_COLUMNS = ["Longitude", "Latitude"];

const REVIEWS_DATE_COLUMNS = ["Created At"];
const REVIEWS_TEXT_COLUMNS = ["Reviewer", "Body"];
const REVIEWS_NUMBER_COLUMNS = ["Rating"];

const QUESTION_BASED_QUESTION_INDEX = 0;
const MODEL_BASED_QUESTION_INDEX = 1;
const QUESTION_BASED_MODEL_INDEX = 2;
const MODEL_BASED_MODEL_INDEX = 3;

/**
 * Empty section title element is rendered.
 * See https://github.com/metabase/metabase/issues/47218
 */
const NAMELESS_SECTION = "";

/**
 * Abbreviations used for card aliases in this test suite:
 *  qbq = question-based question
 *  qbm = question-based model
 *  mbq = model-based question
 *  mbm = model-based model
 */
describe("scenarios > dashboard > filters > query stages", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    createBaseQuestions();
  });

  // Sanity checks. If the base queries tests fail then something is very wrong.
  describe("base queries", () => {
    const ORDERS_QUESTION_INDEX = 0;
    const BASE_QUESTION_INDEX = 1;
    const BASE_MODEL_INDEX = 2;

    beforeEach(() => {
      cy.then(function () {
        createAndVisitDashboard([
          this.ordersQuestion,
          this.baseQuestion,
          this.baseModel,
        ]);
      });
    });

    it("allows to map to all relevant columns", () => {
      editDashboard();

      cy.log("## date columns");
      getFilter("Date").click();
      verifyDateMappingOptions();

      cy.log("## text columns");
      getFilter("Text").click();
      verifyTextMappingOptions();

      cy.log("## number columns");
      getFilter("Number").click();
      verifyNumberMappingOptions();
    });

    function verifyDateMappingOptions() {
      verifyDashcardMappingOptions(ORDERS_QUESTION_INDEX, [
        ["Orders", ORDERS_DATE_COLUMNS],
        ["Product", PRODUCTS_DATE_COLUMNS],
        ["User", PEOPLE_DATE_COLUMNS],
      ]);
      verifyDashcardMappingOptions(BASE_QUESTION_INDEX, [
        ["Q0 Orders", ORDERS_DATE_COLUMNS],
        ["Product", PRODUCTS_DATE_COLUMNS],
        ["User", PEOPLE_DATE_COLUMNS],
      ]);
      verifyDashcardMappingOptions(BASE_MODEL_INDEX, [
        ["Base Orders Model", ORDERS_DATE_COLUMNS],
        ["Product", PRODUCTS_DATE_COLUMNS],
        ["User", PEOPLE_DATE_COLUMNS],
      ]);
    }

    function verifyTextMappingOptions() {
      verifyDashcardMappingOptions(ORDERS_QUESTION_INDEX, [
        ["Product", PRODUCTS_TEXT_COLUMNS],
        ["User", PEOPLE_TEXT_COLUMNS],
      ]);
      verifyDashcardMappingOptions(BASE_QUESTION_INDEX, [
        ["Product", PRODUCTS_TEXT_COLUMNS],
        ["User", PEOPLE_TEXT_COLUMNS],
      ]);
      verifyDashcardMappingOptions(BASE_MODEL_INDEX, [
        ["Product", PRODUCTS_TEXT_COLUMNS],
        ["User", PEOPLE_TEXT_COLUMNS],
      ]);
    }

    function verifyNumberMappingOptions() {
      verifyDashcardMappingOptions(ORDERS_QUESTION_INDEX, [
        ["Orders", ORDERS_NUMBER_COLUMNS],
        ["Product", PRODUCTS_NUMBER_COLUMNS],
        ["User", PEOPLE_NUMBER_COLUMNS],
      ]);
      verifyDashcardMappingOptions(BASE_QUESTION_INDEX, [
        ["Q0 Orders", ORDERS_NUMBER_COLUMNS],
        ["Product", PRODUCTS_NUMBER_COLUMNS],
        ["User", PEOPLE_NUMBER_COLUMNS],
      ]);
      verifyDashcardMappingOptions(BASE_MODEL_INDEX, [
        ["Base Orders Model", ORDERS_NUMBER_COLUMNS],
        ["Product", PRODUCTS_NUMBER_COLUMNS],
        ["User", PEOPLE_NUMBER_COLUMNS],
      ]);
    }
  });

  describe("1-stage queries", () => {
    describe("Q1 - join, custom column, no aggregations, no breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ1Query);
      });

      it("allows to map to all relevant columns", () => {
        editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();
      });

      function verifyDateMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Reviews", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Reviews", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [
            "Question-based Model",
            [...ORDERS_DATE_COLUMNS, "Reviews - Product → Created At"],
          ],
          ["Product", PRODUCTS_DATE_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_DATE_COLUMNS],
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [
            "Model-based Model",
            [...ORDERS_DATE_COLUMNS, "Reviews - Product → Created At"],
          ],
          ["Product", PRODUCTS_DATE_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_DATE_COLUMNS],
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
      }

      function verifyTextMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Reviews", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Reviews", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [
            "Question-based Model",
            ["Reviews - Product → Reviewer", "Reviews - Product → Body"],
          ],
          ["Product", PRODUCTS_TEXT_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_TEXT_COLUMNS],
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [
            "Model-based Model",
            ["Reviews - Product → Reviewer", "Reviews - Product → Body"],
          ],
          ["Product", PRODUCTS_TEXT_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_TEXT_COLUMNS],
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
      }

      function verifyNumberMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", REVIEWS_NUMBER_COLUMNS],
          [
            "Product",
            [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // https://github.com/metabase/metabase/issues/46845
          ],
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", REVIEWS_NUMBER_COLUMNS],
          [
            "Product",
            [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // https://github.com/metabase/metabase/issues/46845
          ],
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [
            "Question-based Model",
            [...ORDERS_NUMBER_COLUMNS, "Net", "Reviews - Product → Rating"],
          ],
          ["Product", PRODUCTS_NUMBER_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_NUMBER_COLUMNS],
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [
            "Model-based Model",
            [...ORDERS_NUMBER_COLUMNS, "Net", "Reviews - Product → Rating"],
          ],
          ["Product", PRODUCTS_NUMBER_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_NUMBER_COLUMNS],
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
      }
    });

    describe("Q2 - join, custom column, 2 aggregations, no breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ2Query);
      });

      it("allows to map to all relevant columns (metabase#47184)", () => {
        editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();
      });

      function verifyDateMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Reviews", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Reviews", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyNoDashcardMappingOptions(2);
        verifyNoDashcardMappingOptions(3);
      }

      function verifyTextMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Reviews", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Reviews", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyNoDashcardMappingOptions(2);
        verifyNoDashcardMappingOptions(3);
      }

      function verifyNumberMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Count", "Sum of Total"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Count", "Sum of Total"]],
        ]);
      }
    });

    describe("Q3 - join, custom column, no aggregations, 2 breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ3Query);
      });

      it("allows to map to all relevant columns", () => {
        editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();
      });

      function verifyDateMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Reviews", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Reviews", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Created At", "User → Created At"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Created At", "User → Created At"]],
        ]);
      }

      function verifyTextMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Reviews", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Reviews", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Product → Category"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Product → Category"]],
        ]);
      }

      function verifyNumberMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyNoDashcardMappingOptions(2);
        verifyNoDashcardMappingOptions(3);
      }
    });

    describe("Q4 - join, custom column, 2 aggregations, 2 breakouts (metabase#47184)", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ4Query);
      });

      it("allows to map to all relevant columns", () => {
        editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();
      });

      function verifyDateMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Reviews", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Reviews", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Created At", "User → Created At"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Created At", "User → Created At"]],
        ]);
      }

      function verifyTextMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Reviews", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Reviews", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category"]],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Product → Category"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Product → Category"]],
        ]);
      }

      function verifyNumberMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
          ["Summaries", ["Count", "Sum of Total"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
          ["Summaries", ["Count", "Sum of Total"]],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Count", "Sum of Total"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Count", "Sum of Total"]],
        ]);
      }
    });
  });

  describe("2-stage queries", () => {
    describe("Q5 - join, custom column, no aggregations, no breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ5Query);
      });

      it("allows to map to all relevant columns", () => {
        editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();
      });

      function verifyDateMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, [...ORDERS_DATE_COLUMNS, "User → Created At"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, [...ORDERS_DATE_COLUMNS, "User → Created At"]],
        ]);
      }

      function verifyTextMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category"]],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Product → Category"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Product → Category"]],
        ]);
      }

      function verifyNumberMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]],
          [
            "Product",
            [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // https://github.com/metabase/metabase/issues/46845
          ],
          ["User", PEOPLE_NUMBER_COLUMNS],
          ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]],
          [
            "Product",
            [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // https://github.com/metabase/metabase/issues/46845
          ],
          ["User", PEOPLE_NUMBER_COLUMNS],
          ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Count", "Sum of Total", "5 * Count"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Count", "Sum of Total", "5 * Count"]],
        ]);
      }
    });

    describe("Q6 - join, custom column, 2 aggregations, no breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ6Query);
      });

      it("allows to map to all relevant columns", () => {
        editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();
      });

      function verifyDateMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyNoDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX);
        verifyNoDashcardMappingOptions(MODEL_BASED_MODEL_INDEX);
      }

      function verifyTextMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category"]],
        ]);
        verifyNoDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX);
        verifyNoDashcardMappingOptions(MODEL_BASED_MODEL_INDEX);
      }

      function verifyNumberMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]],
          [
            "Product",
            [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // https://github.com/metabase/metabase/issues/46845
          ],
          ["User", PEOPLE_NUMBER_COLUMNS],
          ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]],
          [
            "Product",
            [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // https://github.com/metabase/metabase/issues/46845
          ],
          ["User", PEOPLE_NUMBER_COLUMNS],
          ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [
            NAMELESS_SECTION,
            ["Count", "Sum of Reviews - Created At: Month → Rating"],
          ],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [
            NAMELESS_SECTION,
            ["Count", "Sum of Reviews - Created At: Month → Rating"],
          ],
        ]);
      }
    });

    describe("Q7 - join, custom column, no aggregations, 2 breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ7Query);
      });

      it("allows to map to all relevant columns", () => {
        editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();
      });

      function verifyDateMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyNoDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX);
        verifyNoDashcardMappingOptions(MODEL_BASED_MODEL_INDEX);
      }

      function verifyTextMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category"]],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [
            NAMELESS_SECTION,
            [
              "Reviews - Created At: Month → Reviewer",
              "Products Via Product ID Category",
            ],
          ],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [
            NAMELESS_SECTION,
            [
              "Reviews - Created At: Month → Reviewer",
              "Products Via Product ID Category",
            ],
          ],
        ]);
      }

      function verifyNumberMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]],
          [
            "Product",
            [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // https://github.com/metabase/metabase/issues/46845
          ],
          ["User", PEOPLE_NUMBER_COLUMNS],
          ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]],
          [
            "Product",
            [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // https://github.com/metabase/metabase/issues/46845
          ],
          ["User", PEOPLE_NUMBER_COLUMNS],
          ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
        ]);
        verifyNoDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX);
        verifyNoDashcardMappingOptions(MODEL_BASED_MODEL_INDEX);
      }
    });

    describe("Q8 - join, custom column, 2 aggregations, 2 breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ8Query);
      });

      it("allows to map to all relevant columns", () => {
        editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();
      });

      function verifyDateMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyNoDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX);
        verifyNoDashcardMappingOptions(MODEL_BASED_MODEL_INDEX);
      }

      function verifyTextMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category", "Reviewer", "Category"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category", "Reviewer", "Category"]],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [
            NAMELESS_SECTION,
            [
              "Reviews - Created At: Month → Reviewer",
              "Products Via Product ID Category",
            ],
          ],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [
            NAMELESS_SECTION,
            [
              "Reviews - Created At: Month → Reviewer",
              "Products Via Product ID Category",
            ],
          ],
        ]);
      }

      function verifyNumberMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
          [
            "Summaries",
            ["Count", "Sum of Total", "5 * Count", "Count", "Sum of Rating"],
          ],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
          [
            "Summaries",
            ["Count", "Sum of Total", "5 * Count", "Count", "Sum of Rating"],
          ],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [
            NAMELESS_SECTION,
            ["Count", "Sum of Reviews - Created At: Month → Rating"],
          ],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [
            NAMELESS_SECTION,
            ["Count", "Sum of Reviews - Created At: Month → Rating"],
          ],
        ]);
      }
    });
  });

  describe("3-stage queries", () => {
    describe("Q9 - join, custom column, 2 aggregations, 2 breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ9Query);
      });

      it("allows to map to all relevant columns", () => {
        editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();
      });

      function verifyDateMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyNoDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX);
        verifyNoDashcardMappingOptions(MODEL_BASED_MODEL_INDEX);
      }

      function verifyTextMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category", "Reviewer", "Category"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category", "Reviewer", "Category"]],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [
            NAMELESS_SECTION,
            [
              "Reviews - Created At: Month → Reviewer",
              "Products Via Product ID Category",
            ],
          ],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [
            NAMELESS_SECTION,
            [
              "Reviews - Created At: Month → Reviewer",
              "Products Via Product ID Category",
            ],
          ],
        ]);
      }

      function verifyNumberMappingOptions() {
        verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
          [
            "Summaries",
            ["Count", "Sum of Total", "5 * Count", "Count"], // https://github.com/metabase/metabase/issues/46845 - 2nd Count should be in "Summaries (2)" group
          ],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
          [
            "Summaries",
            ["Count", "Sum of Total", "5 * Count", "Count"], // https://github.com/metabase/metabase/issues/46845 - 2nd Count should be in "Summaries (2)" group
          ],
        ]);
        verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Count"]],
        ]);
        verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
          [NAMELESS_SECTION, ["Count"]],
        ]);
      }
    });
  });
});

function createBaseQuestions() {
  createQuestion({
    type: "question",
    name: "Q0 Orders",
    description: "Question based on a database table",
    query: {
      "source-table": ORDERS_ID,
    },
  }).then(response => cy.wrap(response.body).as("ordersQuestion"));

  cy.then(function () {
    createQuestion({
      type: "question",
      name: "Base Orders Question",
      query: {
        "source-table": `card__${this.ordersQuestion.id}`,
      },
    }).then(response => cy.wrap(response.body).as("baseQuestion"));

    createQuestion({
      type: "model",
      name: "Base Orders Model",
      query: {
        "source-table": `card__${this.ordersQuestion.id}`,
      },
    }).then(response => cy.wrap(response.body).as("baseModel"));
  });
}

// Q1 - join, custom column, no aggregations, no breakouts
function createQ1Query(source: Card): StructuredQuery {
  return {
    "source-table": `card__${source.id}`,
    expressions: {
      Net: ["-", TOTAL_FIELD, TAX_FIELD],
    },
    joins: [
      {
        fields: "all",
        strategy: "left-join",
        alias: "Reviews - Product",
        condition: [
          "=",
          PRODUCT_ID_FIELD,
          [
            "field",
            "PRODUCT_ID",
            {
              "base-type": "type/Integer",
              "join-alias": "Reviews - Product",
            },
          ],
        ],
        "source-table": REVIEWS_ID,
      },
    ],
  };
}

// Q2 - join, custom column, 2 aggregations, no breakouts
function createQ2Query(source: Card): StructuredQuery {
  return {
    ...createQ1Query(source),
    aggregation: [["count"], ["sum", TOTAL_FIELD]],
  };
}

// Q3 - join, custom column, no aggregations, 2 breakouts
function createQ3Query(source: Card): StructuredQuery {
  return {
    ...createQ1Query(source),
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        {
          "base-type": "type/DateTime",
          "temporal-unit": "month",
        },
      ],
      [
        "field",
        PRODUCTS.CATEGORY,
        {
          "base-type": "type/Text",
          "source-field": ORDERS.PRODUCT_ID,
        },
      ],
      [
        "field",
        PEOPLE.CREATED_AT,
        {
          "base-type": "type/DateTime",
          "temporal-unit": "year",
          "source-field": ORDERS.USER_ID,
        },
      ],
    ],
  };
}

// Q4 - join, custom column, 2 aggregations, 2 breakouts
function createQ4Query(source: Card): StructuredQuery {
  return {
    ...createQ3Query(source),
    aggregation: [["count"], ["sum", TOTAL_FIELD]],
  };
}

// Q5 - Q4 + 2nd stage with join, custom column, no aggregations, no breakouts
function createQ5Query(source: Card): StructuredQuery {
  return {
    "source-query": createQ4Query(source),
    expressions: {
      "5 * Count": [
        "*",
        5,
        [
          "field",
          "count",
          {
            "base-type": "type/Integer",
          },
        ],
      ],
    },
    joins: [
      {
        strategy: "left-join",
        alias: "Reviews - Created At: Month",
        condition: [
          "=",
          [
            "field",
            "CREATED_AT",
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
            },
          ],
          [
            "field",
            REVIEWS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
              "join-alias": "Reviews - Created At: Month",
            },
          ],
        ],
        "source-table": REVIEWS_ID,
      },
    ],
  };
}

// Q6 - Q4 + 2nd stage with join, custom column, 2 aggregations, no breakouts
function createQ6Query(source: Card): StructuredQuery {
  return {
    ...createQ5Query(source),
    aggregation: [
      ["count"],
      [
        "sum",
        [
          "field",
          REVIEWS.RATING,
          {
            "base-type": "type/Integer",
            "join-alias": "Reviews - Created At: Month",
          },
        ],
      ],
    ],
  };
}

// Q7 - Q4 + 2nd stage with join, custom column, no aggregations, 2 breakouts
function createQ7Query(source: Card): StructuredQuery {
  return {
    ...createQ5Query(source),
    breakout: [
      [
        "field",
        REVIEWS.REVIEWER,
        {
          "base-type": "type/Text",
          "join-alias": "Reviews - Created At: Month",
        },
      ],
      [
        "field",
        "PRODUCTS__via__PRODUCT_ID__CATEGORY",
        {
          "base-type": "type/Text",
        },
      ],
    ],
  };
}

// Q8 - Q4 + 2nd stage with join, custom column, 2 aggregations, 2 breakouts
function createQ8Query(source: Card): StructuredQuery {
  return {
    ...createQ7Query(source),
    aggregation: [
      ["count"],
      [
        "sum",
        [
          "field",
          REVIEWS.RATING,
          {
            "base-type": "type/Integer",
            "join-alias": "Reviews - Created At: Month",
          },
        ],
      ],
    ],
  };
}

// Q9 - Q8 + 3rd stage with 1 aggregation
// Sanity check, mainly to verify that columns from the 1st stage are not exposed here
function createQ9Query(source: Card): StructuredQuery {
  return {
    "source-query": createQ8Query(source),
    ...createQ8Query(source),
    aggregation: [["count"]],
  };
}

type CreateQuery = (source: Card) => StructuredQuery;

function createAndVisitDashboardWithCardMatrix(createQuery: CreateQuery) {
  cy.then(function () {
    createQuestion({
      type: "question",
      query: createQuery(this.baseQuestion),
      name: "Question-based Question",
    }).then(response => cy.wrap(response.body).as("qbq"));

    createQuestion({
      type: "question",
      query: createQuery(this.baseModel),
      name: "Model-based Question",
    }).then(response => cy.wrap(response.body).as("mbq"));

    createQuestion({
      type: "model",
      name: "Question-based Model",
      query: createQuery(this.baseQuestion),
    }).then(response => cy.wrap(response.body).as("qbm"));

    createQuestion({
      type: "model",
      name: "Model-based Model",
      query: createQuery(this.baseModel),
    }).then(response => cy.wrap(response.body).as("mbm"));
  });

  cy.then(function () {
    const cards = [this.qbq, this.mbq, this.qbm, this.mbm];
    createAndVisitDashboard(cards);
  });
}

// TODO: use createDashboardWithQuestions
function createAndVisitDashboard(cards: Card[]) {
  let id = 0;
  const getNextId = () => --id;

  createDashboardWithTabs({
    parameters: [DATE_PARAMETER, TEXT_PARAMETER, NUMBER_PARAMETER],
    dashcards: [
      ...cards.map((card, index) => ({
        id: getNextId(),
        size_x: CARD_WIDTH,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: index % 2 === 0 ? 0 : CARD_WIDTH,
        card,
        card_id: card.id,
      })),
    ],
  }).then(dashboard => visitDashboard(dashboard.id));
}

function getFilter(name: string) {
  return cy.findByTestId("fixed-width-filters").findByText(name);
}

function getPopoverItems() {
  return cy.get("[data-element-id=list-section]");
}

function clickAway() {
  cy.get("body").click(0, 0);
}

function verifyDashcardMappingOptions(
  dashcardIndex: number,
  sections: MappingSection[],
) {
  getDashboardCard(dashcardIndex).findByText("Select…").click();
  verifyPopoverMappingOptions(sections);
  clickAway();
}

function verifyNoDashcardMappingOptions(dashcardIndex: number) {
  getDashboardCard(dashcardIndex)
    .findByText("No valid fields")
    .should("be.visible");

  getDashboardCard(dashcardIndex).findByText("No valid fields").realHover();
  cy.findByRole("tooltip")
    .findByText(
      "This card doesn't have any fields or parameters that can be mapped to this parameter type.",
    )
    .should("be.visible");
}

type SectionName = string;
type ColumnName = string;
type MappingSection = [SectionName, ColumnName[]];

function verifyPopoverMappingOptions(sections: MappingSection[]) {
  const expectedItemsCount = sections.reduce(
    (sum, [sectionName, columnNames]) =>
      sum + [sectionName, ...columnNames].length,
    0,
  );

  popover().within(() => {
    getPopoverItems().then($items => {
      let index = 0;

      for (const [sectionName, columnNames] of sections) {
        const item = cy.wrap($items[index]);
        item.scrollIntoView();
        item.should("have.text", sectionName);
        ++index;

        for (const columnName of columnNames) {
          const item = cy.wrap($items[index]);
          item.scrollIntoView();
          item.findByLabelText(columnName).should("be.visible");
          ++index;
        }
      }

      expect($items.length).to.eq(expectedItemsCount);
    });
  });
}
