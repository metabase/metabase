import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type StructuredQuestionDetails,
  chartPathWithFillColor,
  createQuestion,
  echartsContainer,
  getDraggableElements,
  modal,
  moveDnDKitElement,
  popover,
  restore,
  sidebar,
  visitQuestionAdhoc,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 43075", () => {
  const questionDetails: StructuredQuestionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
  };
  beforeEach(() => {
    cy.viewport(1000, 300);

    restore();
    cy.signInAsAdmin();

    createQuestion(questionDetails, { visitQuestion: true });
  });

  it("the breakout popover should fit within the window (metabase#43075)", () => {
    cy.findAllByTestId("cell-data").contains("54").click();
    popover().findByText("Break out by…").click();
    popover().findByText("Category").click();

    cy.window().then(win => {
      expect(win.document.documentElement.scrollHeight).to.be.lte(
        win.document.documentElement.offsetHeight,
      );
    });
  });
});

describe("issue 41133", () => {
  const questionDetails: StructuredQuestionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
    },
  };
  beforeEach(() => {
    cy.viewport(600, 400);
    restore();
    cy.signInAsAdmin();
    createQuestion(questionDetails, { visitQuestion: true });
  });

  it("object detail view should be scrollable on narrow screens (metabase#41133)", () => {
    cy.findByTestId("detail-shortcut").eq(0).click();

    modal().within(() => {
      cy.findByText("Created At").scrollIntoView().should("be.visible");
      cy.findByText("is connected to:").scrollIntoView().should("be.visible");
    });
  });
});

describe("issue 45255", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "select 'foo' step, 10 v union all select 'baz', 8 union all select null, 6 union all select 'bar', 4",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "funnel",
    });
  });

  it("should work on native queries with null dimension values (metabase#45255)", () => {
    cy.findByTestId("viz-settings-button").click();

    // Has (empty) in the settings sidebar
    sidebar().findByText("(empty)");

    // Can reorder (empty)
    getDraggableElements().eq(2).should("have.text", "(empty)");
    moveDnDKitElement(getDraggableElements().first(), { vertical: 100 });
    getDraggableElements().eq(1).should("have.text", "(empty)");

    // Has (empty) in the chart
    cy.findByTestId("funnel-chart").findByText("(empty)");
  });
});

describe("issue 49874", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("when two axis should show only one related to the hovered series", () => {
    const question = {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.QUANTITY, null]],
            ["sum", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        database: 1,
      },
      display: "bar",
    };

    visitQuestionAdhoc(question);

    echartsContainer().within(() => {
      cy.findByText("Sum of Quantity").should("be.visible");
      cy.findByText("Sum of Total").should("be.visible");
    });

    chartPathWithFillColor("#88BF4D").first().realHover();

    echartsContainer().within(() => {
      cy.findByText("Sum of Quantity").should("be.visible");
      cy.findByText("Sum of Total").should("not.exist");
    });

    chartPathWithFillColor("#98D9D9").first().realHover();

    echartsContainer().within(() => {
      cy.findByText("Sum of Quantity").should("not.exist");
      cy.findByText("Sum of Total").should("be.visible");
    });
  });
});
