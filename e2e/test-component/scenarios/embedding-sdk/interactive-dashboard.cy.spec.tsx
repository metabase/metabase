import {
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

import { H } from "e2e/support";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  POPOVER_ELEMENT,
  cartesianChartCircle,
  describeEE,
  popover,
} from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { Stack } from "metabase/ui";

describeEE("scenarios > embedding-sdk > interactive-dashboard", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    const questionCard = {
      id: 64,
      card_id: ORDERS_QUESTION_ID,
      row: 0,
      col: 0,
      size_x: 8,
      size_y: 8,
    };

    cy.createDashboard({
      name: "Orders in a dashboard",
      dashcards: [questionCard],
    }).then(({ body: dashboard }) => {
      cy.wrap(dashboard.id).as("dashboardId");
      cy.wrap(dashboard.entity_id).as("dashboardEntityId");
    });

    cy.signOut();

    mockAuthProviderAndJwtSignIn();

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should be able to display custom question layout when clicking on dashboard cards", () => {
    cy.get<string>("@dashboardId").then(dashboardId => {
      mountSdkContent(
        <InteractiveDashboard
          dashboardId={dashboardId}
          renderDrillThroughQuestion={() => (
            <Stack>
              <InteractiveQuestion.Title />
              <InteractiveQuestion.QuestionVisualization />
              <div>This is a custom question layout.</div>
            </Stack>
          )}
        />,
      );
    });

    getSdkRoot().within(() => {
      cy.contains("Orders in a dashboard").should("be.visible");
      cy.findByText("Orders").click();
      cy.contains("Orders").should("be.visible");
      cy.contains("This is a custom question layout.");
    });
  });

  describe("loading behavior for both entity IDs and number IDs (metabase#49581)", () => {
    const successTestCases = [
      {
        name: "correct entity ID",
        dashboardIdAlias: "@dashboardEntityId",
      },
      {
        name: "correct number ID",
        dashboardIdAlias: "@dashboardId",
      },
    ];

    const failureTestCases = [
      {
        name: "wrong entity ID",
        dashboardId: "VFCGVYPVtLzCtt4teeoW4",
      },
      {
        name: "one too many entity ID character",
        dashboardId: "VFCGVYPVtLzCtt4teeoW49",
      },
      {
        name: "wrong number ID",
        dashboardId: 9999,
      },
    ];

    successTestCases.forEach(({ name, dashboardIdAlias }) => {
      it(`should load dashboard content for ${name}`, () => {
        cy.get(dashboardIdAlias).then(dashboardId => {
          mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
        });

        getSdkRoot().within(() => {
          cy.findByText("Orders in a dashboard").should("be.visible");
          cy.findByText("Orders").should("be.visible");
          cy.findByText("Rows 1-6 of first 2000").should("be.visible");
          cy.findByText("Test text card").should("be.visible");
        });
      });
    });

    failureTestCases.forEach(({ name, dashboardId }) => {
      it(`should show an error message for ${name}`, () => {
        mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);

        getSdkRoot().within(() => {
          const expectedErrorMessage = `Dashboard ${dashboardId} not found. Make sure you pass the correct ID.`;
          cy.findByRole("alert").should("have.text", expectedErrorMessage);

          cy.findByText("Orders in a dashboard").should("not.exist");
          cy.findByText("Orders").should("not.exist");
          cy.findByText("Rows 1-6 of first 2000").should("not.exist");
          cy.findByText("Test text card").should("not.exist");
        });
      });
    });
  });

  it("should not trigger url click behaviours when clicking on sdk cards (metabase#51099)", () => {
    cy.get<string>("@dashboardId").then(dashboardId => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery").then(() => {
      cy.location().then(location => {
        cy.wrap(location.pathname).as("initialPath");
      });

      const root = getSdkRoot();

      root.within(() => {
        // Drill-through should work on columns without click behavior
        H.getDashboardCard(0).findByText("2.07").click();
        popover().should("contain.text", "Filter by this value");

        // Table column click behavior should be disabled in the sdk
        H.getDashboardCard(0).should("not.contain.text", "Link Text Applied");
        H.getDashboardCard(0).findByText("37.65").click();
        cy.get(POPOVER_ELEMENT).should("not.exist");

        // Line chart click behavior should be disabled in the sdk
        H.getDashboardCard(1).within(() => {
          cartesianChartCircle()
            .eq(0)
            .then(([circle]) => {
              const { left, top } = circle.getBoundingClientRect();
              root.click(left, top);
            });
        });

        cy.get(POPOVER_ELEMENT).should("not.exist");
      });

      // We should not be navigated away from the current page
      cy.location().then(location => {
        cy.get("@initialPath").should("eq", location.pathname);
      });
    });
  });
});
