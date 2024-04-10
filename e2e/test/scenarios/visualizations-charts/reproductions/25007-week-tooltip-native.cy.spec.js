import { restore, popover, lineChartCircle } from "e2e/support/helpers";

const questionDetails = {
  name: "11435",
  display: "line",
  native: {
    query: `SELECT dateadd('day', CAST((1 - CASE WHEN ((iso_day_of_week("PUBLIC"."ORDERS"."CREATED_AT") + 1) % 7) = 0 THEN 7 ELSE ((iso_day_of_week("PUBLIC"."ORDERS"."CREATED_AT") + 1) % 7) END) AS long), CAST("PUBLIC"."ORDERS"."CREATED_AT" AS date)) AS "CREATED_AT", count(*) AS "count"
FROM "PUBLIC"."ORDERS"
GROUP BY dateadd('day', CAST((1 - CASE WHEN ((iso_day_of_week("PUBLIC"."ORDERS"."CREATED_AT") + 1) % 7) = 0 THEN 7 ELSE ((iso_day_of_week("PUBLIC"."ORDERS"."CREATED_AT") + 1) % 7) END) AS long), CAST("PUBLIC"."ORDERS"."CREATED_AT" AS date))
ORDER BY dateadd('day', CAST((1 - CASE WHEN ((iso_day_of_week("PUBLIC"."ORDERS"."CREATED_AT") + 1) % 7) = 0 THEN 7 ELSE ((iso_day_of_week("PUBLIC"."ORDERS"."CREATED_AT") + 1) % 7) END) AS long), CAST("PUBLIC"."ORDERS"."CREATED_AT" AS date)) ASC`,
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

describe("issue 25007", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display weeks correctly in tooltips for native questions (metabase#25007)", () => {
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
    clickLineDot({ index: 1 });
    popover().findByTextEnsureVisible("May 1–7, 2022");
  });
});

const clickLineDot = ({ index } = {}) => {
  lineChartCircle().eq(index).click({ force: true });
};
