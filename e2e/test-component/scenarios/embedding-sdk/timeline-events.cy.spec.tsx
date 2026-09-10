import {
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
  StaticDashboard,
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

const { H } = cy;

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

  (
    [
      ["InteractiveDashboard", InteractiveDashboard],
      ["StaticDashboard", StaticDashboard],
      ["EditableDashboard", EditableDashboard],
    ] as const
  ).forEach(([name, DashboardComponent]) => {
    it(`should show only saved events read-only on ${name}`, () => {
      cy.get<number>("@dashboardId").then((dashboardId) => {
        mountSdkContent(
          <DashboardComponent dashboardId={dashboardId} withDownloads />,
        );
      });

      cy.wait("@getTimelines");
      getSdkRoot().within(() => {
        expectReadOnlyDashboardEvents();
        H.getDashboardCard().realHover();
        H.getDashboardCard()
          .findByRole("button", { name: "More options" })
          .click();
      });
      H.menu().should("be.visible").findByText("Events").should("not.exist");
    });
  });

  it("should keep saved events read-only while editing a dashboard", () => {
    cy.get<number>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<EditableDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@getTimelines");
    getSdkRoot().within(() => {
      cy.findByRole("button", { name: "Edit dashboard" }).click();
      cy.findByRole("button", { name: "Save" }).should("be.visible");
      H.timelineEventChip("RC1").should("be.visible");
      H.timelineEventChip("Internal release notes").should("not.exist");
      cy.findByTestId("dashboard-events-sidebar").should("not.exist");
      cy.findByRole("button", { name: "Events", exact: true }).should(
        "not.exist",
      );
    });
    cy.get("@mutateTimelineEvents.all").should("have.length", 0);
  });
});
