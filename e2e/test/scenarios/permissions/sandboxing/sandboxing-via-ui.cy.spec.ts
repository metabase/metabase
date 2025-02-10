import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  type SandboxPolicy,
  allTestCardsShouldBeFiltered,
  configureSandboxPolicy,
  configureUser,
  createTestCards,
  noTestCardsShouldBeFiltered,
  signInAsSandboxedUser,
  sandboxingUser as user,
} from "./helpers/e2e-sandboxing-helpers";

const { H } = cy;

const preparePermissions = () => {
  H.blockUserGroupPermissions(USER_GROUPS.ALL_USERS_GROUP);
  H.blockUserGroupPermissions(USER_GROUPS.COLLECTION_GROUP);
  H.blockUserGroupPermissions(USER_GROUPS.READONLY_GROUP);
};

describe("admin > permissions > sandboxing (tested via the UI)", () => {
  describe("we can apply a sandbox policy", () => {
    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
      preparePermissions();
      cy.intercept("POST", "/api/card").as("saveQuestion");
      cy.createUserFromRawData(user);
    });

    it("to a table filtered using a question as a custom view", () => {
      const policy: SandboxPolicy = {
        filterTableBy: "custom_view",
        customViewType: "question",
      };
      createTestCards(policy);
      signInAsSandboxedUser();
      noTestCardsShouldBeFiltered(policy);
      configureSandboxPolicy(policy);
      signInAsSandboxedUser();
      allTestCardsShouldBeFiltered(policy);
    });

    it("to a table filtered using a model as a custom view", () => {
      const policy: SandboxPolicy = {
        filterTableBy: "custom_view",
        customViewType: "model",
      };
      createTestCards(policy);
      signInAsSandboxedUser();
      noTestCardsShouldBeFiltered(policy);
      configureSandboxPolicy(policy);
      signInAsSandboxedUser();
      allTestCardsShouldBeFiltered(policy);
    });

    it("to a table filtered by a regular column", () => {
      const policy: SandboxPolicy = {
        filterTableBy: "column",
        columnType: "regular",
      };
      createTestCards(policy);
      signInAsSandboxedUser();
      noTestCardsShouldBeFiltered(policy);
      const { attributeKey } = configureUser(policy);
      configureSandboxPolicy({ ...policy, attributeKey });
      signInAsSandboxedUser();
      allTestCardsShouldBeFiltered(policy);
    });

    // This behavior might be genuinely broken?
    // The test fails at the end because the question errors with:
    // Invalid query: {:stages [["Invalid :expression reference: no expression named {:base-type :type/Boolean}"]]}
    it.skip("to a table filtered by a custom boolean column", () => {
      const policy: SandboxPolicy = {
        filterTableBy: "column",
        columnType: "custom",
        customColumnType: "boolean",
      };
      createTestCards(policy);
      signInAsSandboxedUser();
      noTestCardsShouldBeFiltered(policy);
      const { attributeKey } = configureUser(policy);
      configureSandboxPolicy({ ...policy, attributeKey });
      signInAsSandboxedUser();
      allTestCardsShouldBeFiltered(policy);
    });

    // This might also be broken? The query errors with: Invalid output:
    // {:stages [["Invalid :expression reference: no expression named
    // {:base-type :type/Text}, got: {:lib/type :mbql.stage/mbql, :source-table
    // 8, :expressions [[:concat {:lib/uuid
    // \"ea22b763-c949-4594-8c74-9f035f2ab082\", :lib/expression-name \"Custom
    // category\", :ident \"wVGz1eygzUKw_KsNuclmb\"} \"Category is \" [:field
    // {:base-type :type/Text, :lib/uuid
    // \"0b940027-7008-4cbf-8bf7-accb66167ed2\", :effective-type :type/Text}
    // 58]]], :parameters [{:type :category, :target [:dimension [:expression
    it.skip("to a table filtered by a custom string column", () => {
      const policy: SandboxPolicy = {
        filterTableBy: "column",
        columnType: "custom",
        customColumnType: "string",
      };
      createTestCards(policy);
      signInAsSandboxedUser();
      noTestCardsShouldBeFiltered(policy);
      const { attributeKey } = configureUser(policy);
      configureSandboxPolicy({ ...policy, attributeKey });
      signInAsSandboxedUser();
      allTestCardsShouldBeFiltered(policy);
    });

    // Also fails with a similar error
    it.skip("to a table filtered by a custom number column", () => {
      const policy: SandboxPolicy = {
        filterTableBy: "column",
        columnType: "custom",
        customColumnType: "number",
      };
      createTestCards(policy);
      signInAsSandboxedUser();
      noTestCardsShouldBeFiltered(policy);
      const { attributeKey } = configureUser(policy);
      configureSandboxPolicy({ ...policy, attributeKey });
      signInAsSandboxedUser();
      allTestCardsShouldBeFiltered(policy);
    });
  });

  // TODO: restore
  it.skip("filter values are sandboxed", () => {
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
        "Ensure that the second user can't see the filter value selected by the first user",
      );

      signIn("California");
      H.visitDashboard(dashboard_id);

      cy.findByLabelText("Location").click();
      H.popover().within(() => {
        cy.findByLabelText("CA").click();
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
});
