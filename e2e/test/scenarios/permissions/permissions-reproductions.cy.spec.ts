import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  restore,
  visitQuestion,
  openReviewsTable,
} from "e2e/support/helpers";
import type {
  ConcreteFieldReference,
  StructuredQuery,
} from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const ORDERS_TOTAL_FIELD: ConcreteFieldReference = [
  "field",
  ORDERS.TOTAL,
  {
    "base-type": "type/Float",
  },
];

const CREATED_AT_MONTH_BREAKOUT: ConcreteFieldReference = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
  },
];

const QUERY: StructuredQuery = {
  "source-table": ORDERS_ID,
  aggregation: [["count"], ["sum", ORDERS_TOTAL_FIELD]],
  breakout: [CREATED_AT_MONTH_BREAKOUT],
};

describe("issue 11994", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    createQuestion(
      {
        database: SAMPLE_DB_ID,
        query: QUERY,
        display: "pivot",
        // If these visualization_settings are missing, they will be automatically
        // added in FE, which will turn the question dirty, which will cause
        // permission issues due to an extra call to /api/dataset/pivot endpoint.
        visualization_settings: {
          "pivot_table.column_split": {
            rows: [CREATED_AT_MONTH_BREAKOUT],
            columns: [],
            values: [
              ["aggregation", 0],
              ["aggregation", 1],
            ],
          },
          "pivot_table.column_widths": {
            leftHeaderWidths: [141],
            totalLeftHeaderWidths: 141,
            valueHeaderWidths: {},
          },
        },
      },
      { wrapId: true, idAlias: "pivotQuestionId" },
    );
    createQuestion(
      {
        database: SAMPLE_DB_ID,
        query: QUERY,
        display: "combo",
      },
      { wrapId: true, idAlias: "comboQuestionId" },
    );
    cy.signIn("readonly");
  });

  it("does not show raw data toggle for pivot questions (metabase#11994)", () => {
    visitQuestion("@pivotQuestionId");
    cy.icon("table2").should("not.exist");
    cy.findByTestId("qb-header").findByText(/Save/).should("not.exist");
  });

  it("does not offer to save combo question viewed in raw mode (metabase#11994)", () => {
    visitQuestion("@comboQuestionId");
    cy.location().then(questionLocation => {
      cy.icon("table2").click();
      cy.location("href").should("eq", questionLocation.href);
    });
    cy.findByTestId("qb-header").findByText(/Save/).should("not.exist");
  });
});

describe("issue 39221", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/setting").as("siteSettings");
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");

    restore();
  });

  ["admin", "normal"].forEach(user => {
    it(`${user.toUpperCase()}: updating user-specific setting should not result in fetching all site settings (metabase#39221)`, () => {
      cy.signOut();
      cy.signIn(user as "admin" | "normal");
      openReviewsTable({ mode: "notebook" });
      // Opening a SQL preview sidebar will trigger a user-local setting update
      cy.findByLabelText("View the SQL").click();

      cy.wait("@sessionProperties");

      cy.get("@siteSettings").should("be.null");
    });
  });
});
