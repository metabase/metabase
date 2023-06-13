import {
  addOrUpdateDashboardCard,
  editDashboard,
  getDashboardCards,
  restore,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { ORDERS, ORDERS_ID, PEOPLE } from "metabase-types/api/mocks/presets";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

const MOCK_QUESTION_NAME = "MOCK_QUESTION_NAME";

const commonQuestionFields = {
  name: MOCK_QUESTION_NAME,
  query: {
    "source-table": ORDERS_ID,
    limit: 10,
    aggregation: [["count"]],
  },
  database: SAMPLE_DB_ID,
};

// covers table, bar, line, pie, row, area, combo, pivot, funnel, detail, and waterfall questions
const createMockChartQuestion = vizType => {
  return {
    ...commonQuestionFields,
    query: {
      ...commonQuestionFields.query,
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "minute" }]],
    },
    display: vizType,
  };
};

// covers scalar, gauge, and progress questions
const createMockScalarQuestion = vizType => {
  return {
    ...commonQuestionFields,
    display: vizType,
  };
};

// covers map questions
const createMockMapQuestion = () => {
  return {
    ...commonQuestionFields,
    query: {
      ...commonQuestionFields.query,
      breakout: [["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }]],
    },
    display: "map",
  };
};

const TEST_DATA = [
  ...[
    "table",
    "bar",
    "line",
    "pie",
    "row",
    "area",
    "combo",
    "pivot",
    "funnel",
    "object",
    "waterfall",
  ].map(vizType => [vizType, createMockChartQuestion(vizType)]),
  ...["scalar", "gauge", "progress"].map(vizType => [
    vizType,
    createMockScalarQuestion(vizType),
  ]),
  ["map", createMockMapQuestion()],
];

describe("scenarios > dashboard card resizing", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  TEST_DATA.forEach(([vizType, question]) => {
    it(`should initially display the ${vizType} card with its default size`, () => {
      cy.createDashboard().then(({ body: { id: dashId } }) => {
        cy.createQuestion(question).then(() => {
          visitDashboard(dashId);
          cy.findByTestId("dashboard-header").within(() => {
            cy.findByLabelText("Edit dashboard").click();
            cy.findByLabelText("Add questions").click();
          });
          cy.findByLabelText(MOCK_QUESTION_NAME).click();
          saveDashboard();

          cy.request("GET", `/api/dashboard/${dashId}`).then(({ body }) => {
            expect(body.ordered_cards[0].size_x).to.equal(
              getDefaultSize(vizType).width,
            );
            expect(body.ordered_cards[0].size_y).to.equal(
              getDefaultSize(vizType).height,
            );
          });
        });
      });
    });

    it(`should not allow ${vizType} cards to be resized smaller than min height`, () => {
      const initSmallSize = { width: 2, height: 2 };
      cy.createDashboard().then(({ body: { id: dashId } }) => {
        cy.createQuestion(question).then(({ body: { id: card_id } }) => {
          addOrUpdateDashboardCard({
            card_id,
            dashboard_id: dashId,
            card: {
              row: 0,
              col: 0,
              size_x: initSmallSize.width,
              size_y: initSmallSize.height,
            },
          });
          visitDashboard(dashId);

          const resizeHandle = getDashboardCards().get(
            ".react-resizable-handle",
          );

          editDashboard();

          // resize card with tiny dimensions to a size > minSize to test if we can shrink it
          // back to its initial state
          resizeHandle
            .trigger("mousedown", { button: 0 })
            .trigger("mousemove", {
              clientX: getDefaultSize(vizType).width * 100,
              clientY: getDefaultSize(vizType).height * 100,
            })
            .trigger("mouseup", { force: true });

          saveDashboard();
          editDashboard();

          // attempt to resize card back to 2x2, which should not be possible after saving
          resizeHandle
            .trigger("mousedown", { button: 0 })
            .trigger("mousemove", {
              clientX:
                -(getDefaultSize(vizType).width - initSmallSize.width) * 100,
              clientY:
                -(getDefaultSize(vizType).height - initSmallSize.height) * 100,
            })
            .trigger("mouseup", { force: true });

          saveDashboard();

          cy.request("GET", `/api/dashboard/${dashId}`).then(({ body }) => {
            expect(body.ordered_cards[0].size_x).to.equal(
              getMinSize(vizType).width,
            );
            expect(body.ordered_cards[0].size_y).to.equal(
              getMinSize(vizType).height,
            );
          });
        });
      });
    });
  });
});
