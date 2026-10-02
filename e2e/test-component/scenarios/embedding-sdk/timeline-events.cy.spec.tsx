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

  [
    { name: "InteractiveQuestion", component: InteractiveQuestion },
    { name: "StaticQuestion", component: StaticQuestion },
  ].forEach(({ name, component: QuestionComponent }) => {
    it(`should not show events on ${name}`, () => {
      cy.get<number>("@questionId").then((questionId) => {
        mountSdkContent(<QuestionComponent questionId={questionId} />);
      });

      getSdkRoot().within(() => expectChartWithoutEvents());
    });
  });

  [
    { name: "InteractiveDashboard", component: InteractiveDashboard },
    { name: "StaticDashboard", component: StaticDashboard },
    { name: "EditableDashboard", component: EditableDashboard },
  ].forEach(({ name, component: DashboardComponent }) => {
    it(`should show only saved events read-only on ${name}`, () => {
      cy.get<number>("@dashboardId").then((dashboardId) => {
        mountSdkContent(
          <DashboardComponent dashboardId={dashboardId} withDownloads />,
        );
      });

      cy.wait("@getTimelines");
      getSdkRoot().within(() => {
        expectReadOnlyDashboardEvents();

        cy.log("the dashcard menu does not offer to open the events panel");
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
      cy.findByRole("button", { name: "Add questions" }).should("be.visible");
      H.timelineEventChip("RC1").should("be.visible");
      H.timelineEventChip("Internal release notes").should("not.exist");

      cy.log("edit mode offers no events panel or Events button");
      cy.findByTestId("dashboard-events-sidebar").should("not.exist");
      cy.findByRole("button", { name: "Events", exact: true }).should(
        "not.exist",
      );
    });

    cy.log("editing the dashboard never changes timeline events");
    cy.get("@mutateTimelineEvents.all").should("have.length", 0);
  });
});
