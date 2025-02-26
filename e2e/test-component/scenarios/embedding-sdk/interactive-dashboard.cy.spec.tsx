const { H } = cy;
import {
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { defer } from "metabase/lib/promise";
import { Stack } from "metabase/ui";
import type {
  ConcreteFieldReference,
  DashboardCard,
  Parameter,
} from "metabase-types/api";

const { ORDERS } = SAMPLE_DATABASE;

const DATE_FILTER: Parameter = {
  id: "2",
  name: "Date filter",
  slug: "filter-date",
  type: "date/all-options",
};
const CREATED_AT_FIELD_REF: ConcreteFieldReference = [
  "field",
  ORDERS.CREATED_AT,
  { "base-type": "type/DateTime" },
];

describe("scenarios > embedding-sdk > interactive-dashboard", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    const textCard = H.getTextCardDetails({ col: 16, text: "Test text card" });
    const questionCard: Partial<DashboardCard> = {
      id: ORDERS_DASHBOARD_DASHCARD_ID,
      parameter_mappings: [
        {
          parameter_id: DATE_FILTER.id,
          card_id: ORDERS_QUESTION_ID,
          target: ["dimension", CREATED_AT_FIELD_REF],
        },
      ],
      card_id: ORDERS_QUESTION_ID,
      row: 0,
      col: 0,
      size_x: 16,
      size_y: 8,
    };

    H.createDashboard({
      name: "Orders in a dashboard",
      dashcards: [questionCard, textCard],
      parameters: [DATE_FILTER],
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

    // Those tests are sometimes rendering 6 rows, sometimes 7 rows, we don't want this to be flaky
    const rowsTextRegex = /Rows 1-[6,7] of first 2000/;

    successTestCases.forEach(({ name, dashboardIdAlias }) => {
      it(`should load dashboard content for ${name}`, () => {
        cy.get(dashboardIdAlias).then(dashboardId => {
          mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
        });

        getSdkRoot().within(() => {
          cy.findByText("Orders in a dashboard").should("be.visible");
          cy.findByText("Orders").should("be.visible");
          cy.findByText(rowsTextRegex).should("be.visible");
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
          cy.findByText(rowsTextRegex).should("not.exist");
          cy.findByText("Test text card").should("not.exist");
        });
      });
    });
  });

  it('should drill dashboards with filter values and not showing "Question not found" error (EMB-84)', () => {
    cy.get("@dashboardId").then(dashboardId => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    H.filterWidget().eq(0).click();
    H.popover().button("Previous 12 months").click();

    const { promise, resolve: resolveCardEndpoint } = defer();

    /**
     * This seems to be the only reliable way to force the error to stay, and we will resolve
     * the promise that will cause the error to go away manually after asserting that it's not there.
     */
    cy.intercept("get", "/api/card/*", req => {
      return promise.then(() => {
        req.continue();
      });
    }).as("getCard");

    getSdkRoot().within(() => {
      H.getDashboardCard().findByText("Orders").click();
      cy.findByText("Question not found")
        .should("not.exist")
        .then(() => {
          resolveCardEndpoint();
        });
      cy.findByText("New question").should("be.visible");
    });
  });
});
