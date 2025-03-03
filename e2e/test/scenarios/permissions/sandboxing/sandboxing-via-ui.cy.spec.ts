import { USER_GROUPS } from "e2e/support/cypress_data";
import { cypressWaitAll } from "e2e/support/helpers";

import {
  adhocQuestionData,
  assignAttributeToUser,
  configureSandboxPolicy,
  createSandboxingDashboardAndQuestions,
  rowsContainGizmosAndWidgets,
  rowsContainOnlyGizmos,
  signInAsNormalUser,
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
    let sandboxingData = {
      dashboard: {} as any,
      questions: [] as any[],
    };

    before(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
      preparePermissions();
      createSandboxingDashboardAndQuestions().then(result => {
        const items = result.body.data;
        sandboxingData = {
          dashboard: items.find(
            (item: { model: string }) => item.model === "dashboard",
          ),
          questions: items.filter(
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

      // we can do this once for all of these tests
      H.visitDashboard(sandboxingData.dashboard.id);

      expect(sandboxingData.questions.length).to.be.greaterThan(0);
      cy.wait(
        new Array(sandboxingData.questions.length).fill("@dashcardQuery"),
      ).then(apiResponses => {
        rowsContainGizmosAndWidgets(apiResponses);

        cy.log("/api/card/$id/query endpoints are not sandboxed");
        cypressWaitAll(
          apiResponses.map(({ response }) => {
            const url = (response as any)?.url;
            const cardId = parseInt(url.match(/\d+/g).at(-1));
            expect(cardId).to.be.a("number");
            return cy.request("POST", `/api/card/${cardId}/query`);
          }),
        ).then(apiResponses => {
          rowsContainGizmosAndWidgets(
            apiResponses.map(response => ({ response })),
          );
        });
      });

      H.visitQuestionAdhoc(adhocQuestionData);
      cy.wait("@datasetQuery").then(apiResponse =>
        rowsContainGizmosAndWidgets([apiResponse]),
      );
    });

    describe("we can apply a sandbox policy", () => {
      beforeEach(() => {
        cy.signInAsAdmin();
      });

      // Each test configures the sandboxing policy, but the logic for checking
      // the results is the same in each test, so let's do this in an
      // afterEach.
      afterEach(function sandboxingPolicyShouldBeApplied() {
        signInAsNormalUser();

        H.visitDashboard(sandboxingData.dashboard.id);

        expect(sandboxingData.questions.length).to.be.greaterThan(0);
        cy.wait(
          new Array(sandboxingData.questions.length).fill("@dashcardQuery"),
        ).then(apiResponses => {
          rowsContainOnlyGizmos(apiResponses);

          cy.log("/api/card/$id/query endpoints are not sandboxed");
          cypressWaitAll(
            apiResponses.map(({ response }) => {
              const url = (response as any)?.url;
              const cardId = parseInt(url.match(/\d+/g).at(-1));
              expect(cardId).to.be.a("number");
              return cy.request("POST", `/api/card/${cardId}/query`);
            }),
          ).then(apiResponses => {
            rowsContainOnlyGizmos(apiResponses.map(response => ({ response })));
          });
        });

        H.visitQuestionAdhoc(adhocQuestionData);
        cy.wait("@datasetQuery").then(apiResponse => {
          rowsContainOnlyGizmos([apiResponse]);
        });
      });

      it("to a table filtered using a question as a custom view", () => {
        configureSandboxPolicy({
          filterTableBy: "custom_view",
          customViewType: "Question" as const,
          customViewName: "sandbox - Question with only gizmos",
        });
      });

      it("to a table filtered using a model as a custom view", () => {
        configureSandboxPolicy({
          filterTableBy: "custom_view",
          customViewType: "Question" as const,
          customViewName: "sandbox - Question with only gizmos",
        });
      });

      it("to a table filtered by a regular column", () => {
        assignAttributeToUser({ attributeValue: "Gizmo" });
        configureSandboxPolicy({
          filterTableBy: "column",
          filterColumn: "Category",
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
          H.visitDashboard(sandboxingData.dashboard.id);

          cy.log("Should not return any data, and return an error");
          cy.wait(
            new Array(sandboxingData.questions.length).fill("@dashcardQuery"),
          ).then(apiResponses => {
            apiResponses.forEach(({ response }) => {
              expect(response?.body.data.rows).to.have.length(0);
              expect(response?.body.error_type).to.contain("invalid-query");
            });
          });
        });
      });
    });
  },
);
