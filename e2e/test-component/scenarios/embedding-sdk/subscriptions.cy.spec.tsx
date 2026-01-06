const { H } = cy;
import {
  EditableDashboard,
  InteractiveDashboard,
  StaticDashboard,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { createDashboard, getTextCardDetails } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { DashboardParameterMapping } from "metabase-types/api";

const { PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > subscriptions", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    const parameter = {
      id: "1b9cd9f1",
      name: "Category",
      slug: "category",
      type: "string/=",
      sectionId: "string",
    };
    const textCard = getTextCardDetails({ col: 16, text: "Test text card" });
    const questionCard = {
      id: ORDERS_DASHBOARD_DASHCARD_ID,
      card_id: ORDERS_QUESTION_ID,
      row: 0,
      col: 0,
      size_x: 16,
      size_y: 8,
      visualization_settings: {
        "card.title": "Test question card",
      },
      parameter_mappings: [
        {
          parameter_id: parameter.id,
          card_id: ORDERS_QUESTION_ID,
          target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
        } satisfies DashboardParameterMapping,
      ],
    };

    createDashboard({
      name: "Embedding SDK Test Dashboard",
      dashcards: [questionCard, textCard],
      parameters: [parameter],
    }).then(({ body: dashboard }) => {
      cy.wrap(dashboard.id).as("dashboardId");
      cy.wrap(dashboard.entity_id).as("dashboardEntityId");
    });

    cy.signOut();

    mockAuthProviderAndJwtSignIn();

    cy.signInAsAdmin();
    H.setupSMTP();

    cy.intercept("POST", "/api/pulse").as("createPulse");
  });

  describe("adding a subscription", () => {
    it("should work in StaticDashboard", () => {
      cy.get("@dashboardId").then((dashboardId) => {
        cy.signOut();
        mockAuthProviderAndJwtSignIn();

        mountSdkContent(
          <StaticDashboard dashboardId={dashboardId} withSubscriptions />,
        );
      });

      getSdkRoot().within(() => {
        cy.findByText("Embedding SDK Test Dashboard").should("be.visible");
        cy.icon("subscription").click();
        cy.findByText("Email this dashboard").should("be.visible");

        cy.log("can customize filter values");
        cy.findByRole("heading", {
          name: "Set filter values for when this gets sent",
        }).should("be.visible");

        cy.findByRole("button", { name: "Done" }).click();
        cy.wait("@createPulse");

        cy.findByText("Subscriptions").should("be.visible");

        // check that there are 2 subscriptions
        cy.findByText("Emailed hourly").should("be.visible");
      });
    });

    it("should work in InteractiveDashboard", () => {
      cy.get("@dashboardId").then((dashboardId) => {
        cy.signOut();
        mockAuthProviderAndJwtSignIn();

        mountSdkContent(
          <InteractiveDashboard dashboardId={dashboardId} withSubscriptions />,
        );
      });

      getSdkRoot().within(() => {
        cy.findByText("Embedding SDK Test Dashboard").should("be.visible");
        cy.icon("subscription").click();
        cy.findByText("Email this dashboard").should("be.visible");

        cy.log("can customize filter values");
        cy.findByRole("heading", {
          name: "Set filter values for when this gets sent",
        }).should("be.visible");

        cy.findByRole("button", { name: "Done" }).click();
        cy.wait("@createPulse");

        cy.findByText("Subscriptions").should("be.visible");

        // check that there are 2 subscriptions
        cy.findByText("Emailed hourly").should("be.visible");
      });
    });

    it("should work in EditableDashboard", () => {
      cy.get("@dashboardId").then((dashboardId) => {
        cy.signOut();
        mockAuthProviderAndJwtSignIn();

        mountSdkContent(
          <EditableDashboard dashboardId={dashboardId} withSubscriptions />,
        );
      });

      getSdkRoot().within(() => {
        cy.findByText("Embedding SDK Test Dashboard").should("be.visible");
        cy.icon("subscription").click();
        cy.findByText("Email this dashboard").should("be.visible");

        cy.log("can customize filter values");
        cy.findByRole("heading", {
          name: "Set filter values for when this gets sent",
        }).should("be.visible");

        cy.findByRole("button", { name: "Done" }).click();
        cy.wait("@createPulse");

        cy.findByText("Subscriptions").should("be.visible");

        // check that there are 2 subscriptions
        cy.findByText("Emailed hourly").should("be.visible");
      });
    });
  });
});
