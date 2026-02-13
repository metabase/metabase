const { H } = cy;
import {
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";
import { useState } from "react";

import { WEBMAIL_CONFIG } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { defer } from "metabase/lib/promise";
import { Stack } from "metabase/ui";
import type {
  ConcreteFieldReference,
  DashboardCard,
  Parameter,
} from "metabase-types/api";

const { WEB_PORT } = WEBMAIL_CONFIG;

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
      cy.wrap(String(dashboard.id)).as("dashboardNumericStringId");
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
    cy.get<string>("@dashboardId").then((dashboardId) => {
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

  it("should show a watermark on dashcards in development mode", () => {
    cy.intercept("/api/session/properties", (req) => {
      req.continue((res) => {
        res.body["token-features"].development_mode = true;
      });
    });

    cy.get("@dashboardId").then((dashboardId) => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    getSdkRoot().within(() => {
      cy.findAllByTestId("development-watermark").should("have.length", 1);
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
        cy.get(dashboardIdAlias).then((dashboardId) => {
          mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
        });

        getSdkRoot().within(() => {
          cy.findByText("Orders in a dashboard").should("be.visible");
          cy.findByText("Orders").should("be.visible");
          H.assertTableRowsCount(2000);
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
          H.tableInteractiveBody().should("not.exist");
          cy.findByText("Test text card").should("not.exist");
        });
      });
    });
  });

  it('should drill dashboards with filter values and not showing "Question not found" error (EMB-84)', () => {
    cy.get("@dashboardId").then((dashboardId) => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    H.filterWidget().eq(0).click();
    H.popover().button("Previous 12 months").click();

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

  it('should render staged picker when passing `drillThroughQuestionProps.dataPicker = "staged"`', () => {
    cy.get("@dashboardId").then((dashboardId) => {
      mountSdkContent(
        <InteractiveDashboard
          dashboardId={dashboardId}
          drillThroughQuestionProps={{ dataPicker: "staged" }}
        />,
      );
    });

    getSdkRoot().within(() => {
      getTableCell("User ID", 1).findByText("1").should("be.visible").click();

      H.popover().findByText("View this User's Orders").click();

      cy.button("Edit question").click();

      // Data step
      cy.findByText("Orders").click();

      cy.log("Go back to the bucket step");
      H.popover().within(() => {
        cy.icon("chevronleft").click();
        cy.icon("chevronleft").click();

        cy.findByText("Raw Data").should("be.visible");
        cy.findByText("Models").should("be.visible");
      });
    });
  });

  const idTypes = [
    {
      idType: "numeric ID",
      dashboardIdAlias: "@dashboardId",
      issueId: "(EMB-773)",
    },
    {
      idType: "numeric string ID",
      dashboardIdAlias: "@dashboardNumericStringId",
      issueId: "(EMB-1120)",
    },
    {
      idType: "entity ID",
      dashboardIdAlias: "@dashboardEntityId",
      issueId: "(EMB-773)",
    },
  ];

  describe("Dashboard ID types", () => {
    idTypes.forEach(({ idType, dashboardIdAlias, issueId }) => {
      it(`can go to dashcard and go back using a ${idType} dashboard ${issueId}`, () => {
        cy.get(dashboardIdAlias).then((dashboardId) => {
          mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
        });

        getSdkRoot().within(() => {
          H.getDashboardCard().findByText("Orders").click();

          cy.findByTestId("interactive-question-result-toolbar").should(
            "be.visible",
          );

          cy.findByLabelText("Back to Orders in a dashboard").click();
          cy.findByText("Orders in a dashboard").should("be.visible");
          cy.findByText("Back to Orders in a dashboard").should("not.exist");
        });
      });

      it(`can drill a question and go back using a ${idType} dashboard ${issueId}`, () => {
        cy.get(dashboardIdAlias).then((dashboardId) => {
          mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
        });

        getSdkRoot().within(() => {
          cy.findByText("123").first().click();
          H.popover().findByText("View this Product's Orders").click();

          cy.findByLabelText("Back to Orders in a dashboard").click();
          cy.findByText("Orders in a dashboard").should("be.visible");
          cy.findByText("Back to Orders in a dashboard").should("not.exist");
        });
      });
    });
  });

  it("should only call POST /dataset once when parent component re-renders (EMB-288)", () => {
    cy.intercept("POST", "/api/dataset").as("datasetQuery");

    const TestComponent = ({ dashboardId }: { dashboardId: string }) => {
      const [counter, setCounter] = useState(0);

      return (
        <div>
          <button onClick={() => setCounter((c) => c + 1)}>
            Trigger parent re-render ({counter})
          </button>

          <InteractiveDashboard dashboardId={dashboardId} />
        </div>
      );
    };

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<TestComponent dashboardId={dashboardId} />);
    });

    // Drill down to "See these Orders"
    cy.wait("@dashcardQuery");
    cy.get("[data-dataset-index=0] > [data-column-id='PRODUCT_ID']").click();

    H.popover()
      .findByText(/View this Product/)
      .click();

    cy.wait("@datasetQuery");

    // Trigger multiple parent re-renders
    getSdkRoot().within(() => {
      cy.findByText(/Trigger parent re-render/).click();
      cy.findByText(/Trigger parent re-render/).click();
      cy.findByText(/Trigger parent re-render/).click();
    });

    // Verify no additional dataset queries were made after re-renders
    cy.wait(500);
    cy.get("@datasetQuery.all").should("have.length", 1);
  });

  idTypes.forEach(({ idType, dashboardIdAlias }) => {
    it(`should be able to download dashcard results using ${idType}`, () => {
      cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query/xlsx").as(
        "dashcardDownload",
      );

      cy.get(dashboardIdAlias).then((dashboardId) => {
        mountSdkContent(
          <InteractiveDashboard dashboardId={dashboardId} withDownloads />,
        );
      });

      getSdkRoot().within(() => {
        cy.findByText("Orders in a dashboard").should("be.visible");

        // Open dashcard menu
        H.getDashboardCard().realHover();
        H.getEmbeddedDashboardCardMenu().click();

        H.popover().findByText("Download results").click();
        H.popover().findByText(".xlsx").click();
        H.popover().findByText("Download").click();
      });

      cy.wait("@dashcardDownload").then((interception) => {
        expect(interception.response?.statusCode).to.equal(200);

        cy.log(
          "content-disposition is allowed in cross-origin requests (metabase#61708)",
        );
        expect(
          interception.response?.headers?.["access-control-expose-headers"],
        ).to.include("Content-Disposition");

        cy.log(
          "question name is prefixed in the downloaded file name (metabase#61708)",
        );
        expect(
          interception.response?.headers?.["content-disposition"],
        ).to.include('filename="orders_');
        expect(
          interception.response?.headers?.["content-disposition"],
        ).not.to.include('filename="query_result_');
      });
    });
  });

  describe("subscriptions", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.setupSMTP();
      cy.signOut();
    });

    it("should not include links to Metabase", () => {
      cy.get<string>("@dashboardId").then((dashboardId) => {
        mountSdkContent(
          <InteractiveDashboard dashboardId={dashboardId} withSubscriptions />,
        );

        cy.button("Subscriptions").click();
        H.clickSend();
        const emailUrl = `http://localhost:${WEB_PORT}/email`;
        cy.request("GET", emailUrl).then(({ body }) => {
          const latest = body.slice(-1)[0];
          cy.request(`${emailUrl}/${latest.id}/html`).then(({ body }) => {
            expect(body).to.include("Orders in a dashboard");
            expect(body).not.to.include("href=");
          });
        });
      });
    });
  });
});

describe("scenarios > embedding-sdk > interactive-dashboard > tabs", () => {
  it("should not show add a chart button on empty dashboard with many tabs (metabase#65001)", () => {
    signInAsAdminAndEnableEmbeddingSdk();

    const TAB_WITH_CARDS = { id: 1, name: "Tab with cards" };
    const EMPTY_TAB = { id: 2, name: "Empty tab" };

    const questionCard: Partial<DashboardCard> = {
      id: ORDERS_DASHBOARD_DASHCARD_ID,
      dashboard_tab_id: TAB_WITH_CARDS.id,
      card_id: ORDERS_QUESTION_ID,
      row: 0,
      col: 0,
      size_x: 16,
      size_y: 8,
    };

    H.createDashboardWithTabs({
      name: "Dashboard with empty tab",
      tabs: [TAB_WITH_CARDS, EMPTY_TAB],
      dashcards: [questionCard],
    }).then(({ id: dashboardId }) => {
      cy.signOut();
      mockAuthProviderAndJwtSignIn();

      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    getSdkRoot().within(() => {
      cy.findByText("Orders").should("be.visible");
      cy.findByRole("tab", { name: EMPTY_TAB.name }).click();
      cy.findByTestId("dashboard-empty-state").should("be.visible");
      cy.findByText("Add a chart").should("not.exist");
    });
  });
});

function getTableCell(columnName, rowIndex) {
  cy.findAllByRole("columnheader").then(($columnHeaders) => {
    const columnHeaderIndex = $columnHeaders
      .toArray()
      .findIndex(($columnHeader) => $columnHeader.textContent === columnName);
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByRole("row")
      .eq(rowIndex)
      .findAllByTestId("cell-data")
      .eq(columnHeaderIndex)
      .as("cellData");
  });

  return cy.get("@cellData");
}
