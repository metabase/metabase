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

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS, REVIEWS_ID } = SAMPLE_DATABASE;

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

  describe("base queries", () => {
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
      verifyDashcardMappingOptions(0, [
        ["Order", ORDERS_DATE_COLUMNS],
        ["Product", PRODUCTS_DATE_COLUMNS],
        ["User", PEOPLE_DATE_COLUMNS],
      ]);
      verifyDashcardMappingOptions(1, [
        ["Q0 Order", ORDERS_DATE_COLUMNS],
        ["Product", PRODUCTS_DATE_COLUMNS],
        ["User", PEOPLE_DATE_COLUMNS],
      ]);
      verifyDashcardMappingOptions(2, [
        ["Base Orders Model", ORDERS_DATE_COLUMNS],
        ["Product", PRODUCTS_DATE_COLUMNS],
        ["User", PEOPLE_DATE_COLUMNS],
      ]);
    }

    function verifyTextMappingOptions() {
      verifyDashcardMappingOptions(0, [
        ["Product", PRODUCTS_TEXT_COLUMNS],
        ["User", PEOPLE_TEXT_COLUMNS],
      ]);
      verifyDashcardMappingOptions(1, [
        ["Product", PRODUCTS_TEXT_COLUMNS],
        ["User", PEOPLE_TEXT_COLUMNS],
      ]);
      verifyDashcardMappingOptions(2, [
        ["Product", PRODUCTS_TEXT_COLUMNS],
        ["User", PEOPLE_TEXT_COLUMNS],
      ]);
    }

    function verifyNumberMappingOptions() {
      verifyDashcardMappingOptions(0, [
        ["Order", ORDERS_NUMBER_COLUMNS],
        ["Product", PRODUCTS_NUMBER_COLUMNS],
        ["User", PEOPLE_NUMBER_COLUMNS],
      ]);
      verifyDashcardMappingOptions(1, [
        ["Q0 Order", ORDERS_NUMBER_COLUMNS],
        ["Product", PRODUCTS_NUMBER_COLUMNS],
        ["User", PEOPLE_NUMBER_COLUMNS],
      ]);
      verifyDashcardMappingOptions(2, [
        ["Base Orders Model", ORDERS_NUMBER_COLUMNS],
        ["Product", PRODUCTS_NUMBER_COLUMNS],
        ["User", PEOPLE_NUMBER_COLUMNS],
      ]);
    }
  });

  describe("1-stage queries", () => {
    describe("Q1 - join, custom column, no aggregations, no breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithQueryMatrix(createQ1Query);
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
        verifyDashcardMappingOptions(0, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Review", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Review", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(2, [
          [
            "Question-based Model",
            [...ORDERS_DATE_COLUMNS, "Reviews - Product → Created At"],
          ],
          ["Product", PRODUCTS_DATE_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_DATE_COLUMNS],
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(3, [
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
        verifyDashcardMappingOptions(0, [
          ["Review", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Review", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(2, [
          [
            "Question-based Model",
            ["Reviews - Product → Reviewer", "Reviews - Product → Body"],
          ],
          ["Product", PRODUCTS_TEXT_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_TEXT_COLUMNS],
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(3, [
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
        verifyDashcardMappingOptions(0, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Review", REVIEWS_NUMBER_COLUMNS],
          [
            "Product",
            [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // https://github.com/metabase/metabase/issues/46845
          ],
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Review", REVIEWS_NUMBER_COLUMNS],
          [
            "Product",
            [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS], // https://github.com/metabase/metabase/issues/46845
          ],
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(2, [
          [
            "Question-based Model",
            [...ORDERS_NUMBER_COLUMNS, "Reviews - Product → Rating"],
          ],
          ["Product", PRODUCTS_NUMBER_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_NUMBER_COLUMNS],
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(3, [
          [
            "Model-based Model",
            [...ORDERS_NUMBER_COLUMNS, "Reviews - Product → Rating"],
          ],
          ["Product", PRODUCTS_NUMBER_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_NUMBER_COLUMNS],
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
      }
    });

    describe("Q2 - join, custom column, 2 aggregations, no breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithQueryMatrix(createQ2Query);
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
        verifyDashcardMappingOptions(0, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Review", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Review", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyNoDashcardMappingOptions(2);
        verifyNoDashcardMappingOptions(3);
      }

      function verifyTextMappingOptions() {
        verifyDashcardMappingOptions(0, [
          ["Review", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Review", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyNoDashcardMappingOptions(2);
        verifyNoDashcardMappingOptions(3);
      }

      function verifyNumberMappingOptions() {
        verifyDashcardMappingOptions(0, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Review", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Review", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        /**
         * TODO: https://github.com/metabase/metabase/issues/47184
         * TODO: uncomment next two verifyDashcardMappingOptions calls once the issue is fixed
         */
        // verifyDashcardMappingOptions(2, [
        //   ["Summaries", ["Count", "Sum of Total"]],
        // ]);
        // verifyDashcardMappingOptions(3, [
        //   ["Summaries", ["Count", "Sum of Total"]],
        // ]);
      }
    });

    describe("Q3 - join, custom column, no aggregations, 2 breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithQueryMatrix(createQ3Query);
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
        verifyDashcardMappingOptions(0, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Review", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Review", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(2, [
          [NAMELESS_SECTION, ["Created At", "User → Created At"]],
        ]);
        verifyDashcardMappingOptions(3, [
          [NAMELESS_SECTION, ["Created At", "User → Created At"]],
        ]);
      }

      function verifyTextMappingOptions() {
        verifyDashcardMappingOptions(0, [
          ["Review", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Review", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(2, [
          [NAMELESS_SECTION, ["Product → Category"]],
        ]);
        verifyDashcardMappingOptions(3, [
          [NAMELESS_SECTION, ["Product → Category"]],
        ]);
      }

      function verifyNumberMappingOptions() {
        verifyDashcardMappingOptions(0, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Review", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Review", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyNoDashcardMappingOptions(2);
        verifyNoDashcardMappingOptions(3);
      }
    });

    describe("Q4 - join, custom column, 2 aggregations, 2 breakouts", () => {
      beforeEach(() => {
        createAndVisitDashboardWithQueryMatrix(createQ4Query);
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
        verifyDashcardMappingOptions(0, [
          ["Base Orders Question", ORDERS_DATE_COLUMNS],
          ["Review", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Base Orders Model", ORDERS_DATE_COLUMNS],
          ["Review", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
          ["Summaries", ["Created At: Month", "Created At: Year"]],
        ]);
        verifyDashcardMappingOptions(2, [
          [NAMELESS_SECTION, ["Created At", "User → Created At"]],
        ]);
        verifyDashcardMappingOptions(3, [
          [NAMELESS_SECTION, ["Created At", "User → Created At"]],
        ]);
      }

      function verifyTextMappingOptions() {
        verifyDashcardMappingOptions(0, [
          ["Review", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category"]],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Review", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
          ["Summaries", ["Category"]],
        ]);
        verifyDashcardMappingOptions(2, [
          [NAMELESS_SECTION, ["Product → Category"]],
        ]);
        verifyDashcardMappingOptions(3, [
          [NAMELESS_SECTION, ["Product → Category"]],
        ]);
      }

      function verifyNumberMappingOptions() {
        verifyDashcardMappingOptions(0, [
          ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Review", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
          ["Summaries", ["Count", "Sum of Total"]],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Review", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
          ["Summaries", ["Count", "Sum of Total"]],
        ]);
        /**
         * TODO: https://github.com/metabase/metabase/issues/47184
         * TODO: uncomment next two verifyDashcardMappingOptions calls once the issue is fixed
         */
        // verifyDashcardMappingOptions(2, [
        //   [NAMELESS_SECTION, ["Count", "Sum of Total"]],
        // ]);
        // verifyDashcardMappingOptions(3, [
        //   [NAMELESS_SECTION, ["Count", "Sum of Total"]],
        // ]);
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

function createQ2Query(source: Card): StructuredQuery {
  return {
    ...createQ1Query(source),
    aggregation: [["count"], ["sum", TOTAL_FIELD]],
  };
}

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

function createQ4Query(source: Card): StructuredQuery {
  return {
    ...createQ3Query(source),
    aggregation: [["count"], ["sum", TOTAL_FIELD]],
  };
}

type CreateQuery = (source: Card) => StructuredQuery;

function createAndVisitDashboardWithQueryMatrix(createQuery: CreateQuery) {
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
    });
  });
}
