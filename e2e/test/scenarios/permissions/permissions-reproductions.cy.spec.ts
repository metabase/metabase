const { H } = cy;
import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  ConcreteFieldReference,
  StructuredQuery,
} from "metabase-types/api";
import { DataPermission, DataPermissionValue } from "metabase-types/api";

const { ALL_USERS_GROUP } = USER_GROUPS;
const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

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
    H.restore();
    cy.signInAsAdmin();
    H.createQuestion(
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
    H.createQuestion(
      {
        database: SAMPLE_DB_ID,
        query: QUERY,
        display: "combo",
      },
      { wrapId: true, idAlias: "comboQuestionId" },
    );
    cy.signIn("readonly");
  });

  it("does not show raw data toggle for pivot questions, nor offer to save combo question viewed in raw mode (metabase#11994)", () => {
    H.visitQuestion("@pivotQuestionId");
    cy.findByTestId("pivot-table").should("be.visible");
    cy.icon("table2").should("not.exist");
    cy.findByTestId("qb-header").findByText(/Save/).should("not.exist");

    H.visitQuestion("@comboQuestionId");
    cy.location().then((questionLocation) => {
      cy.icon("table2").click();
      H.tableInteractive().should("be.visible");
      cy.location("href").should("eq", questionLocation.href);
    });
    cy.findByTestId("qb-header").findByText(/Save/).should("not.exist");
  });
});

describe("issue 39221", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/setting").as("siteSettings");

    H.restore();
  });

  ["admin", "normal"].forEach((user) => {
    it(`${user.toUpperCase()}: updating user-specific setting should not result in fetching all site settings (metabase#39221)`, () => {
      cy.signOut();
      // Unjustified type cast. FIXME
      cy.signIn(user as "admin" | "normal");
      H.openReviewsTable({ mode: "notebook" });
      cy.findByLabelText("View SQL").click();
      cy.findByTestId("native-query-preview-sidebar").should("be.visible");

      cy.intercept(
        "PUT",
        "/api/setting/notebook-native-preview-sidebar-width",
      ).as("updateSidebarWidth");
      cy.intercept("GET", "/api/session/properties").as("sessionProperties");

      // Resizing the SQL preview sidebar triggers a user-local setting update
      const options = { pointer: "mouse", button: "left" } as const;
      cy.findByTestId("notebook-native-preview-resize-handle").realMouseDown(
        options,
      );
      cy.findByTestId("notebook-native-preview-resize-handle").realMouseMove(
        -200,
        0,
      );
      cy.findByTestId("notebook-native-preview-resize-handle").realMouseUp(
        options,
      );

      cy.wait(["@updateSidebarWidth", "@sessionProperties"]);

      cy.get("@siteSettings.all").should("have.length", 0);
    });
  });
});

describe("issue 76710", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          [DataPermission.VIEW_DATA]: {
            PUBLIC: {
              [ORDERS_ID]: DataPermissionValue.UNRESTRICTED,
              [PRODUCTS_ID]: DataPermissionValue.BLOCKED,
            },
          },
          [DataPermission.CREATE_QUERIES]: {
            PUBLIC: {
              [ORDERS_ID]: DataPermissionValue.QUERY_BUILDER,
            },
          },
        },
      },
    });
  });

  it("can view a table whose foreign key targets a table the user can't access (metabase#76710)", () => {
    cy.intercept("GET", `/api/field/${PRODUCTS.ID}`).as("fkTargetField");
    cy.signIn("none");
    cy.visit(`/table/${ORDERS_ID}`);
    cy.wait("@fkTargetField").its("response.statusCode").should("eq", 403);
    H.tableInteractive().should("be.visible");
    H.tableHeaderColumn("Product ID").should("be.visible");
  });
});
