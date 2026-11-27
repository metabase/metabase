const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  Card,
  ConcreteFieldReference,
  DashboardId,
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

export function createBaseQuestions() {
  H.createQuestion({
    type: "question",
    name: "Q0 Orders",
    description: "Question based on a database table",
    query: {
      "source-table": ORDERS_ID,
    },
  }).then((response) => cy.wrap(response.body).as("ordersQuestion"));

  cy.then(function () {
    H.createQuestion({
      type: "question",
      name: "Base Orders Question",
      query: {
        "source-table": `card__${this.ordersQuestion.id}`,
      },
    }).then((response) => cy.wrap(response.body).as("baseQuestion"));

    H.createQuestion({
      type: "model",
      name: "Base Orders Model",
      query: {
        "source-table": `card__${this.ordersQuestion.id}`,
      },
    }).then((response) => cy.wrap(response.body).as("baseModel"));
  });
}

// Q1 - join, custom column, no aggregations, no breakouts
function createQ1Query(source: Card) {
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

// Q3 - join, custom column, no aggregations, 3 breakouts
function createQ3Query(source: Card) {
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
function createQ4Query(source: Card) {
  return {
    ...createQ3Query(source),
    aggregation: [["count"], ["sum", TOTAL_FIELD]],
  };
}

// Q5 - Q4 + 2nd stage with join, custom column, no aggregations, no breakouts
function createQ5Query(source: Card) {
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

// Q7 - Q4 + 2nd stage with join, custom column, no aggregations, 2 breakouts
function createQ7Query(source: Card) {
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
export function createQ8Query(source: Card) {
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

type CreateQuery = (source: Card) => unknown;

export function createAndVisitDashboardWithCardMatrix(
  createQueryFromCard: CreateQuery,
) {
  cy.then(function () {
    H.createQuestion({
      type: "question",
      query: createQueryFromCard(this.baseQuestion),
      name: "Question-based Question",
    }).then((response) => cy.wrap(response.body).as("qbq"));

    H.createQuestion({
      type: "question",
      query: createQueryFromCard(this.baseModel),
      name: "Model-based Question",
    }).then((response) => cy.wrap(response.body).as("mbq"));

    H.createQuestion({
      type: "model",
      name: "Question-based Model",
      query: createQueryFromCard(this.baseQuestion),
    }).then((response) => cy.wrap(response.body).as("qbm"));

    H.createQuestion({
      type: "model",
      name: "Model-based Model",
      query: createQueryFromCard(this.baseModel),
    }).then((response) => cy.wrap(response.body).as("mbm"));
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
  }).then((dashboard) => {
    H.visitDashboard(dashboard.id);
    cy.wrap(dashboard.id).as("dashboardId");
    cy.wait("@getDashboard");
  });
}

export function setup1stStageExplicitJoinFilter() {
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

  H.saveDashboard();
}

export function apply1stStageExplicitJoinFilter() {
  H.filterWidget().eq(0).click();
  H.popover()
    .first()
    .within(() => {
      cy.findByPlaceholderText("Search the list").type("abe.gorczany");
      cy.button("Add filter").click();
    });
}

export function setup1stStageImplicitJoinFromSourceFilter() {
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

  H.saveDashboard();

  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
    cy.findAllByPlaceholderText("Enter a number").eq(1).type("16");
    cy.button("Add filter").click();
  });
  cy.wait(["@dashboardData", "@dashboardData"]);
}

export function setup1stStageImplicitJoinFromJoinFilter() {
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

  H.saveDashboard();

  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findByLabelText("Gadget").click();
    cy.button("Add filter").click();
  });
  cy.wait(["@dashboardData", "@dashboardData"]);
}

export function setup1stStageCustomColumnFilter() {
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

  H.saveDashboard();

  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
    cy.findAllByPlaceholderText("Enter a number").eq(1).type("20");
    cy.button("Add filter").click();
  });
  cy.wait(["@dashboardData", "@dashboardData"]);
}

export function setup1stStageAggregationFilter() {
  H.editDashboard();

  getFilter("Number").click();
  H.sidebar().findByText("Filter operator").next().click();
  H.popover().findByText("Between").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Count").scrollIntoView().click();
  });

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Count").scrollIntoView().click();
  });

  H.saveDashboard();

  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
    cy.findAllByPlaceholderText("Enter a number").eq(1).type("2");
    cy.button("Add filter").click();
  });
  cy.wait(["@dashboardData", "@dashboardData"]);
}

export function setup1stStageBreakoutFilter() {
  H.editDashboard();

  getFilter("Text").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Product → Category", 0).scrollIntoView().click();
  });
  closeToasts();

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Product → Category", 0).scrollIntoView().click();
  });

  H.saveDashboard();

  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findByLabelText("Gadget").click();
    cy.button("Add filter").click();
  });
  cy.wait(["@dashboardData", "@dashboardData"]);
}

export function setup2ndStageExplicitJoinFilter() {
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

  H.saveDashboard();

  H.filterWidget().eq(0).click();
  H.popover()
    .first()
    .within(() => {
      cy.findByPlaceholderText("Search the list").type("abe.gorczany");
      cy.button("Add filter").click();
    });
  cy.wait(["@dashboardData", "@dashboardData"]);
}

export function setup2ndStageCustomColumnFilter() {
  H.editDashboard();

  getFilter("Number").click();
  H.sidebar().findByText("Filter operator").next().click();
  H.popover().findByText("Between").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("5 * Count").scrollIntoView().click();
  });

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("5 * Count").scrollIntoView().click();
  });

  H.saveDashboard();
}

export function apply2ndStageCustomColumnFilter() {
  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
    cy.findAllByPlaceholderText("Enter a number").eq(1).type("20");
    cy.button("Add filter").click();
  });
}

export function setup2ndStageAggregationFilter() {
  H.editDashboard();

  getFilter("Number").click();
  H.sidebar().findByText("Filter operator").next().click();
  H.popover().findByText("Between").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Count", 1).scrollIntoView().click();
  });

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Count", 1).scrollIntoView().click();
  });

  H.getDashboardCard(2).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Count").click();
  });

  H.getDashboardCard(3).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Count").click();
  });

  H.saveDashboard();
}

export function apply2ndStageAggregationFilter() {
  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
    cy.findAllByPlaceholderText("Enter a number").eq(1).type("2");
    cy.button("Add filter").click();
  });
}

export function setup2ndStageBreakoutFilter() {
  H.editDashboard();

  getFilter("Text").click();

  H.getDashboardCard(0).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Product → Category", 1).scrollIntoView().click();
  });
  closeToasts();

  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Product → Category", 1).scrollIntoView().click();
  });

  H.getDashboardCard(2).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Product → Category").scrollIntoView().click();
  });

  closeToasts();

  H.getDashboardCard(3).findByText("Select…").click();
  H.popover().within(() => {
    getPopoverItem("Product → Category").scrollIntoView().click();
  });

  H.saveDashboard();
}

function closeToasts() {
  H.undoToast().each((toast) => {
    cy.wrap(toast).icon("close").click();
  });
}

export function apply2ndStageBreakoutFilter() {
  H.filterWidget().eq(0).click();
  H.popover().within(() => {
    cy.findByLabelText("Gadget").click();
    cy.button("Add filter").click();
  });
}

export function getFilter(name: string) {
  return cy.findByTestId("fixed-width-filters").findByText(name);
}

/**
 * @param index if more than 1 item with the same name is visible, specify which one should be used
 */
function getPopoverItem(name: string, index = 0) {
  /**
   * Without scrollIntoView() the popover may scroll automatically to a different
   * place when clicking the item (unclear why).
   */
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return cy.findAllByText(name).eq(index).scrollIntoView();
}

export function goBackToDashboard() {
  cy.findByLabelText("Back to Test Dashboard").click();
  cy.findByTestId("dashboard-grid").should("be.visible");
}

export function getDashboardId(): Cypress.Chainable<DashboardId> {
  return cy.get<DashboardId>("@dashboardId").then((dashboardId) => dashboardId);
}

export function waitForPublicDashboardData(requestCount: number) {
  cy.wait(Array(requestCount).fill("@publicDashboardData"));
}

export function waitForEmbeddedDashboardData(requestCount: number) {
  cy.wait(Array(requestCount).fill("@embeddedDashboardData"));
}

export function verifyDashcardRowsCount({
  dashcardIndex,
  dashboardCount,
  queryBuilderCount,
}: {
  dashcardIndex: number;
  dashboardCount: number;
  queryBuilderCount: string;
}) {
  H.getDashboardCard(dashcardIndex).within(() => {
    H.assertTableRowsCount(dashboardCount);
  });
  H.getDashboardCard(dashcardIndex)
    .findByTestId("legend-caption-title")
    .click();
  cy.wait("@dataset");
  cy.findByTestId("question-row-count").should("have.text", queryBuilderCount);
}
