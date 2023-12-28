import { restore, visitQuestionAdhoc } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const TEST_QUERY = {
  type: "native",
  native: {
    query: `
WITH
   L0   AS (SELECT c FROM (SELECT 1 UNION ALL SELECT 1) AS D(c)) -- 2^1
  ,L1   AS (SELECT 1 AS c FROM L0 AS A CROSS JOIN L0 AS B)       -- 2^2
  ,L2   AS (SELECT 1 AS c FROM L1 AS A CROSS JOIN L1 AS B)       -- 2^4
  ,L3   AS (SELECT 1 AS c FROM L2 AS A CROSS JOIN L0 AS B)       -- 2^5

SELECT ROWNUM() id, DATEADD('DAY', ROWNUM(), CURRENT_DATE)::DATE date,
RAND() c00, RAND() c01, RAND() c02, RAND() c03, RAND() c04, RAND() c05, RAND() c06, RAND() c07, RAND() c08, RAND() c09,
RAND() c10, RAND() c11, RAND() c12, RAND() c13, RAND() c14, RAND() c15, RAND() c16, RAND() c17, RAND() c18, RAND() c19,
RAND() c20, RAND() c21, RAND() c22, RAND() c23, RAND() c24, RAND() c25, RAND() c26, RAND() c27, RAND() c28, RAND() c29,
RAND() c30, RAND() c31
FROM L3
    `,
  },
  database: SAMPLE_DB_ID,
};

describe("issue 21392", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should render a chart with many columns without freezing (metabase#21392)", () => {
    visitQuestionAdhoc({ dataset_query: TEST_QUERY, display: "line" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").should("be.visible");
  });
});
