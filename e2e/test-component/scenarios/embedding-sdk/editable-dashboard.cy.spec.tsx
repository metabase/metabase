import { EditableDashboard } from "@metabase/embedding-sdk-react";

import { describeEE } from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

describeEE("scenarios > embedding-sdk > editable-dashboard", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    cy.createDashboard({
      name: "Embedding SDK Test Dashboard",
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

  it("Should not open sidesheet when clicking last edit info (metabase#48354)", () => {
    cy.get<string>("@dashboardId").then(dashboardId => {
      mountSdkContent(<EditableDashboard dashboardId={dashboardId} />);
    });

    getSdkRoot().within(() => {
      cy.findByTestId("dashboard-name-heading").realHover();

      cy.findByText("Edited a few seconds ago by you")
        .click()
        .should("be.visible");
    });

    cy.findByRole("heading", { name: "Info" }).should("not.exist");
    cy.findByRole("tab", { name: "Overview" }).should("not.exist");
    cy.findByRole("tab", { name: "History" }).should("not.exist");
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
          mountSdkContent(<EditableDashboard dashboardId={dashboardId} />);
        });

        getSdkRoot().within(() => {
          cy.findByDisplayValue("Embedding SDK Test Dashboard").should(
            "be.visible",
          );
          cy.findByText("This dashboard is looking empty.").should(
            "be.visible",
          );
        });
      });
    });

    failureTestCases.forEach(({ name, dashboardId }) => {
      it(`should show an error message for ${name}`, () => {
        mountSdkContent(<EditableDashboard dashboardId={dashboardId} />);

        getSdkRoot().within(() => {
          const expectedErrorMessage = `Dashboard ${dashboardId} not found. Make sure you pass the correct ID.`;
          cy.findByRole("alert").should("have.text", expectedErrorMessage);

          cy.findByDisplayValue("Embedding SDK Test Dashboard").should(
            "not.exist",
          );
          cy.findByText("This dashboard is looking empty.").should("not.exist");
        });
      });
    });
  });
});
