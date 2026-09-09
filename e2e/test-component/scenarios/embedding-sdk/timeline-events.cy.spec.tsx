import {
  EditableDashboard,
  InteractiveQuestion,
  StaticQuestion,
} from "@metabase/embedding-sdk-react";

import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import {
  createQuestionAndDashboardWithEvents,
  expectChartWithoutEvents,
  expectReadOnlyDashboardEvents,
} from "e2e/test/scenarios/organization/shared/timeline-events";

describe("scenarios > embedding-sdk > timeline events", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    createQuestionAndDashboardWithEvents();
    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  (
    [
      ["InteractiveQuestion", InteractiveQuestion],
      ["StaticQuestion", StaticQuestion],
    ] as const
  ).forEach(([name, QuestionComponent]) => {
    it(`should not show events on ${name}`, () => {
      cy.get<number>("@questionId").then((questionId) => {
        mountSdkContent(<QuestionComponent questionId={questionId} />);
      });

      getSdkRoot().within(() => expectChartWithoutEvents());
    });
  });

  it("should not show events with a composable question visualization", () => {
    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(
        <InteractiveQuestion questionId={questionId}>
          <InteractiveQuestion.Title />
          <InteractiveQuestion.QuestionVisualization />
        </InteractiveQuestion>,
      );
    });
    getSdkRoot().within(() => expectChartWithoutEvents());
  });

  it("should show only saved events read-only on an interactive dashboard", () => {
    cy.get<number>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<EditableDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@getTimelines");
    getSdkRoot().within(expectReadOnlyDashboardEvents);
  });
});
