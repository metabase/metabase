import { InteractiveDashboard } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type StructuredQuestionDetails,
  createDashboardWithQuestions,
  createQuestion,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  mountInteractiveQuestion,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { MetabaseDataPointObject } from "metabase/embedding-sdk/types/plugins";
import type {
  ClickAction,
  CustomClickActionWithCustomView,
} from "metabase/visualizations/types";

const { ORDERS_ID, ORDERS, PEOPLE } = SAMPLE_DATABASE;

const setup = (callback: () => void) => {
  signInAsAdminAndEnableEmbeddingSdk();

  callback();

  cy.signOut();

  mockAuthProviderAndJwtSignIn();
};

const BASE_QUESTION: StructuredQuestionDetails = {
  name: "Orders",
  query: {
    "source-table": ORDERS_ID,
    breakout: [
      [
        "field",
        PEOPLE.SOURCE,
        {
          "base-type": "type/Text",
          "source-field": ORDERS.USER_ID,
        },
      ],
    ],
    limit: 5,
  },
};

const CUSTOM_ACTION_WITH_VIEW: CustomClickActionWithCustomView = {
  name: "client-custom-action-2",
  section: "custom",
  type: "custom",
  view: ({ closePopover }) => (
    <button onClick={closePopover}>Custom element</button>
  ),
};

describe("scenarios > embedding-sdk > plugins", () => {
  describe("The `mapQuestionClickActions` plugin should work for `InteractiveDashboard`", () => {
    beforeEach(() => {
      setup(() => {
        createDashboardWithQuestions({
          dashboardName: "Orders in a dashboard",
          questions: [BASE_QUESTION],
          cards: [
            {
              size_x: 12,
              col: 0,
            },
          ],
        }).then(({ dashboard, questions: [question] }) => {
          cy.wrap(dashboard.id).as("dashboardId");
          cy.wrap(question.id).as("questionId");
          cy.wrap(question.entity_id).as("questionEntityId");
        });
      });
    });

    it("should open a click actions popover with a custom item", () => {
      cy.get<string>("@dashboardId").then((dashboardId) => {
        mountSdkContent(
          <InteractiveDashboard
            dashboardId={dashboardId}
            plugins={{
              mapQuestionClickActions: (clickActions: ClickAction[]) => [
                ...clickActions,
                CUSTOM_ACTION_WITH_VIEW,
              ],
            }}
          />,
        );
      });

      getSdkRoot().within(() => {
        cy.findByText("Facebook").click();

        cy.findByTestId("click-actions-popover").within(() => {
          cy.findByText("Custom element").click();
        });

        cy.findByTestId("click-actions-popover").should("not.exist");
      });
    });

    it("should execute action immediately when returning a single object with onClick", () => {
      cy.get<string>("@dashboardId").then((dashboardId) => {
        const onClickSpy = cy.spy().as("onClickSpy");

        mountSdkContent(
          <InteractiveDashboard
            dashboardId={dashboardId}
            plugins={{
              mapQuestionClickActions: () => ({
                onClick: onClickSpy,
              }),
            }}
          />,
        );

        getSdkRoot().within(() => {
          cy.findByText("Facebook").click();

          // Popover should not appear when returning single action
          cy.findByTestId("click-actions-popover").should("not.exist");
        });

        cy.get("@onClickSpy").should("have.been.calledOnce");
      });
    });

    it("should pass transformed clicked data to mapQuestionClickActions", () => {
      cy.get<string>("@dashboardId").then((dashboardId) => {
        const customActionSpy = cy.spy().as("customActionSpy");

        mountSdkContent(
          <InteractiveDashboard
            dashboardId={dashboardId}
            plugins={{
              mapQuestionClickActions: (
                _clickActions: ClickAction[],
                clicked: MetabaseDataPointObject,
              ) => {
                return {
                  onClick: () => customActionSpy(clicked),
                };
              },
            }}
          />,
        );

        getSdkRoot().within(() => {
          cy.findByText("Facebook").click();
        });

        cy.get("@customActionSpy")
          .should("have.been.calledOnce")
          .then((spy: any) => {
            const [arg] = spy.firstCall.args;

            // it doesn't seem that cypress matches have a "loose" check for shapes
            expect(arg).to.have.property("column");
            expect(arg.column).to.have.property("name", "SOURCE");
            expect(arg.column).to.have.property(
              "display_name",
              "User → Source",
            );

            expect(arg).to.have.property("value", "Facebook");

            expect(arg).to.have.property("question");
            expect(arg.question).to.have.property("id").that.is.a("number");
            expect(arg.question).to.have.property("name", "Orders");
            expect(arg.question).to.have.property("description", null);
            expect(arg.question)
              .to.have.property("entityId")
              .that.is.a("string");
            expect(arg.question).to.have.property("isSavedQuestion", true);

            expect(arg).to.have.property("data");
            expect(arg.data).to.have.property("SOURCE", "Facebook");
          });
      });
    });
  });

  describe("The `mapQuestionClickActions` plugin should work for `InteractiveQuestion`", () => {
    beforeEach(() => {
      setup(() => {
        createQuestion(BASE_QUESTION).then(({ body: question }) => {
          cy.wrap(question.id).as("questionId");
          cy.wrap(question.entity_id).as("questionEntityId");
        });
      });
    });

    it("should open a click actions popover with a custom item", () => {
      mountInteractiveQuestion({
        plugins: {
          mapQuestionClickActions: (clickActions: ClickAction[]) => [
            ...clickActions,
            CUSTOM_ACTION_WITH_VIEW,
          ],
        },
      });

      getSdkRoot().within(() => {
        cy.findByText("Facebook").click();

        cy.findByTestId("click-actions-popover").within(() => {
          cy.findByText("Custom element").click();
        });

        cy.findByTestId("click-actions-popover").should("not.exist");
      });
    });
  });
});
