import { restore, popover } from "e2e/support/helpers";

const questionDetails = {
  name: "11435",
  display: "line",
  native: {
    query: `
SELECT "PUBLIC"."ORDERS"."ID" AS "ID", "PUBLIC"."ORDERS"."USER_ID" AS "USER_ID", "PUBLIC"."ORDERS"."PRODUCT_ID" AS "PRODUCT_ID", "PUBLIC"."ORDERS"."SUBTOTAL" AS "SUBTOTAL", "PUBLIC"."ORDERS"."TAX" AS "TAX", "PUBLIC"."ORDERS"."TOTAL" AS "TOTAL", "PUBLIC"."ORDERS"."DISCOUNT" AS "DISCOUNT", "PUBLIC"."ORDERS"."CREATED_AT" AS "CREATED_AT", "PUBLIC"."ORDERS"."QUANTITY" AS "QUANTITY"
FROM "PUBLIC"."ORDERS"
WHERE ("PUBLIC"."ORDERS"."CREATED_AT" >= timestamp with time zone '2019-03-12 00:00:00.000+03:00'
       AND "PUBLIC"."ORDERS"."CREATED_AT" < timestamp with time zone '2019-03-13 00:00:00.000+03:00')
LIMIT 1048575`,
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["TOTAL"],
    column_settings: {
      '["name","CREATED_AT"]': {
        time_enabled: "milliseconds",
      },
    },
  },
};

describe("issue 11435", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should use time formatting settings in tooltips for native questions (metabase#11435)", () => {
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
    clickLineDot({ index: 1 });
    popover().findByTextEnsureVisible("March 11, 2019, 8:45:17.010 PM");
  });
});

const clickLineDot = ({ index } = {}) => {
  cy.get(".Visualization .dot").eq(index).click({ force: true });
};
