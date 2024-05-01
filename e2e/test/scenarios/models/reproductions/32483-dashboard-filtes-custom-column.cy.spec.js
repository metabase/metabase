import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  createQuestion,
  visitDashboard,
  filterWidget,
  getDashboardCard,
} from "e2e/support/helpers";
import {
  createMockActionParameter,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { addWidgetStringFilter } from "../../native-filters/helpers/e2e-field-filter-helpers";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const DASHBOARD_FILTER_TEXT = createMockActionParameter({
  id: "1",
  name: "Text filter",
  slug: "filter-text",
  type: "string/=",
  sectionId: "string",
});

describe("issue 32483", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("dashboard filter should be applied to the saved model with source containing custom column (metabase#32483)", () => {
    const questionDetails = {
      query: {
        "source-table": PEOPLE_ID,
        expressions: {
          "source state": [
            "concat",
            [
              "field",
              PEOPLE.SOURCE,
              {
                "base-type": "type/Text",
              },
            ],
            " ",
            [
              "field",
              PEOPLE.STATE,
              {
                "base-type": "type/Text",
              },
            ],
          ],
        },
      },
    };

    createQuestion(questionDetails, { wrapId: true });

    cy.get("@questionId").then(questionId => {
      const modelDetails = {
        type: "model",
        name: "Orders + People Question Model",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              alias: "People - User",
              condition: [
                "=",
                [
                  "field",
                  ORDERS.USER_ID,
                  {
                    "base-type": "type/Integer",
                  },
                ],
                [
                  "field",
                  "ID",
                  {
                    "base-type": "type/BigInteger",
                    "join-alias": "People - User",
                  },
                ],
              ],
              "source-table": `card__${questionId}`,
            },
          ],
        },
      };

      createQuestion(modelDetails).then(({ body: { id: modelId } }) => {
        const dashboardDetails = {
          name: "32483 Dashboard",
          parameters: [DASHBOARD_FILTER_TEXT],
          dashcards: [
            createMockDashboardCard({
              id: 1,
              size_x: 8,
              size_y: 8,
              card_id: questionId,
              parameter_mappings: [
                createTextFilterMapping({
                  card_id: questionId,
                  fieldRef: [
                    "expression",
                    "source state",
                    {
                      "base-type": "type/Text",
                    },
                  ],
                }),
              ],
            }),
            createMockDashboardCard({
              id: 2,
              size_x: 8,
              size_y: 8,
              card_id: modelId,
              parameter_mappings: [
                createTextFilterMapping({
                  card_id: modelId,
                  fieldRef: [
                    "field",
                    "source state",
                    {
                      "base-type": "type/Text",
                      "join-alias": "People - User",
                    },
                  ],
                }),
              ],
            }),
          ],
        };

        cy.createDashboard(dashboardDetails).then(
          ({ body: { id: dashboardId } }) => {
            visitDashboard(dashboardId);
          },
        );
      });
    });

    filterWidget().click();
    addWidgetStringFilter("Facebook MN");

    getDashboardCard(1).should("contain", "Orders + People Question Model");
  });
});

const createTextFilterMapping = ({ card_id, fieldRef }) => {
  return {
    card_id,
    parameter_id: DASHBOARD_FILTER_TEXT.id,
    target: ["dimension", fieldRef],
  };
};
