export {};

const { H } = cy;

describe("scenarios > dashboard > visualizer > funnel title navigation", () => {
  beforeEach(() => {
    H.restore();

    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    cy.signInAsNormalUser();
  });

  it("should open the underlying question when clicking the title of a single-question visualizer funnel (UXW-2692)", () => {
    const visualizerTitle = "UXW-2692 Visualizer Funnel";

    H.createNativeQuestion({
      name: "UXW-2692 Funnel Base",
      display: "funnel",
      native: {
        query: `
          SELECT 73 AS "Val", 'Downloads' AS "Step"
          UNION ALL
          SELECT 52 AS "Val", 'Followers' AS "Step"
        `,
      },
      visualization_settings: {
        "funnel.metric": "Val",
        "funnel.dimension": "Step",
      },
    }).then(({ body: { id: questionId } }) => {
      H.createDashboard({ name: "UXW-2692 Dashboard" }).then(
        ({ body: { id: dashboardId } }) => {
          cy.request("PUT", `/api/dashboard/${dashboardId}`, {
            dashcards: [
              {
                id: -1,
                card_id: questionId,
                dashboard_tab_id: null,
                row: 0,
                col: 0,
                size_x: 12,
                size_y: 8,
                visualization_settings: {
                  visualization: {
                    display: "funnel",
                    columnValuesMapping: {
                      COLUMN_1: [
                        {
                          name: "COLUMN_1",
                          originalName: "Step",
                          sourceId: `card:${questionId}`,
                        },
                      ],
                      COLUMN_2: [
                        {
                          name: "COLUMN_2",
                          originalName: "Val",
                          sourceId: `card:${questionId}`,
                        },
                      ],
                    },
                    settings: {
                      "card.title": visualizerTitle,
                      "funnel.metric": "COLUMN_2",
                      "funnel.dimension": "COLUMN_1",
                      "funnel.rows": [
                        {
                          key: "Followers",
                          name: "Followers",
                          enabled: true,
                        },
                        {
                          key: "Downloads",
                          name: "Downloads",
                          enabled: true,
                        },
                      ],
                    },
                  },
                },
              },
            ],
          });

          H.visitDashboard(dashboardId);

          cy.wait("@dashcardQuery");
          H.getDashboardCard(0).findByTestId("funnel-chart").should("exist");

          H.clickOnCardTitle(0);

          cy.location("pathname").should("contain", `/question/${questionId}`);
        },
      );
    });
  });
});
