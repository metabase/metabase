import { USER_GROUPS } from "e2e/support/cypress_data";

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
  },
);
