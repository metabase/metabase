import {
  restore,
  setupSMTP,
  openEmailPage,
  sendSubscriptionsEmail,
  visitDashboard,
} from "e2e/support/helpers";

import { USERS, SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const { admin } = USERS;

describe("static visualizations", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
  });

  it("gauge chart", () => {
    const dashboardName = "Gauge bar charts dashboard";
    cy.createDashboardWithQuestions({
      dashboardName,
      questions: [
        createGaugeQuestion([0, 9380, 18760, 37520]),
        createGaugeQuestion([0, 9380, 18760, 37520], undefined, {
          '["name","count"]': {
            number_style: "currency",
            number_separators: ".’",
            scale: 2,
            prefix: "<",
            suffix: ">",
            decimals: 1,
          },
        }),
        createGaugeQuestion(
          [0, 9380, 18760, 37520],
          ["I am a very very long label", "Not long label", "Label"],
        ),
        createGaugeQuestion([0, 9380, 18760, 30000]),
        createGaugeQuestion([0, 9380, 18760, 37520, 75040]),
        createGaugeQuestion([20000, 30000, 40000]),
        createGaugeQuestion([0, 5000, 10000]),
      ],
    }).then(({ dashboard }) => {
      visitDashboard(dashboard.id);

      sendSubscriptionsEmail(`${admin.first_name} ${admin.last_name}`);

      openEmailPage(dashboardName).then(() => {
        cy.createPercySnapshot();
      });
    });
  });
});

/**
 * @param {number[]} range
 * @param {string[]=} range
 * @param {object=} columnSettings
 */
function createGaugeQuestion(range, labels, columnSettings) {
  const colors = ["#ED6E6E", "#F9CF48", "#84BB4C", "#509EE3"];
  return {
    name: `Gauge chart with range "${range}"`,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
    visualization_settings: {
      "gauge.segments": range
        .map((value, index) => {
          const nextValue = range[index + 1];
          if (nextValue) {
            return {
              min: value,
              max: nextValue,
              color: colors[index],
              label: labels?.[index] || `Label ${index + 1}`,
            };
          }
        })
        .filter(value => value),
      ...(columnSettings && { column_settings: columnSettings }),
    },
    display: "gauge",
    database: SAMPLE_DB_ID,
  };
}
