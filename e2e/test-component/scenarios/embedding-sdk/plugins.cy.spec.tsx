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
import type {
  ClickAction,
  CustomClickActionWithCustomView,
} from "metabase/visualizations/types";

const { ORDERS_ID, ORDERS, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

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

  describe("The `mapQuestionClickActions` plugin should intercept link clicks (EMB-890)", () => {
    beforeEach(() => {
      setup(() => {
        cy.request("PUT", `/api/field/${PEOPLE.ADDRESS}`, {
          semantic_type: "type/URL",
        });

        const questionWithAllLinkTypes: StructuredQuestionDetails = {
          name: "Question with all link types",
          query: {
            "source-table": PEOPLE_ID,
            fields: [
              ["field", PEOPLE.ID, { "base-type": "type/BigInteger" }],
              ["field", PEOPLE.NAME, { "base-type": "type/Text" }],
              ["field", PEOPLE.STATE, { "base-type": "type/Text" }],
              ["field", PEOPLE.ADDRESS, { "base-type": "type/Text" }],
              ["expression", "url string", { "base-type": "type/Text" }],
            ],
            expressions: {
              "url string": [
                "concat",
                "https://example.org/url/string/",
                ["field", PEOPLE.ID, { "base-type": "type/BigInteger" }],
              ],
            },
            limit: 5,
          },
          visualization_settings: {
            column_settings: {
              '["name","ID"]': {
                view_as: "link", // viz setting -> view as "link"
                column_title: "ID (display as link)",
                link_text: "Link {{ID}}",
                link_url: "https://example.org/display/as/link/{{ID}}",
              },
              '["name","ADDRESS"]': {
                column_title: "ADDRESS (type/URL)",
              },
              '["name","NAME"]': {
                click_behavior: {
                  type: "link",
                  linkType: "dashboard",
                  targetId: 1,
                  linkTextTemplate: "Internal link {{NAME}}",
                },
                column_title: "NAME (internal link - disabled)",
              },
              '["name","STATE"]': {
                click_behavior: {
                  type: "link",
                  linkType: "url",
                  linkTextTemplate: "External {{STATE}}",
                  linkTemplate: "https://example.org/{{STATE}}",
                },
                column_title: "STATE (external URL)",
              },
            },
          },
        };

        createDashboardWithQuestions({
          dashboardName: "Dashboard with link columns",
          questions: [questionWithAllLinkTypes],
          cards: [{ size_x: 24, size_y: 6, col: 0, row: 0 }],
        }).then(({ dashboard }) => {
          cy.wrap(dashboard.id).as("dashboardId");
        });
      });
    });
  });
});
