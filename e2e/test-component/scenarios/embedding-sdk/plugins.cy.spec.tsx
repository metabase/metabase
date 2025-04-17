import { InteractiveDashboard } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type StructuredQuestionDetails,
  createDashboardWithQuestions,
  createQuestion,
} from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountInteractiveQuestion,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
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
