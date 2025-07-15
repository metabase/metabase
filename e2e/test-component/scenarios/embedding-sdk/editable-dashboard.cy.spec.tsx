const { H } = cy;
import { EditableDashboard } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { defer } from "metabase/lib/promise";
import type {
  ConcreteFieldReference,
  DashboardCard,
  Parameter,
} from "metabase-types/api";
import {
  createMockHeadingDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

const categoryParameter = createMockParameter({
  id: "1b9cd9f1",
  name: "Category",
  type: "string/=",
  slug: "category",
  sectionId: "string",
});

const textParameter = createMockParameter({
  name: "Text",
  slug: "string",
  id: "5aefc726",
  type: "string/=",
  sectionId: "string",
});

const countParameter = createMockParameter({
  id: "88a1257c",
  name: "Count",
  type: "number/<=",
  slug: "count",
  sectionId: "number",
});

describe("scenarios > embedding-sdk > editable-dashboard", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    H.createDashboard({
      name: "Embedding SDK Test Dashboard",
      parameters: [categoryParameter, textParameter, countParameter],
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
    cy.get<string>("@dashboardId").then((dashboardId) => {
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

  it("should allow clicking dashcard filters in edit mode (VIZ-1249)", () => {
    cy.signInAsAdmin();
    cy.get<number>("@dashboardId").then((dashboardId) => {
      H.updateDashboardCards({
        dashboard_id: dashboardId,
        cards: [
          createMockHeadingDashboardCard({
            id: -1,
            size_x: 6,
            size_y: 1,
            inline_parameters: [textParameter.id, countParameter.id],
          }),
          {
            id: -2,
            card_id: ORDERS_BY_YEAR_QUESTION_ID,
            size_x: 18,
            size_y: 6,
            row: 1,
            inline_parameters: [categoryParameter.id],
          },
        ],
      });
    });
    cy.signOut();

    cy.get<number>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<EditableDashboard dashboardId={dashboardId} />);
    });

    H.editDashboard();

    // Ensure can open collapsed filter list
    H.getDashboardCard(0).findByTestId("show-filter-parameter-button").click();
    H.popover().findByText("Count").click();
    H.dashboardParameterSidebar().should("exist").button("Done").click();

    // Ensure can click a regular card filter
    H.getDashboardCard(1).within(() => {
      H.filterWidget({ isEditing: true }).contains("Category").click();
    });
    H.dashboardParameterSidebar().should("exist");
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
        cy.get(dashboardIdAlias).then((dashboardId) => {
          mountSdkContent(<EditableDashboard dashboardId={dashboardId} />);
        });

        getSdkRoot().within(() => {
          cy.findByDisplayValue("Embedding SDK Test Dashboard").should(
            "be.visible",
          );
          cy.findByText("This dashboard is empty").should("be.visible");
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
          cy.findByText("This dashboard is empty").should("not.exist");
        });
      });
    });
  });

  describe("EMB-84", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      cy.log("Create a dashboard with Created at filter with a default value");
      const { ORDERS } = SAMPLE_DATABASE;

      const DATE_FILTER: Parameter = {
        id: "2",
        name: "Date filter",
        slug: "filter-date",
        type: "date/all-options",
        default: "2024-01-01~2024-12-31",
      };
      const CREATED_AT_FIELD_REF: ConcreteFieldReference = [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime" },
      ];

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
        dashcards: [questionCard],
        parameters: [DATE_FILTER],
      }).then(({ body: dashboard }) => {
        cy.wrap(dashboard.id).as("dashboardId");
      });
      cy.signOut();
    });

    it('should drill dashboards with filter values and not showing "Question not found" error (EMB-84)', () => {
      cy.get("@dashboardId").then((dashboardId) => {
        mountSdkContent(<EditableDashboard dashboardId={dashboardId} />);
      });

      const { promise, resolve: resolveCardEndpoint } = defer();

      /**
       * This seems to be the only reliable way to force the error to stay, and we will resolve
       * the promise that will cause the error to go away manually after asserting that it's not there.
       */
      cy.intercept("get", "/api/card/*", (req) => {
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

        cy.findByTestId("interactive-question-result-toolbar").should(
          "be.visible",
        );
      });
    });
  });

  it("should not show New Question button in sidebar (metabase#53896)", () => {
    cy.get("@dashboardId").then((dashboardId) => {
      mountSdkContent(<EditableDashboard dashboardId={dashboardId} />);
    });

    getSdkRoot().within(() => {
      cy.findByText("Add a chart").should("be.visible").click();

      cy.findByText("New Question").should("not.exist");
      cy.findByText("New SQL query").should("not.exist");
    });
  });
});
