import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { checkNotNull } from "metabase/lib/types";
import type { CollectionItem, Dashboard } from "metabase-types/api";

import {
  assertAllResultsAndValuesAreSandboxed,
  assertNoResultsOrValuesAreSandboxed,
  assignAttributeToUser,
  configureSandboxPolicy,
  createSandboxingDashboardAndQuestions,
  gizmoViewer,
  modelCustomView,
  questionCustomView,
  signInAs,
  widgetViewer,
} from "./helpers/e2e-sandboxing-helpers";

const { H } = cy;

const preparePermissions = () => {
  H.blockUserGroupPermissions(USER_GROUPS.ALL_USERS_GROUP);
  H.blockUserGroupPermissions(USER_GROUPS.COLLECTION_GROUP);
  H.blockUserGroupPermissions(USER_GROUPS.READONLY_GROUP);
};

describe(
  "admin > permissions > sandboxing (tested via the admin UI)",
  { tags: "@external" },
  () => {
    /** Saved questions and models we'll try to filter with sandboxing policies */
    const sandboxableQuestions: CollectionItem[] = [];

    /** A dashboard where we'll put all the saved questions and models we want to test */
    let dashboard: Dashboard | null = null;

    /** Saved questions and models used as custom views */
    const customViews: CollectionItem[] = [];

    before(() => {
      cy.intercept("/api/card/*/query").as("cardQuery");

      H.restore("postgres-12");

      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      preparePermissions();
      createSandboxingDashboardAndQuestions().then((result) => {
        const { data } = result.body;
        for (const item of data) {
          if (/Dashboard/i.test(item.name)) {
            dashboard = item as unknown as Dashboard;
          } else if (/Question|Model/i.test(item.name)) {
            sandboxableQuestions.push(item);
          } else if (/Custom view/i.test(item.name)) {
            customViews.push(item);
          } else {
            throw new TypeError();
          }
        }
      });
      // @ts-expect-error - this isn't typed yet
      cy.createUserFromRawData(gizmoViewer);
      // @ts-expect-error - this isn't typed yet
      cy.createUserFromRawData(widgetViewer);

      // this setup is a bit heavy, so let's just do it once
      H.snapshot("sandboxing-snapshot");
    });

    beforeEach(() => {
      cy.intercept("/api/card/*/query").as("cardQuery");

      cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as(
        "dashcardQuery",
      );
      cy.intercept("POST", "/api/dataset").as("datasetQuery");
      H.restore("sandboxing-snapshot" as any);
    });

    it("shows all data before sandboxing policy is applied - gizmoViewer", () => {
      signInAs(gizmoViewer);
      assertNoResultsOrValuesAreSandboxed(dashboard, sandboxableQuestions);
    });

    // this test looks like it could be merged with the previous one,
    // but then it flakes at a very high rate
    it("shows all data before sandboxing policy is applied - widgetViewer", () => {
      signInAs(widgetViewer);
      assertNoResultsOrValuesAreSandboxed(dashboard, sandboxableQuestions);
    });

    describe("we can apply a sandbox policy", () => {
      beforeEach(() => {
        cy.signInAsAdmin();
      });

      it("to a table filtered using a question as a custom view", () => {
        configureSandboxPolicy({
          filterTableBy: "custom_view",
          customViewType: "Question" as const,
          customViewName: questionCustomView.name,
        });
        cy.log(
          "This sandboxing policy doesn't use user attributes. It makes all users see only the Gizmos.",
        );
        signInAs(gizmoViewer);
        assertAllResultsAndValuesAreSandboxed(
          dashboard,
          sandboxableQuestions,
          "Gizmo",
        );
        signInAs(widgetViewer);
        assertAllResultsAndValuesAreSandboxed(
          dashboard,
          sandboxableQuestions,
          "Gizmo",
        );
      });

      it("to a table filtered using a model as a custom view", () => {
        configureSandboxPolicy({
          filterTableBy: "custom_view",
          customViewType: "Model" as const,
          customViewName: modelCustomView.name,
        });
        cy.log(
          "This sandboxing policy doesn't use user attributes. It makes all users see only the Gizmos.",
        );
        signInAs(gizmoViewer);
        assertAllResultsAndValuesAreSandboxed(
          dashboard,
          sandboxableQuestions,
          "Gizmo",
        );
        signInAs(widgetViewer);
        assertAllResultsAndValuesAreSandboxed(
          dashboard,
          sandboxableQuestions,
          "Gizmo",
        );
      });

      it("to a table filtered by a regular column", () => {
        assignAttributeToUser({ user: gizmoViewer, attributeValue: "Gizmo" });
        assignAttributeToUser({ user: widgetViewer, attributeValue: "Widget" });
        configureSandboxPolicy({
          filterTableBy: "column",
          filterColumn: "Category",
        });
        signInAs(gizmoViewer);
        assertAllResultsAndValuesAreSandboxed(
          dashboard,
          sandboxableQuestions,
          "Gizmo",
        );
        signInAs(widgetViewer);
        assertAllResultsAndValuesAreSandboxed(
          dashboard,
          sandboxableQuestions,
          "Widget",
        );
      });
    });

    // Custom columns currently DO work.
    describe("should work when applying a sandbox policy...", () => {
      (
        [
          ["Question", "booleanExpr", "true"],
          ["Question", "booleanLiteral", "true"],
          ["Question", "stringExpr", "Category is Gizmo"],
          ["Question", "stringLiteral", "fixed literal string"],
          ["Question", "numberExpr", "1"],
          ["Question", "numberLiteral", "1"],
          ["Model", "booleanExpr", "true"],
          ["Model", "booleanLiteral", "true"],
          ["Model", "stringExpr", "Category is Gizmo"],
          ["Model", "stringLiteral", "fixed literal string"],
          ["Model", "numberExpr", "1"],
          ["Model", "numberLiteral", "1"],
        ] as const
      ).forEach(([customViewType, customColumnType, customColumnValue]) => {
        it(`...to a table filtered by a custom ${customColumnType} column in a ${customViewType}`, () => {
          cy.signInAsAdmin();
          assignAttributeToUser({
            user: gizmoViewer,
            attributeValue: customColumnValue,
          });
          configureSandboxPolicy({
            filterTableBy: "custom_view",
            customViewType: customViewType,
            customViewName: `${customViewType} with custom columns`,
            filterColumn: `my_${customColumnType}`,
          });
          signInAs(gizmoViewer);

          H.visitDashboard(checkNotNull(dashboard).id);

          H.getDashboardCard(0).within(() => {
            cy.findByText("Question showing all products").should("be.visible");
            cy.findByText("20 rows").should("be.visible");
          });

          H.getDashboardCard(1)
            .scrollIntoView()
            .within(() => {
              cy.findByText("Model showing all products").should("be.visible");
              cy.findByText("20 rows").should("be.visible");
            });
        });
      });
    });

    it("filter values are sandboxed", () => {
      cy.signInAsAdmin();

      const filter = {
        id: "c2967a17",
        name: "Location",
        slug: "Location",
        type: "category",
      };

      const questionDetails = {
        name: "People table",
        query: {
          "source-table": SAMPLE_DATABASE.PEOPLE_ID,
        },
      };

      const dashboardDetails = {
        parameters: [filter],
      };

      H.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 11,
              size_y: 6,
              parameter_mappings: [
                {
                  card_id,
                  parameter_id: filter.id,
                  target: [
                    "dimension",
                    ["field", SAMPLE_DATABASE.PEOPLE.STATE, null],
                  ],
                },
              ],
            },
          ],
        });

        const userGroupMemberships = [
          { id: USER_GROUPS.ALL_USERS_GROUP, is_group_manager: false },
          { id: USER_GROUPS.DATA_GROUP, is_group_manager: false },
          { id: USER_GROUPS.COLLECTION_GROUP, is_group_manager: false },
        ];

        const users: Record<string, any> = {
          California: {
            email: "can-see-california-data@example.com",
            password: "--------",
            user_group_memberships: userGroupMemberships,
            login_attributes: { state: "CA" },
          },
          Washington: {
            email: "can-see-washington-data@example.com",
            password: "--------",
            user_group_memberships: userGroupMemberships,
            login_attributes: { state: "WA" },
          },
        };

        Object.values(users).forEach((user) =>
          // @ts-expect-error - this isn't typed yet
          cy.createUserFromRawData(user),
        );

        cy.log("Show the permissions configuration for the Sample Database");
        cy.visit("/admin/permissions/data/database/1");
        cy.log(
          "Show the permissions configuration for the Sample Database's People table",
        );
        cy.findByRole("menuitem", { name: /People/ }).click();
        cy.log("Modify the sandboxing policy for the 'data' group");
        H.modifyPermission("data", 0, "Row and column security");

        H.modal().within(() => {
          cy.findByText(
            /Change access to this database to .*Row and column security.*?/,
          );
          cy.button("Change").click();
        });

        H.modal().findByText(
          /Configure row and column security for this table/,
        );
        cy.findByRole("radio", {
          name: /Filter by a column in the table/,
        }).should("be.checked");
        H.modal()
          .findByRole("button", { name: /Pick a column/ })
          .click();
        cy.findByRole("option", { name: "State" }).click();
        H.modal()
          .findByPlaceholderText(/Pick a user attribute/)
          .click();
        cy.findByRole("option", { name: "state" }).click();
        cy.log("Save the sandboxing modal");
        H.modal().findByRole("button", { name: "Save" }).click();

        H.saveChangesToPermissions();

        cy.log(
          "Create two sandboxed users with different attributes (state=CA, state=WA)",
        );
        cy.log(
          "Our goal is to ensure that the second user can't see the filter value selected by the first user",
        );

        signInAs(users["California"]);
        H.visitDashboard(dashboard_id);

        cy.findByLabelText("Location").click();
        H.popover().within(() => {
          cy.findByLabelText("CA").click();
          cy.findByLabelText("WA").should("not.exist");
          cy.findByLabelText("Add filter").click();
        });

        signInAs(users["Washington"]);
        H.visitDashboard(dashboard_id);
        cy.findByLabelText("Location").click();
        H.popover().within(() => {
          cy.log(
            "The filter value selected by the previous user should not be visible",
          );
          cy.findByLabelText("CA").should("not.exist");
          cy.log(
            "The one filter value available to the current user should be visible",
          );
          cy.log("Ensure that only 'WA' and 'Select all' are visible");
          cy.findByLabelText("Select all").should("be.visible");
          cy.findByLabelText("WA").should("be.visible");
          cy.findByTestId("field-values-widget")
            .find("li")
            .should("have.length", 2);
        });
      });
    });
  },
);
