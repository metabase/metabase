const { H } = cy;
import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP } = USER_GROUPS;

const {
  PRODUCTS_ID,
  ORDERS_ID,
  PEOPLE_ID,
  REVIEWS_ID,
  ACCOUNTS_ID,
  ANALYTIC_EVENTS_ID,
  FEEDBACK_ID,
  INVOICES_ID,
} = SAMPLE_DATABASE;

const DATA_ACCESS_PERMISSION_INDEX = 0;
const DOWNLOAD_PERMISSION_INDEX = 2;

describe("scenarios > admin > permissions > data > downloads", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    // Restrict downloads for Collection and Data groups before each test so that they don't override All Users
    cy.updatePermissionsGraph({
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: "none" },
        },
      },
      [DATA_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: "none" },
        },
      },
    });
  });

  it("setting downloads permission UI flow should work", () => {
    cy.log("allows changing download results permission for a database");

    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    H.modifyPermission("All Users", DOWNLOAD_PERMISSION_INDEX, "No");

    cy.button("Save changes").click();

    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    H.assertPermissionForItem("All Users", DOWNLOAD_PERMISSION_INDEX, "No");

    cy.log("Make sure we can change download results permission for a table");

    H.sidebar().contains("Orders").click();

    H.modifyPermission(
      "All Users",
      DOWNLOAD_PERMISSION_INDEX,
      "1 million rows",
    );

    cy.button("Save changes").click();

    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    H.assertPermissionForItem(
      "All Users",
      DOWNLOAD_PERMISSION_INDEX,
      "1 million rows",
    );
  });

  it("respects 'no download' permissions when 'All users' group data permissions are set to `Blocked` (metabase#22408)", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    H.modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Blocked");

    cy.button("Save changes").click();

    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    // When data permissions are set to `Blocked`, download permissions are automatically revoked
    H.assertPermissionForItem("All Users", DOWNLOAD_PERMISSION_INDEX, "No");

    // Normal user belongs to both "data" and "collection" groups.
    // They both have restricted downloads so this user shouldn't have the right to download anything.
    cy.signInAsNormalUser();

    H.visitQuestion(ORDERS_QUESTION_ID);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing first 2,000 rows");
    cy.icon("download").should("not.exist");
  });

  it("restricts users from downloading questions", () => {
    // Restrict downloads for All Users
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: "none" },
        },
      },
    });

    cy.signInAsNormalUser();

    H.visitQuestion(ORDERS_QUESTION_ID);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing first 2,000 rows");
    cy.icon("download").should("not.exist");

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.findByTestId("dashcard").within(() => {
      cy.findByTestId("legend-caption").realHover();
      cy.findByTestId("dashcard-menu").click();
    });

    H.popover().within(() => {
      cy.findByText("Edit question").should("be.visible");
      cy.findByText("Download results").should("not.exist");
    });
  });

  it("limits users from downloading all results", () => {
    // Restrict downloads for All Users
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: "limited" },
        },
      },
    });

    cy.signInAsNormalUser();
    H.visitQuestion(ORDERS_QUESTION_ID);

    H.downloadAndAssert({ fileType: "xlsx", questionId: ORDERS_QUESTION_ID });
  });

  describe("native questions", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");

      H.createNativeQuestion(
        {
          name: "Native Orders",
          native: {
            query: "select * from orders",
          },
        },
        { wrapId: true, idAlias: "nativeQuestionId" },
      );
    });

    it("lets user download results from native queries", () => {
      cy.signInAsNormalUser();

      cy.get("@nativeQuestionId").then((id) => {
        H.visitQuestion(id);

        H.downloadAndAssert({ fileType: "xlsx", questionId: id });

        // Make sure we can download results from an ad-hoc nested query based on a native question
        cy.findByText("Explore results").click();
        cy.wait("@dataset");

        H.downloadAndAssert({ fileType: "xlsx" });

        // Make sure we can download results from a native model
        cy.request("PUT", `/api/card/${id}`, { name: "Native Model" });

        H.visitQuestion(id);

        H.downloadAndAssert({ fileType: "xlsx", questionId: id });
      });
    });

    it("prevents user from downloading a native question even if only one table doesn't have download permissions", () => {
      setDownloadPermissionsForProductsTable("none");

      cy.signInAsNormalUser();

      cy.get("@nativeQuestionId").then((id) => {
        H.visitQuestion(id);

        cy.findByText("Showing first 2,000 rows");
        cy.icon("download").should("not.exist");

        // Ad-hoc nested query also shouldn't be downloadable
        cy.findByText("Explore results").click();
        cy.wait("@dataset");

        cy.findByText("Showing first 2,000 rows");
        cy.icon("download").should("not.exist");

        // Convert question to a model, which also shouldn't be downloadable
        cy.request("PUT", `/api/card/${id}`, { name: "Native Model" });

        H.visitQuestion(id);

        cy.findByText("Showing first 2,000 rows");
        cy.icon("download").should("not.exist");
      });
    });

    it("limits download results for a native question even if only one table has `limited` download permissions", () => {
      setDownloadPermissionsForProductsTable("limited");

      cy.signInAsNormalUser();

      cy.get("@nativeQuestionId").then((id) => {
        H.visitQuestion(id);

        H.downloadAndAssert({ fileType: "xlsx", questionId: id });

        // Ad-hoc nested query based on a native question should also have a download row limit
        cy.findByText("Explore results").click();
        cy.wait("@dataset");

        H.downloadAndAssert({ fileType: "xlsx" });

        // Convert question to a model, which should also have a download row limit
        cy.request("PUT", `/api/card/${id}`, { name: "Native Model" });

        H.visitQuestion(id);

        H.downloadAndAssert({ fileType: "xlsx", questionId: id });
      });
    });
  });
});

function setDownloadPermissionsForProductsTable(permission) {
  cy.updatePermissionsGraph({
    [ALL_USERS_GROUP]: {
      [SAMPLE_DB_ID]: {
        download: {
          schemas: {
            PUBLIC: {
              [PRODUCTS_ID]: permission,
              [ORDERS_ID]: "full",
              [PEOPLE_ID]: "full",
              [REVIEWS_ID]: "full",
              [ACCOUNTS_ID]: "full",
              [ANALYTIC_EVENTS_ID]: "full",
              [FEEDBACK_ID]: "full",
              [INVOICES_ID]: "full",
            },
          },
        },
      },
    },
  });
}
