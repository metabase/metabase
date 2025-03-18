import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  adhocQuestionData,
  assignAttributeToUser,
  configureSandboxPolicy,
  createSandboxingDashboardAndQuestions,
  getCardResponses,
  getDashcardResponses,
  getFieldValues,
  rowsShouldContainGizmosAndWidgets,
  rowsShouldContainOnlyGizmos,
  signInAsNormalUser,
  sandboxingUser as user,
} from "./helpers/e2e-sandboxing-helpers";
import type { DatasetResponse, SandboxableItems } from "./helpers/types";

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
    let items = {} as SandboxableItems;

    before(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
      preparePermissions();
      createSandboxingDashboardAndQuestions().then(result => {
        const { data } = result.body;
        items = {
          dashboard: data.find(
            (item: { model: string }) => item.model === "dashboard",
          ),
          questions: data.filter(
            (item: { model: string }) => item.model !== "dashboard",
          ),
        };
      });
      // @ts-expect-error - this isn't typed yet
      cy.createUserFromRawData(user);
      // this setup is a bit heavy, so let's just do it once
      H.snapshot("sandboxing-on-postgres-12");
    });

    beforeEach(() => {
      cy.intercept("/api/card/*/query").as("cardQuery");
      cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as(
        "dashcardQuery",
      );
      cy.intercept("POST", "/api/dataset").as("datasetQuery");
      H.restore("sandboxing-on-postgres-12" as any);
    });

    it("shows all data before sandboxing policy is applied", () => {
      signInAsNormalUser();

      getDashcardResponses(items).then(rowsShouldContainGizmosAndWidgets);
      getCardResponses(items).then(rowsShouldContainGizmosAndWidgets);

      H.visitQuestionAdhoc(adhocQuestionData).then(({ response }) =>
        rowsShouldContainGizmosAndWidgets([response]),
      );

      getFieldValues().then(response => {
        const values = response.body.values.map(val => val[0]);
        expect(values.length).to.equal(4);
        expect(values).to.contain("Doohickey");
        expect(values).to.contain("Gizmo");
        expect(values).to.contain("Gadget");
        expect(values).to.contain("Widget");
      });
    });

    describe("we can apply a sandbox policy", () => {
      beforeEach(() => {
        cy.signInAsAdmin();
      });

      it("to a table filtered using a question as a custom view", () => {
        configureSandboxPolicy({
          filterTableBy: "custom_view",
          customViewType: "Question" as const,
          customViewName: "sandbox - Question with only gizmos",
        });
        getDashcardResponses(items).then(rowsShouldContainOnlyGizmos);
        getCardResponses(items).then(rowsShouldContainOnlyGizmos);
        H.visitQuestionAdhoc(adhocQuestionData).then(({ response }) =>
          rowsShouldContainOnlyGizmos([response as DatasetResponse]),
        );
        getFieldValues().then(response => {
          expect(response.body.values).to.deep.equal([["Gizmo"]]);
        });
      });

      it("to a table filtered using a model as a custom view", () => {
        configureSandboxPolicy({
          filterTableBy: "custom_view",
          customViewType: "Model" as const,
          customViewName: "sandbox - Model with only gizmos",
        });
        getDashcardResponses(items).then(rowsShouldContainOnlyGizmos);
        getCardResponses(items).then(rowsShouldContainOnlyGizmos);
        H.visitQuestionAdhoc(adhocQuestionData).then(({ response }) =>
          rowsShouldContainOnlyGizmos([response as DatasetResponse]),
        );
        getFieldValues().then(response => {
          expect(response.body.values).to.deep.equal([["Gizmo"]]);
        });
      });

      it("to a table filtered by a regular column", () => {
        assignAttributeToUser({ attributeValue: "Gizmo" });
        configureSandboxPolicy({
          filterTableBy: "column",
          filterColumn: "Category",
        });
        getDashcardResponses(items).then(rowsShouldContainOnlyGizmos);
        getCardResponses(items).then(rowsShouldContainOnlyGizmos);
        H.visitQuestionAdhoc(adhocQuestionData).then(({ response }) =>
          rowsShouldContainOnlyGizmos([response as DatasetResponse]),
        );
        getFieldValues().then(response => {
          expect(response.body.values).to.deep.equal([["Gizmo"]]);
        });
      });
    });

    // Custom columns currently don't work. These tests ensure that the sandboxing policy fails closed.
    describe("we expect an error - and no data to be shown - when applying a sandbox policy...", () => {
      (
        [
          ["Question", "boolean", "true"],
          ["Question", "string", "Category is Gizmo"],
          ["Question", "number", "11"],
          ["Model", "boolean", "true"],
          ["Model", "string", "Category is Gizmo"],
          ["Model", "number", "11"],
        ] as const
      ).forEach(([customViewType, customColumnType, customColumnValue]) => {
        it(`...to a table filtered by a custom ${customColumnType} column in a ${customViewType}`, () => {
          cy.signInAsAdmin();
          assignAttributeToUser({ attributeValue: customColumnValue });
          configureSandboxPolicy({
            filterTableBy: "custom_view",
            customViewType: customViewType,
            customViewName: `sandbox - ${customViewType} with custom columns`,
            filterColumn: `my_${customColumnType}`,
          });
          signInAsNormalUser();
          H.visitDashboard(items.dashboard.id);

          cy.log("Should not return any data, and return an error");
          cy.wait(
            new Array(items.questions.length).fill("@dashcardQuery"),
          ).then(apiResponses => {
            apiResponses.forEach(({ response }) => {
              expect(response?.body.data.rows).to.have.length(0);
              expect(response?.body.error_type).to.contain("invalid-query");
            });
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

        Object.values(users).forEach(user => cy.createUserFromRawData(user));

        cy.log("Show the permissions configuration for the Sample Database");
        cy.visit("/admin/permissions/data/database/1");
        cy.log(
          "Show the permissions configuration for the Sample Database's People table",
        );
        cy.findByRole("menuitem", { name: /People/ }).click();
        cy.log("Modify the sandboxing policy for the 'data' group");
        H.modifyPermission("data", 0, "Sandboxed");

        H.modal().within(() => {
          cy.findByText(/Change access to this database to .*Sandboxed.*?/);
          cy.button("Change").click();
        });

        H.modal().findByText(/Restrict access to this table/);
        cy.findByRole("radio", {
          name: /Filter by a column in the table/,
        }).should("be.checked");
        H.modal()
          .findByRole("button", { name: /Pick a column/ })
          .click();
        cy.findByRole("option", { name: "State" }).click();
        H.modal()
          .findByRole("button", { name: /Pick a user attribute/ })
          .click();
        cy.findByRole("option", { name: "state" }).click();
        cy.log("Save the sandboxing modal");
        H.modal().findByRole("button", { name: "Save" }).click();

        H.saveChangesToPermissions();

        const signIn = (state: string) => {
          const user = users[state];

          cy.log(`Sign in as user via an API call: ${user.email}`);
          cy.request("POST", "/api/session", {
            username: user.email,
            password: user.password,
          });
        };

        cy.log(
          "Create two sandboxed users with different attributes (state=CA, state=WA)",
        );
        cy.log(
          "Our goal is to ensure that the second user can't see the filter value selected by the first user",
        );

        signIn("California");
        H.visitDashboard(dashboard_id);

        cy.findByLabelText("Location").click();
        H.popover().within(() => {
          cy.findByLabelText("CA").click();
          cy.findByLabelText("WA").should("not.exist");
          cy.findByLabelText("Add filter").click();
        });

        signIn("Washington");
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
