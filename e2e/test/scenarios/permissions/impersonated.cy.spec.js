const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";
import * as PH from "e2e/test/scenarios/admin/performance/helpers/e2e-strategy-form-helpers";

const { ALL_USERS_GROUP, COLLECTION_GROUP } = USER_GROUPS;

const PG_DB_ID = 2;

describe("impersonated permission", { tags: "@external" }, () => {
  describe("admins", () => {
    beforeEach(() => {
      H.restore("postgres-12");
      H.createTestRoles({ type: "postgres" });
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
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
        H.activateToken("pro-self-hosted");

        setImpersonatedPermission();
      });

      it("have limited access", () => {
        cy.signInAsImpersonatedUser();

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

      it("caching should not circumvent impersonation permissions", () => {
        cy.log(
          "create a question for a table the impersonated user does not have access to",
        );
        H.startNewNativeQuestion();
        cy.findByTestId("gui-builder-data").click();
        cy.findByLabelText("QA Postgres12").click();
        H.NativeEditor.type("select * from reviews");
        H.runNativeQuery();
        H.saveQuestion("foo", undefined, {
          path: ["Our analytics", "First collection"],
          select: true,
        });

        cy.log("configure caching");
        PH.openSidebar("question");
        cy.findByLabelText("When to get new results").click();
        PH.cacheStrategySidesheet().within(() => {
          cy.findByText(/Use default/).click();
          cy.findByText(/Caching settings/).should("be.visible");
          PH.durationRadioButton().click();
          cy.findByRole("button", { name: /Save/ }).click();
        });

        cy.log("prime and assert results are cached");
        cy.intercept("POST", "/api/card/*/query").as("query");
        cy.reload(); // load once to warm cache
        cy.findAllByTestId("header-cell").contains("reviewer");
        cy.wait("@query").then(({ response }) => {
          expect(response.body.cached).to.equal(null);
        });
        cy.reload(); // load again to hit cache
        cy.findAllByTestId("header-cell").contains("reviewer");
        cy.wait("@query").then(({ response }) => {
          expect(response.body.cached).to.be.a("string");
        });

        cy.log("switch to impersonated user");
        cy.signOut();
        cy.signInAsImpersonatedUser();
        cy.reload();

        cy.log("check that impersonation enforcement occurrs");
        cy.findByTestId("query-builder-main").within(() => {
          cy.findByText("An error occurred in your query");
          cy.findByText("ERROR: permission denied for table reviews");
        });
      });
    });
  });
});
