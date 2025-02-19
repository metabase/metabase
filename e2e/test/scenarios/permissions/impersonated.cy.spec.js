const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";

const { ALL_USERS_GROUP, COLLECTION_GROUP } = USER_GROUPS;

const PG_DB_ID = 2;

describe("impersonated permission", { tags: "@external" }, () => {
  describe("admins", () => {
    beforeEach(() => {
      H.restore("postgres-12");
      H.createTestRoles({ type: "postgres" });
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
    });

    describe("impersonated users", () => {
      const setImpersonatedPermission = () => {
        cy.updatePermissionsGraph(
          {
            [ALL_USERS_GROUP]: {
              1: {
                "view-data": "unrestricted",
                "create-queries": "query-builder-and-native",
              },
              [PG_DB_ID]: {
                "view-data": "impersonated",
                "create-queries": "query-builder-and-native",
              },
            },
            [COLLECTION_GROUP]: {
              1: { "view-data": "blocked" },
              [PG_DB_ID]: { "view-data": "blocked" },
            },
          },
          [
            {
              db_id: PG_DB_ID,
              group_id: ALL_USERS_GROUP,
              attribute: "role",
            },
          ],
        );
      };

      beforeEach(() => {
        H.restore("postgres-12");
        H.createTestRoles({ type: "postgres" });
        cy.signInAsAdmin();
        H.setTokenFeatures("all");

        setImpersonatedPermission();

        cy.signInAsImpersonatedUser();
      });

      it("have limited access", () => {
        cy.visit(`/browse/databases/${PG_DB_ID}`);

        // No access through the visual query builder
        cy.get("main").within(() => {
          cy.findByText("Reviews").click();
          cy.findByText("There was a problem with your question");
          cy.findByText("Show error details").click();
          cy.findByText("ERROR: permission denied for table reviews");
        });

        // Has access to allowed tables
        cy.visit(`/browse/databases/${PG_DB_ID}`);

        cy.get("main").findByText("Orders").click();
        cy.findAllByTestId("header-cell").contains("Subtotal");

        cy.reload();

        // No access through the native query builder
        H.startNewNativeQuestion();

        cy.findByTestId("gui-builder-data").click();
        cy.findByLabelText("QA Postgres12").click();
        H.NativeEditor.type("select * from reviews");
        H.runNativeQuery();

        cy.findByTestId("query-builder-main").within(() => {
          cy.findByText("An error occurred in your query");
          cy.findByText("ERROR: permission denied for table reviews");
        });

        // Has access to other tables
        H.NativeEditor.type("{selectall}{backspace}", { delay: 50 }).type(
          "select * from orders",
        );

        H.runNativeQuery();

        cy.findAllByTestId("header-cell").contains("subtotal");
      });
    });
  });
});
