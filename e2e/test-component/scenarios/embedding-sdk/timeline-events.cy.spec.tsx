import {
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import {
  createQuestionAndDashboardWithEvents,
  expectChartWithoutEvents,
} from "e2e/test/scenarios/organization/shared/timeline-events";

describe("scenarios > embedding-sdk > timeline events", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    createQuestionAndDashboardWithEvents();
    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("should not show events on an interactive question", () => {
    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(<InteractiveQuestion questionId={questionId} />);
    });

    getSdkRoot().within(expectChartWithoutEvents);
  });

  it("should not show events on an interactive dashboard", () => {
    cy.get<number>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    getSdkRoot().within(expectChartWithoutEvents);
  });
});
