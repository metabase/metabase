import {
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
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

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describeEE("scenarios > embedding-sdk > interactive-dashboard", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    H.createDashboardWithQuestions({
      dashboardName: "Orders in a dashboard",
      questions: [
        {
          name: "Orders",
          query: { "source-table": ORDERS_ID, limit: 5 },
        },
        {
          name: "Line chart with click behavior",
          display: "line",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
            limit: 5,
          },
        },
      ],
      cards: [
        {
          size_x: 8,
          col: 0,
          visualization_settings: {
            column_settings: {
              '["name","SUBTOTAL"]': {
                click_behavior: {
                  type: "link",
                  linkType: "url",
                  linkTemplate: "https://metabase.com",
                  linkTextTemplate: "Link Text Applied",
                },
              },
            },
          },
        },
        {
          size_x: 8,
          col: 8,
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "url",
              linkTemplate: "https://metabase.com",
            },
          },
        },
      ],
    }).then(({ dashboard }) => {
      cy.wrap(dashboard.id).as("dashboardId");
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

  it("should not trigger url click behaviors in the sdk (metabase#51099)", () => {
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
