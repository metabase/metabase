import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
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
 * TODO: https://github.com/metabase/metabase/issues/47218
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
    H.restore();
    cy.signInAsAdmin();
    createBaseQuestions();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", "/api/dashboard/**").as("getDashboard");
    cy.intercept("PUT", "/api/dashboard/**").as("updateDashboard");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashboardData",
    );
    cy.intercept("GET", "/api/public/dashboard/*/dashcard/*/card/*").as(
      "publicDashboardData",
    );
    cy.intercept("GET", "/api/embed/dashboard/*/dashcard/*/card/*").as(
      "embeddedDashboardData",
    );
  });

  describe("1-stage queries", () => {
    describe("Q1 - join, custom column, no aggregations, no breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ1Query);
      });

      it("allows to map to all relevant columns", () => {
        H.editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();

        function verifyDateMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Base Orders Question", ORDERS_DATE_COLUMNS],
            ["Reviews", REVIEWS_DATE_COLUMNS],
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", ORDERS_DATE_COLUMNS],
            ["Reviews", REVIEWS_DATE_COLUMNS],
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
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
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Reviews", REVIEWS_TEXT_COLUMNS],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
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
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // TODO: https://github.com/metabase/metabase/issues/46845
            ],
            ["User", PEOPLE_NUMBER_COLUMNS],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
            ["Reviews", REVIEWS_NUMBER_COLUMNS],
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // TODO: https://github.com/metabase/metabase/issues/46845
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
    });

    describe("Q2 - join, custom column, 2 aggregations, no breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ2Query);
      });

      it("allows to map to all relevant columns (metabase#47184)", () => {
        H.editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();

        function verifyDateMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Base Orders Question", ORDERS_DATE_COLUMNS],
            ["Reviews", REVIEWS_DATE_COLUMNS],
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", ORDERS_DATE_COLUMNS],
            ["Reviews", REVIEWS_DATE_COLUMNS],
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
          ]);
          verifyNoDashcardMappingOptions(2);
          verifyNoDashcardMappingOptions(3);
        }

        function verifyTextMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Reviews", REVIEWS_TEXT_COLUMNS],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Reviews", REVIEWS_TEXT_COLUMNS],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
          ]);
          verifyNoDashcardMappingOptions(2);
          verifyNoDashcardMappingOptions(3);
        }

        function verifyNumberMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
            ["Reviews", REVIEWS_NUMBER_COLUMNS],
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS],
            ], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_NUMBER_COLUMNS],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
            ["Reviews", REVIEWS_NUMBER_COLUMNS],
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS],
            ], // TODO: https://github.com/metabase/metabase/issues/46845
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
    });

    describe("Q3 - join, custom column, no aggregations, 3 breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ3Query);
      });

      it("allows to map to all relevant columns", () => {
        H.editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();

        function verifyDateMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Base Orders Question", ORDERS_DATE_COLUMNS],
            ["Reviews", REVIEWS_DATE_COLUMNS],
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", ORDERS_DATE_COLUMNS],
            ["Reviews", REVIEWS_DATE_COLUMNS],
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
            [
              NAMELESS_SECTION,
              ["Created At: Month", "User → Created At: Year"],
            ],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
            [
              NAMELESS_SECTION,
              ["Created At: Month", "User → Created At: Year"],
            ],
          ]);
        }

        function verifyTextMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Reviews", REVIEWS_TEXT_COLUMNS],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
            ["Summaries", ["Category"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Reviews", REVIEWS_TEXT_COLUMNS],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
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
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS],
            ], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_NUMBER_COLUMNS],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
            ["Reviews", REVIEWS_NUMBER_COLUMNS],
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS],
            ], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_NUMBER_COLUMNS],
          ]);
          verifyNoDashcardMappingOptions(2);
          verifyNoDashcardMappingOptions(3);
        }
      });
    });

    describe("Q4 - join, custom column, 2 aggregations, 2 breakouts (metabase#47184)", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ4Query);
      });

      it("allows to map to all relevant columns", () => {
        H.editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();

        function verifyDateMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Base Orders Question", ORDERS_DATE_COLUMNS],
            ["Reviews", REVIEWS_DATE_COLUMNS],
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", ORDERS_DATE_COLUMNS],
            ["Reviews", REVIEWS_DATE_COLUMNS],
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
            [
              NAMELESS_SECTION,
              ["Created At: Month", "User → Created At: Year"],
            ],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
            [
              NAMELESS_SECTION,
              ["Created At: Month", "User → Created At: Year"],
            ],
          ]);
        }

        function verifyTextMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Reviews", REVIEWS_TEXT_COLUMNS],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
            ["Summaries", ["Category"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Reviews", REVIEWS_TEXT_COLUMNS],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
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
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS],
            ], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_NUMBER_COLUMNS],
            ["Summaries", ["Count", "Sum of Total"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
            ["Reviews", REVIEWS_NUMBER_COLUMNS],
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS],
            ], // TODO: https://github.com/metabase/metabase/issues/46845
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
  });

  describe("2-stage queries", () => {
    describe("Q5 - Q4 + 2nd stage with join, custom column, no aggregations, no breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ5Query);
      });

      it("allows to map to all relevant columns", () => {
        H.editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();

        function verifyDateMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Base Orders Question", ORDERS_DATE_COLUMNS],
            ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", ORDERS_DATE_COLUMNS],
            ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
            [
              NAMELESS_SECTION,
              ["Created At: Month", "User → Created At: Year"],
            ],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
            [
              NAMELESS_SECTION,
              ["Created At: Month", "User → Created At: Year"],
            ],
          ]);
        }

        function verifyTextMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
            ["Summaries", ["Category"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
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
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // TODO: https://github.com/metabase/metabase/issues/46845
            ],
            ["User", PEOPLE_NUMBER_COLUMNS],
            ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
            ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]],
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // TODO: https://github.com/metabase/metabase/issues/46845
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
    });

    describe("Q6 - Q4 + 2nd stage with join, custom column, 2 aggregations, no breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ6Query);
      });

      it("allows to map to all relevant columns", () => {
        H.editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();

        function verifyDateMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Base Orders Question", ORDERS_DATE_COLUMNS],
            ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", ORDERS_DATE_COLUMNS],
            ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyNoDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX);
          verifyNoDashcardMappingOptions(MODEL_BASED_MODEL_INDEX);
        }

        function verifyTextMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
            ["Summaries", ["Category"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
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
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // TODO: https://github.com/metabase/metabase/issues/46845
            ],
            ["User", PEOPLE_NUMBER_COLUMNS],
            ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
            ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]],
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // TODO: https://github.com/metabase/metabase/issues/46845
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

      describe("applies filter to the the dashcard and allows to drill via dashcard header", () => {
        it("1st stage explicit join", () => {
          setup1stStageExplicitJoinFilter();
          apply1stStageExplicitJoinFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["1,813", "7,218"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["1,813", "7,218"],
          });
        });

        it("1st stage implicit join (data source)", () => {
          setup1stStageImplicitJoinFromSourceFilter();

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["2,071", "8,252"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["2,071", "8,252"],
          });
        });

        // TODO: https://github.com/metabase/metabase/issues/46774
        it.skip("1st stage implicit join (joined data source)", () => {
          setup1stStageImplicitJoinFromJoinFilter();

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["4,447", "17,714"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["4,447", "17,714"],
          });
        });

        it("1st stage custom column", () => {
          setup1stStageCustomColumnFilter();

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["971", "3,900"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["971", "3,900"],
          });
        });

        it("1st stage aggregation", () => {
          setup1stStageAggregationFilter();

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["3", "13"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["3", "13"],
          });
        });

        // TODO: https://github.com/metabase/metabase/issues/46774
        it.skip("1st stage breakout", () => {
          setup1stStageBreakoutFilter();

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["4,447", "17,714"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["4,447", "17,714"],
          });
        });

        it("2nd stage explicit join", () => {
          setup2ndStageExplicitJoinFilter();

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["16", "80"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["16", "80"],
          });
        });

        it("2nd stage custom column", () => {
          setup2ndStageCustomColumnFilter();
          apply2ndStageCustomColumnFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["31", "114"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["31", "114"],
          });
        });
      });
    });

    describe("Q7 - Q4 + 2nd stage with join, custom column, no aggregations, 2 breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ7Query);
      });

      it("allows to map to all relevant columns", () => {
        H.editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();

        function verifyDateMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Base Orders Question", ORDERS_DATE_COLUMNS],
            ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", ORDERS_DATE_COLUMNS],
            ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyNoDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX);
          verifyNoDashcardMappingOptions(MODEL_BASED_MODEL_INDEX);
        }

        function verifyTextMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
            ["Summaries", ["Category"]],
            ["Summaries (2)", ["Reviewer", "Category"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]],
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
            ["Summaries", ["Category"]],
            ["Summaries (2)", ["Reviewer", "Category"]],
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
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // TODO: https://github.com/metabase/metabase/issues/46845
            ],
            ["User", PEOPLE_NUMBER_COLUMNS],
            ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
            ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]],
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // TODO: https://github.com/metabase/metabase/issues/46845
            ],
            ["User", PEOPLE_NUMBER_COLUMNS],
            ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
          ]);
          verifyNoDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX);
          verifyNoDashcardMappingOptions(MODEL_BASED_MODEL_INDEX);
        }
      });

      describe("applies filter to the the dashcard and allows to drill via dashcard header", () => {
        it("1st stage explicit join", () => {
          setup1stStageExplicitJoinFilter();
          apply1stStageExplicitJoinFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 953",
            queryBuilderCount: "Showing 953 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 953",
            queryBuilderCount: "Showing 953 rows",
          });
        });

        it("1st stage implicit join (data source)", () => {
          setup1stStageImplicitJoinFromSourceFilter();

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 1044",
            queryBuilderCount: "Showing 1,044 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 1044",
            queryBuilderCount: "Showing 1,044 rows",
          });
        });

        // TODO: https://github.com/metabase/metabase/issues/46774
        it.skip("1st stage implicit join (joined data source)", () => {
          setup1stStageImplicitJoinFromJoinFilter();

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });
        });

        it("1st stage custom column", () => {
          setup1stStageCustomColumnFilter();

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 688",
            queryBuilderCount: "Showing 688 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 688",
            queryBuilderCount: "Showing 688 rows",
          });
        });

        it("1st stage aggregation", () => {
          setup1stStageAggregationFilter();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 3",
            queryBuilderCount: "Showing 3 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 3",
            queryBuilderCount: "Showing 3 rows",
          });
        });

        // TODO: https://github.com/metabase/metabase/issues/46774
        it.skip("1st stage breakout", () => {
          setup1stStageBreakoutFilter();

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });
        });

        it("2nd stage explicit join", () => {
          setup2ndStageExplicitJoinFilter();

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 4",
            queryBuilderCount: "Showing 4 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 4",
            queryBuilderCount: "Showing 4 rows",
          });
        });

        it("2nd stage custom column", () => {
          setup2ndStageCustomColumnFilter();
          apply2ndStageCustomColumnFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 31",
            queryBuilderCount: "Showing 31 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 31",
            queryBuilderCount: "Showing 31 rows",
          });
        });

        it("2nd stage breakout", () => {
          setup2ndStageBreakoutFilter();
          apply2ndStageBreakoutFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 2,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 3,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });
        });
      });
    });

    describe("Q8 - Q4 + 2nd stage with join, custom column, 2 aggregations, 2 breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ8Query);
      });

      it("allows to map to all relevant columns", () => {
        H.editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();

        function verifyDateMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Base Orders Question", ORDERS_DATE_COLUMNS],
            ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", ORDERS_DATE_COLUMNS],
            ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyNoDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX);
          verifyNoDashcardMappingOptions(MODEL_BASED_MODEL_INDEX);
        }

        function verifyTextMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
            ["Summaries", ["Category"]],
            ["Summaries (2)", ["Reviewer", "Category"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
            ["Summaries", ["Category"]],
            ["Summaries (2)", ["Reviewer", "Category"]],
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
            ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS],
            ], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_NUMBER_COLUMNS],
            ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
            ["Summaries (2)", ["Count", "Sum of Rating"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
            ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS],
            ], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_NUMBER_COLUMNS],
            ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
            ["Summaries (2)", ["Count", "Sum of Rating"]],
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

      describe("applies filter to the the dashcard and allows to drill via dashcard header", () => {
        it("1st stage explicit join", () => {
          setup1stStageExplicitJoinFilter();
          apply1stStageExplicitJoinFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 953",
            queryBuilderCount: "Showing 953 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 953",
            queryBuilderCount: "Showing 953 rows",
          });

          cy.log("public dashboard");
          getDashboardId().then(dashboardId =>
            H.visitPublicDashboard(dashboardId),
          );
          waitForPublicDashboardData();
          apply1stStageExplicitJoinFilter();
          waitForPublicDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 953")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 953")
            .should("be.visible");

          cy.log("embedded dashboard");
          getDashboardId().then(dashboardId => {
            H.visitEmbeddedPage({
              resource: { dashboard: dashboardId },
              params: {},
            });
          });
          waitForEmbeddedDashboardData();
          apply1stStageExplicitJoinFilter();
          waitForEmbeddedDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 953")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 953")
            .should("be.visible");
        });

        it("1st stage implicit join (data source)", () => {
          setup1stStageImplicitJoinFromSourceFilter();

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 1044",
            queryBuilderCount: "Showing 1,044 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 1044",
            queryBuilderCount: "Showing 1,044 rows",
          });
        });

        // TODO: https://github.com/metabase/metabase/issues/46774
        it.skip("1st stage implicit join (joined data source)", () => {
          setup1stStageImplicitJoinFromJoinFilter();

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });
        });

        it("1st stage custom column", () => {
          setup1stStageCustomColumnFilter();

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 688",
            queryBuilderCount: "Showing 688 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 688",
            queryBuilderCount: "Showing 688 rows",
          });
        });

        it("1st stage aggregation", () => {
          setup1stStageAggregationFilter();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 3",
            queryBuilderCount: "Showing 3 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 3",
            queryBuilderCount: "Showing 3 rows",
          });
        });

        // TODO: https://github.com/metabase/metabase/issues/46774
        it.skip("1st stage breakout", () => {
          setup1stStageBreakoutFilter();

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });
        });

        it("2nd stage explicit join", () => {
          setup2ndStageExplicitJoinFilter();

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 4",
            queryBuilderCount: "Showing 4 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 4",
            queryBuilderCount: "Showing 4 rows",
          });
        });

        it("2nd stage custom column", () => {
          setup2ndStageCustomColumnFilter();
          apply2ndStageCustomColumnFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 31",
            queryBuilderCount: "Showing 31 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 31",
            queryBuilderCount: "Showing 31 rows",
          });

          cy.log("public dashboard");
          getDashboardId().then(dashboardId =>
            H.visitPublicDashboard(dashboardId),
          );
          waitForPublicDashboardData();
          apply2ndStageCustomColumnFilter();
          waitForPublicDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 31")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 31")
            .should("be.visible");

          cy.log("embedded dashboard");
          getDashboardId().then(dashboardId => {
            H.visitEmbeddedPage({
              resource: { dashboard: dashboardId },
              params: {},
            });
          });
          waitForEmbeddedDashboardData();
          apply2ndStageCustomColumnFilter();
          waitForEmbeddedDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 31")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 31")
            .should("be.visible");
        });

        it("2nd stage aggregation", () => {
          setup2ndStageAggregationFilter();
          apply2ndStageAggregationFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 6",
            queryBuilderCount: "Showing 6 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 6",
            queryBuilderCount: "Showing 6 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 2,
            dashboardCount: "Rows 1-1 of 6",
            queryBuilderCount: "Showing 6 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 3,
            dashboardCount: "Rows 1-1 of 6",
            queryBuilderCount: "Showing 6 rows",
          });

          cy.log("public dashboard");
          getDashboardId().then(dashboardId =>
            H.visitPublicDashboard(dashboardId),
          );
          waitForPublicDashboardData();
          apply2ndStageAggregationFilter();
          waitForPublicDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
          H.getDashboardCard(2)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
          H.getDashboardCard(3)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");

          cy.log("embedded dashboard");
          getDashboardId().then(dashboardId => {
            H.visitEmbeddedPage({
              resource: { dashboard: dashboardId },
              params: {},
            });
          });
          waitForEmbeddedDashboardData();
          apply2ndStageAggregationFilter();
          waitForEmbeddedDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
          H.getDashboardCard(2)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
          H.getDashboardCard(3)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
        });

        it("2nd stage breakout", () => {
          setup2ndStageBreakoutFilter();
          apply2ndStageBreakoutFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 2,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          goBackToDashboard();

          verifyDashcardRowsCount({
            dashcardIndex: 3,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          cy.log("public dashboard");
          getDashboardId().then(dashboardId =>
            H.visitPublicDashboard(dashboardId),
          );
          waitForPublicDashboardData();
          // We're not using apply2ndStageBreakoutFilter() here because in public dashboards
          // there are no field values to choose from. We need to search for those values manually.
          H.filterWidget().eq(0).click();
          H.popover().within(() => {
            cy.findByPlaceholderText("Enter some text").type("Gadget");
            cy.button("Add filter").click();
          });
          waitForPublicDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
          H.getDashboardCard(2)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
          H.getDashboardCard(3)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");

          cy.log("embedded dashboard");
          getDashboardId().then(dashboardId => {
            H.visitEmbeddedPage({
              resource: { dashboard: dashboardId },
              params: {},
            });
          });
          waitForEmbeddedDashboardData();
          // We're not using apply2ndStageBreakoutFilter() here because in public dashboards
          // there are no field values to choose from. We need to search for those values manually.
          H.filterWidget().eq(0).click();
          H.popover().within(() => {
            cy.findByPlaceholderText("Enter some text").type("Gadget");
            cy.button("Add filter").click();
          });
          waitForEmbeddedDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
          H.getDashboardCard(2)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
          H.getDashboardCard(3)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
        });
      });
    });
  });

  describe("3-stage queries", () => {
    describe("Q9 - Q8 + 3rd stage with 1 aggregation", () => {
      beforeEach(() => {
        createAndVisitDashboardWithCardMatrix(createQ9Query);
      });

      it("allows to map to all relevant columns", () => {
        H.editDashboard();

        cy.log("## date columns");
        getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        getFilter("Number").click();
        verifyNumberMappingOptions();

        function verifyDateMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Base Orders Question", ORDERS_DATE_COLUMNS],
            ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", ORDERS_DATE_COLUMNS],
            ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_DATE_COLUMNS],
            ["Summaries", ["Created At: Month", "Created At: Year"]],
          ]);
          verifyNoDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX);
          verifyNoDashcardMappingOptions(MODEL_BASED_MODEL_INDEX);
        }

        function verifyTextMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
            ["Summaries", ["Category"]],
            ["Summaries (2)", ["Reviewer", "Category"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_TEXT_COLUMNS],
            ["Summaries", ["Category"]],
            ["Summaries (2)", ["Reviewer", "Category"]],
          ]);
          verifyNoDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX);
          verifyNoDashcardMappingOptions(MODEL_BASED_MODEL_INDEX);
        }

        function verifyNumberMappingOptions() {
          verifyDashcardMappingOptions(QUESTION_BASED_QUESTION_INDEX, [
            ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
            ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS],
            ], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_NUMBER_COLUMNS],
            ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
            ["Summaries (2)", ["Count", "Sum of Rating"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_QUESTION_INDEX, [
            ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
            ["Reviews", [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
            [
              "Product",
              [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS],
            ], // TODO: https://github.com/metabase/metabase/issues/46845
            ["User", PEOPLE_NUMBER_COLUMNS],
            ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
            ["Summaries (2)", ["Count", "Sum of Rating"]],
          ]);
          verifyDashcardMappingOptions(QUESTION_BASED_MODEL_INDEX, [
            [NAMELESS_SECTION, ["Count"]],
          ]);
          verifyDashcardMappingOptions(MODEL_BASED_MODEL_INDEX, [
            [NAMELESS_SECTION, ["Count"]],
          ]);
        }
      });

      describe("applies filter to the the dashcard and allows to drill via dashcard header", () => {
        it("1st stage explicit join", () => {
          setup1stStageExplicitJoinFilter();
          apply1stStageExplicitJoinFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["953"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["953"],
          });
        });

        it("1st stage implicit join (data source)", () => {
          setup1stStageImplicitJoinFromSourceFilter();

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["1,044"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["1,044"],
          });
        });

        // TODO: https://github.com/metabase/metabase/issues/46774
        it.skip("1st stage implicit join (joined data source)", () => {
          setup1stStageImplicitJoinFromJoinFilter();

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["1,077"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["1,077"],
          });
        });

        it("1st stage custom column", () => {
          setup1stStageCustomColumnFilter();

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["688"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["688"],
          });
        });

        it("1st stage aggregation", () => {
          setup1stStageAggregationFilter();

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["3"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["3"],
          });
        });

        // TODO: https://github.com/metabase/metabase/issues/46774
        it.skip("1st stage breakout", () => {
          setup1stStageBreakoutFilter();

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["1,077"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["1,077"],
          });
        });

        it("2nd stage explicit join", () => {
          setup2ndStageExplicitJoinFilter();

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["4"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["4"],
          });
        });

        it("2nd stage custom column", () => {
          setup2ndStageCustomColumnFilter();
          apply2ndStageCustomColumnFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["31"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["31"],
          });
        });

        it("2nd stage aggregation", () => {
          setup2ndStageAggregationFilter();
          apply2ndStageAggregationFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["6"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["6"],
          });
        });

        it("2nd stage breakout", () => {
          H.editDashboard();

          getFilter("Text").click();

          H.getDashboardCard(0).findByText("Select…").click();
          H.popover().within(() => {
            getPopoverList().scrollTo("bottom");
            getPopoverItem("Category", 2).click();
          });

          H.getDashboardCard(1).findByText("Select…").click();
          H.popover().within(() => {
            getPopoverList().scrollTo("bottom");
            getPopoverItem("Category", 2).click();
          });

          cy.button("Save").click();
          cy.wait("@updateDashboard");

          H.filterWidget().eq(0).click();
          H.popover().within(() => {
            cy.findByLabelText("Gadget").click();
            cy.button("Add filter").click();
          });
          cy.wait(["@dashboardData", "@dashboardData"]);

          verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["1,077"],
          });

          goBackToDashboard();

          verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["1,077"],
          });
        });
      });
    });
  });
});

describe("scenarios > dashboard > filters > query stages + temporal unit parameters", () => {
  describe("applies filter to the the dashcard and allows to drill via dashcard header", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      cy.intercept("POST", "/api/dataset").as("dataset");
    });

    it("1st stage explicit join + unit of time parameter", () => {
      H.createDashboard(
        {
          name: "My new dashboard",
        },
        { wrapId: true, idAlias: "myNewDash" },
      );

      cy.get("@myNewDash").then((dashId: number | any) => {
        cy.request("POST", "/api/activity/recents", {
          context: "selection",
          model: "dashboard",
          model_id: dashId,
        });
      });

      H.startNewQuestion();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        H.entityPickerModalItem(2, "Orders").click();
      });

      H.getNotebookStep("filter")
        .findByText("Add filters to narrow your answer")
        .click();
      H.popover().within(() => {
        cy.findByText("Orders").click();
        cy.findByText("Product").click();
        cy.findByText("Category").click();
        cy.findByLabelText("Gizmo").click();
        cy.findByLabelText("Doohickey").click();
        cy.button("Add filter").click();
      });

      H.getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
      H.popover().findByText("Count of rows").click();
      H.getNotebookStep("summarize").icon("add").click();
      H.popover().within(() => {
        cy.findByText("Sum of ...").click();
        cy.findByText("Total").click();
      });

      H.getNotebookStep("summarize")
        .findByText("Pick a column to group by")
        .click();
      H.popover()
        .findByLabelText("Created At")
        .findByLabelText("Temporal bucket")
        .click();
      H.popover().last().findByText("Week").click();
      H.getNotebookStep("summarize")
        .findByTestId("breakout-step")
        .icon("add")
        .click();
      H.popover().within(() => {
        cy.findByText("Orders").click();
        cy.findByText("Product").click();
        cy.findByText("Category").click();
      });

      cy.findAllByTestId("action-buttons").last().button("Summarize").click();
      H.popover().findByText("Count of rows").click();
      H.getNotebookStep("summarize", { stage: 1 })
        .findByText("Pick a column to group by")
        .click();
      H.popover().findByLabelText("Created At: Week").click();

      H.visualize(); // need to visualize because startNewQuestion does not set "display" property on a card
      cy.wait("@dataset");
      H.saveQuestion("test"); // added to new dash automatically

      cy.findByLabelText("Add a filter or parameter").click();
      H.popover().findByText("Text or Category").click();
      H.getDashboardCard().findByText("Select…").click();
      cy.findAllByText("Category").first().click();

      cy.findByLabelText("Add a filter or parameter").click();
      H.popover().findByText("Time grouping").click();
      H.getDashboardCard().findByText("Select…").click();
      H.popover().findByText("Created At: Week").click();

      H.saveDashboard();
      H.filterWidget().eq(0).click();
      H.popover().within(() => {
        cy.findByText("Gizmo").click();
        cy.button("Add filter").click();
      });

      H.filterWidget().eq(1).click();
      H.popover().findByText("Quarter").click();

      H.getDashboardCard().findByText("Q1 2023").should("be.visible");
      H.getDashboardCard().findByTestId("legend-caption-title").click();
      cy.wait("@dataset");

      // assert that new filter was applied
      cy.findByTestId("qb-filters-panel").within(() => {
        cy.findByText("Product → Category is 2 selections").should(
          "be.visible",
        );
        cy.findByText("Product → Category is Gizmo").should("be.visible");
      });

      // assert that temporal unit parameter was applied
      cy.findByTestId("chart-container")
        .findByText("Q1 2023")
        .should("be.visible");
    });
  });
});

describe("pivot tables", () => {
  const QUESTION_PIVOT_INDEX = 0;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    createBaseQuestions();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/dataset/pivot").as("datasetPivot");
    cy.intercept("GET", "/api/dashboard/**").as("getDashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.then(function () {
      H.createQuestion({
        type: "question",
        query: createPivotableQuery(this.baseQuestion),
        name: "Question - pivot viz",
        display: "pivot",
      }).then(response => {
        const card = response.body;
        createAndVisitDashboard([card]);
      });
    });

    function createPivotableQuery(source: Card): StructuredQuery {
      return {
        ...createQ1Query(source),
        aggregation: [["count"]],
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
        ],
      };
    }
  });

  it("does not use extra filtering stage for pivot tables", () => {
    cy.log("dashboard parameters mapping");

    H.editDashboard();

    cy.log("## date columns");
    getFilter("Date").click();
    verifyDateMappingOptions();

    cy.log("## text columns");
    getFilter("Text").click();
    verifyTextMappingOptions();

    cy.log("## number columns");
    getFilter("Number").click();
    verifyNumberMappingOptions();

    cy.button("Save").click();

    cy.log("filter modal");

    H.getDashboardCard(QUESTION_PIVOT_INDEX)
      .findByTestId("legend-caption-title")
      .click();
    cy.wait("@datasetPivot");
    cy.button("Filter").click();
    H.modal().findByText("Summaries").should("not.exist");

    function verifyDateMappingOptions() {
      verifyDashcardMappingOptions(QUESTION_PIVOT_INDEX, [
        ["Base Orders Question", ORDERS_DATE_COLUMNS],
        ["Reviews", REVIEWS_DATE_COLUMNS],
        ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
        ["User", PEOPLE_DATE_COLUMNS],
      ]);
    }

    function verifyTextMappingOptions() {
      verifyDashcardMappingOptions(QUESTION_PIVOT_INDEX, [
        ["Reviews", REVIEWS_TEXT_COLUMNS],
        ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
        ["User", PEOPLE_TEXT_COLUMNS],
      ]);
    }

    function verifyNumberMappingOptions() {
      verifyDashcardMappingOptions(QUESTION_PIVOT_INDEX, [
        ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
        ["Reviews", REVIEWS_NUMBER_COLUMNS],
        ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
        ["User", PEOPLE_NUMBER_COLUMNS],
      ]);
    }
  });
});

function createBaseQuestions() {
  H.createQuestion({
    type: "question",
    name: "Q0 Orders",
    description: "Question based on a database table",
    query: {
      "source-table": ORDERS_ID,
    },
  }).then(response => cy.wrap(response.body).as("ordersQuestion"));

  cy.then(function () {
    H.createQuestion({
      type: "question",
      name: "Base Orders Question",
      query: {
        "source-table": `card__${this.ordersQuestion.id}`,
      },
    }).then(response => cy.wrap(response.body).as("baseQuestion"));

    H.createQuestion({
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

// Q3 - join, custom column, no aggregations, 3 breakouts
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
function createQ9Query(source: Card): StructuredQuery {
  return {
    "source-query": createQ8Query(source),
    aggregation: [["count"]],
  };
}

type CreateQuery = (source: Card) => StructuredQuery;

function createAndVisitDashboardWithCardMatrix(createQuery: CreateQuery) {
  cy.then(function () {
    H.createQuestion({
      type: "question",
      query: createQuery(this.baseQuestion),
      name: "Question-based Question",
    }).then(response => cy.wrap(response.body).as("qbq"));

    H.createQuestion({
      type: "question",
      query: createQuery(this.baseModel),
      name: "Model-based Question",
    }).then(response => cy.wrap(response.body).as("mbq"));

    H.createQuestion({
      type: "model",
      name: "Question-based Model",
      query: createQuery(this.baseQuestion),
    }).then(response => cy.wrap(response.body).as("qbm"));

    H.createQuestion({
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

function createAndVisitDashboard(cards: Card[]) {
  let id = 0;
  const getNextId = () => --id;

  H.createDashboardWithTabs({
    enable_embedding: true,
    embedding_params: {
      [DATE_PARAMETER.slug]: "enabled",
      [TEXT_PARAMETER.slug]: "enabled",
      [NUMBER_PARAMETER.slug]: "enabled",
    },
    parameters: [DATE_PARAMETER, TEXT_PARAMETER, NUMBER_PARAMETER],
    dashcards: [
      ...cards.map((card, index) => ({
        id: getNextId(),
        size_x: CARD_WIDTH,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * Math.floor(index / 2),
        col: index % 2 === 0 ? 0 : CARD_WIDTH,
        card,
        card_id: card.id,
      })),
    ],
  }).then(dashboard => {
    H.visitDashboard(dashboard.id);
    cy.wrap(dashboard.id).as("dashboardId");
    cy.wait("@getDashboard");
  });
}

function setup1stStageExplicitJoinFilter() {
  H.editDashboard();

  getFilter("Text").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Reviewer", 0).click();
  });

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Reviewer", 0).click();
  });

  cy.button("Save").click();
  cy.wait("@updateDashboard");
}

function apply1stStageExplicitJoinFilter() {
  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Search by Reviewer").type("abe.gorczany");
    cy.button("Add filter").click();
  });
}

function setup1stStageImplicitJoinFromSourceFilter() {
  H.editDashboard();

  getFilter("Number").click();
  H.sidebar().findByText("Filter operator").next().click();
  H.popover().findByText("Between").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Price", 0).click();
  });

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Price", 0).click();
  });

  cy.button("Save").click();
  cy.wait("@updateDashboard");

  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
    cy.findAllByPlaceholderText("Enter a number").eq(1).type("16");
    cy.button("Add filter").click();
  });
  cy.wait(["@dashboardData", "@dashboardData"]);
}

function setup1stStageImplicitJoinFromJoinFilter() {
  H.editDashboard();

  getFilter("Text").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Category", 1).click();
  });

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Category", 1).click();
  });

  cy.button("Save").click();
  cy.wait("@updateDashboard");

  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findByLabelText("Gadget").click();
    cy.button("Add filter").click();
  });
  cy.wait(["@dashboardData", "@dashboardData"]);
}

function setup1stStageCustomColumnFilter() {
  H.editDashboard();

  getFilter("Number").click();
  H.sidebar().findByText("Filter operator").next().click();
  H.popover().findByText("Between").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Net").click();
  });

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Net").click();
  });

  cy.button("Save").click();
  cy.wait("@updateDashboard");

  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
    cy.findAllByPlaceholderText("Enter a number").eq(1).type("20");
    cy.button("Add filter").click();
  });
  cy.wait(["@dashboardData", "@dashboardData"]);
}

function setup1stStageAggregationFilter() {
  H.editDashboard();

  getFilter("Number").click();
  H.sidebar().findByText("Filter operator").next().click();
  H.popover().findByText("Between").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverList().scrollTo("bottom");
    getPopoverItem("Count").click();
  });

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverList().scrollTo("bottom");
    getPopoverItem("Count").click();
  });

  cy.button("Save").click();
  cy.wait("@updateDashboard");

  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
    cy.findAllByPlaceholderText("Enter a number").eq(1).type("2");
    cy.button("Add filter").click();
  });
  cy.wait(["@dashboardData", "@dashboardData"]);
}

function setup1stStageBreakoutFilter() {
  H.editDashboard();

  getFilter("Text").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverList().scrollTo("bottom");
    getPopoverItem("Category", 1).click();
  });

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverList().scrollTo("bottom");
    getPopoverItem("Category", 1).click();
  });

  cy.button("Save").click();
  cy.wait("@updateDashboard");

  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findByLabelText("Gadget").click();
    cy.button("Add filter").click();
  });
  cy.wait(["@dashboardData", "@dashboardData"]);
}

function setup2ndStageExplicitJoinFilter() {
  H.editDashboard();

  getFilter("Text").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Reviewer", 1).click();
  });

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Reviewer", 1).click();
  });

  cy.button("Save").click();
  cy.wait("@updateDashboard");

  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Search by Reviewer").type("abe.gorczany");
    cy.button("Add filter").click();
  });
  cy.wait(["@dashboardData", "@dashboardData"]);
}

function setup2ndStageCustomColumnFilter() {
  H.editDashboard();

  getFilter("Number").click();
  H.sidebar().findByText("Filter operator").next().click();
  H.popover().findByText("Between").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverList().scrollTo("bottom");
    getPopoverItem("5 * Count").click();
  });

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverList().scrollTo("bottom");
    getPopoverItem("5 * Count").click();
  });

  cy.button("Save").click();
  cy.wait("@updateDashboard");
}

function apply2ndStageCustomColumnFilter() {
  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
    cy.findAllByPlaceholderText("Enter a number").eq(1).type("20");
    cy.button("Add filter").click();
  });
}

function setup2ndStageAggregationFilter() {
  H.editDashboard();

  getFilter("Number").click();
  H.sidebar().findByText("Filter operator").next().click();
  H.popover().findByText("Between").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverList().scrollTo("bottom");
    getPopoverItem("Count", 1).click();
  });
  dismissToast();

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverList().scrollTo("bottom");
    getPopoverItem("Count", 1).click();
  });
  dismissToast();

  H.getDashboardCard(2).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Count").click();
  });
  dismissToast();

  H.getDashboardCard(3).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Count").click();
  });

  cy.button("Save").click();
  cy.wait("@updateDashboard");
}

function apply2ndStageAggregationFilter() {
  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
    cy.findAllByPlaceholderText("Enter a number").eq(1).type("2");
    cy.button("Add filter").click();
  });
}

function setup2ndStageBreakoutFilter() {
  H.editDashboard();

  getFilter("Text").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverList().scrollTo("bottom");
    getPopoverItem("Category", 2).click();
  });
  dismissToast();

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverList().scrollTo("bottom");
    getPopoverItem("Category", 2).click();
  });
  dismissToast();

  H.getDashboardCard(2).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Products Via Product ID Category").click();
  });
  dismissToast();

  H.getDashboardCard(3).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Products Via Product ID Category").click();
  });

  cy.button("Save").click();
  cy.wait("@updateDashboard");
}

function apply2ndStageBreakoutFilter() {
  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findByLabelText("Gadget").click();
    cy.button("Add filter").click();
  });
}

function getFilter(name: string) {
  return cy.findByTestId("fixed-width-filters").findByText(name);
}

function getPopoverList() {
  return cy.findAllByRole("grid").eq(0);
}

function getPopoverItems() {
  return cy.get("[data-element-id=list-section]");
}

/**
 * @param index if more than 1 item with the same name is visible, specify which one should be used
 */
function getPopoverItem(name: string, index = 0) {
  /**
   * Without scrollIntoView() the popover may scroll automatically to a different
   * place when clicking the item (unclear why).
   */
  return cy.findAllByText(name).eq(index).scrollIntoView();
}

function dismissToast() {
  cy.findByTestId("toast-undo")
    .findByRole("img", { name: /close icon/ })
    .click();
}

function clickAway() {
  cy.get("body").click(0, 0);
}

function goBackToDashboard() {
  cy.findByLabelText("Back to Test Dashboard").click();
  cy.wait("@getDashboard");
}

function getDashboardId(): Cypress.Chainable<number> {
  return cy
    .get("@dashboardId")
    .then(dashboardId => dashboardId as unknown as number);
}

function waitForPublicDashboardData() {
  // tests with public dashboards always have 4 dashcards
  cy.wait([
    "@publicDashboardData",
    "@publicDashboardData",
    "@publicDashboardData",
    "@publicDashboardData",
  ]);
}

function waitForEmbeddedDashboardData() {
  // tests with embedded dashboards always have 4 dashcards
  cy.wait([
    "@embeddedDashboardData",
    "@embeddedDashboardData",
    "@embeddedDashboardData",
    "@embeddedDashboardData",
  ]);
}

function verifyDashcardMappingOptions(
  dashcardIndex: number,
  sections: MappingSection[],
) {
  H.getDashboardCard(dashcardIndex).findByText("Select…").click();
  verifyPopoverMappingOptions(sections);
  clickAway();
}

function verifyNoDashcardMappingOptions(dashcardIndex: number) {
  H.getDashboardCard(dashcardIndex)
    .findByText("No valid fields")
    .should("be.visible");

  H.getDashboardCard(dashcardIndex).findByText("No valid fields").realHover();
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

  H.popover().within(() => {
    getPopoverItems().then($items => {
      let index = 0;

      for (const [sectionName, columnNames] of sections) {
        const item = cy.wrap($items[index]);
        item.scrollIntoView(); // the list is virtualized, we need to keep scrolling to see all the items
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

function verifyDashcardRowsCount({
  dashcardIndex,
  dashboardCount,
  queryBuilderCount,
}: {
  dashcardIndex: number;
  dashboardCount: string;
  queryBuilderCount: string;
}) {
  H.getDashboardCard(dashcardIndex)
    .findByText(dashboardCount)
    .should("be.visible");
  H.getDashboardCard(dashcardIndex)
    .findByTestId("legend-caption-title")
    .click();
  cy.wait("@dataset");
  cy.findByTestId("question-row-count").should("have.text", queryBuilderCount);
}

function verifyDashcardCellValues({
  dashcardIndex,
  values,
}: {
  dashcardIndex: number;
  values: string[];
}) {
  for (let valueIndex = 0; valueIndex < values.length; ++valueIndex) {
    const value = values[valueIndex];

    H.getDashboardCard(dashcardIndex)
      .findByTestId("table-row")
      .findAllByTestId("cell-data")
      .eq(valueIndex)
      .should("have.text", value);
  }

  H.getDashboardCard(dashcardIndex)
    .findByTestId("legend-caption-title")
    .click();
  cy.wait("@dataset");

  for (let valueIndex = 0; valueIndex < values.length; ++valueIndex) {
    const value = values[valueIndex];
    const cellIndex = valueIndex + values.length; // values.length to skip header row

    cy.findAllByTestId("cell-data").eq(cellIndex).should("have.text", value);
  }
}
