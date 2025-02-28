import { USER_GROUPS } from "e2e/support/cypress_data";

import {
  type SandboxPolicy,
  cardsShouldOnlyShowGizmos,
  cardsShouldShowGizmosAndWidgets,
  cardsShouldThrowErrors,
  configureSandboxPolicy,
  configureUser,
  createCardsShowingGizmosAndWidgets,
  signInAsSandboxedUser,
  sandboxingUser as user,
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
    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
      preparePermissions();
      cy.intercept("POST", "/api/card").as("saveQuestion");
      cy.createUserFromRawData(user);
    });

    describe("we can apply a sandbox policy", () => {
      it("to a table filtered using a question as a custom view", () => {
        const policy: SandboxPolicy = {
          filterTableBy: "custom_view",
          columnType: "regular",
          customViewType: "question",
        };
        createCardsShowingGizmosAndWidgets(policy);
        signInAsSandboxedUser();
        cardsShouldShowGizmosAndWidgets();
        configureSandboxPolicy(policy);
        signInAsSandboxedUser();
        cardsShouldOnlyShowGizmos();
      });

      it("to a table filtered using a model as a custom view", () => {
        const policy: SandboxPolicy = {
          filterTableBy: "custom_view",
          columnType: "regular",
          customViewType: "model",
        };
        createCardsShowingGizmosAndWidgets(policy);
        signInAsSandboxedUser();
        cardsShouldShowGizmosAndWidgets();
        configureSandboxPolicy(policy);
        signInAsSandboxedUser();
        cardsShouldOnlyShowGizmos();
      });

      it("to a table filtered by a regular column", () => {
        const policy: SandboxPolicy = {
          filterTableBy: "column",
          columnType: "regular",
        };
        createCardsShowingGizmosAndWidgets(policy);
        signInAsSandboxedUser();
        cardsShouldShowGizmosAndWidgets();
        const { attributeKey } = configureUser(policy);
        configureSandboxPolicy({ ...policy, attributeKey });
        signInAsSandboxedUser();
        cardsShouldOnlyShowGizmos();
      });
    });

    // Custom columns currently don't work. These tests ensure that the sandboxing policy fails closed.
    describe("we expect an error - and no data to be shown - when applying a sandbox policy...", () => {
      (
        [
          ["question", "boolean"],
          ["question", "string"],
          ["question", "number"],
          ["model", "boolean"],
          ["model", "string"],
          ["model", "number"],
        ] as const
      ).forEach(([customViewType, customColumnType]) => {
        it(`...to a table filtered by a custom ${customColumnType} column in a ${customViewType}`, () => {
          const policy: SandboxPolicy = {
            filterTableBy: "custom_view",
            columnType: "custom",
            customViewType,
            customColumnType,
          };
          createCardsShowingGizmosAndWidgets(policy);
          signInAsSandboxedUser();
          cardsShouldShowGizmosAndWidgets();
          const { attributeKey } = configureUser(policy);
          configureSandboxPolicy({ ...policy, attributeKey });
          signInAsSandboxedUser();
          cardsShouldThrowErrors();
        });
      });
    });
  },
);
