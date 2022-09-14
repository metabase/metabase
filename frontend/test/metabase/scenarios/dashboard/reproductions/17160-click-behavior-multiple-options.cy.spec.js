import { restore, visitDashboard } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const TARGET_DASHBOARD_NAME = "Target dashboard";
const CATEGORY_FILTER_PARAMETER_ID = "7c9ege62";

describe("issue 17160", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    restore();
    cy.signInAsAdmin();
  });

  it("should pass multiple filter values to questions and dashboards (metabase#17160-1)", () => {
    setup();

    // 1. Check click behavior connected to a question
    visitSourceDashboard();

    cy.findAllByText("click-behavior-question-label").eq(0).click();
    cy.wait("@cardQuery");

    cy.url().should("include", "/question");

    assertMultipleValuesFilterState();

    // 2. Check click behavior connected to a dashboard
    visitSourceDashboard();

    cy.get("@targetDashboardId").then(id => {
      cy.intercept("POST", `/api/dashboard/${id}/dashcard/*/card/*/query`).as(
        "targetDashcardQuery",
      );

      cy.findAllByText("click-behavior-dashboard-label").eq(0).click();
      cy.wait("@targetDashcardQuery");
    });

    cy.url().should("include", "/dashboard");
    cy.location("search").should("eq", "?category=Doohickey&category=Gadget");
    cy.findByText(TARGET_DASHBOARD_NAME);

    assertMultipleValuesFilterState();
  });

  it.skip("should pass multiple filter values to public questions and dashboards (metabase#17160-2)", () => {
    // FIXME: setup public dashboards
    setup();

    // 1. Check click behavior connected to a public question
    visitPublicSourceDashboard();

    cy.findAllByText("click-behavior-question-label").eq(0).click();

    cy.url().should("include", "/public/question");

    assertMultipleValuesFilterState();

    // 2. Check click behavior connected to a publicdashboard
    visitPublicSourceDashboard();

    cy.findAllByText("click-behavior-dashboard-label").eq(0).click();

    cy.url().should("include", "/public/dashboard");
    cy.location("search").should("eq", "?category=Doohickey&category=Gadget");

    cy.findByText(TARGET_DASHBOARD_NAME);

    assertMultipleValuesFilterState();
  });
});

function assertMultipleValuesFilterState() {
  cy.findByText("2 selections").click();

  cy.findByTestId("Doohickey-filter-value").within(() =>
    cy.get("input").should("be.checked"),
  );
  cy.findByTestId("Gadget-filter-value").within(() =>
    cy.get("input").should("be.checked"),
  );
}

function setup() {
  cy.createNativeQuestion({
    name: `17160Q`,
    native: {
      query: "SELECT * FROM products WHERE {{CATEGORY}}",
      "template-tags": {
        CATEGORY: {
          id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
          name: "CATEGORY",
          display_name: "CATEGORY",
          type: "dimension",
          dimension: ["field", PRODUCTS.CATEGORY, null],
          "widget-type": "category",
          default: null,
        },
      },
    },
  }).then(({ body: { id: questionId } }) => {
    // Share the question
    cy.request("POST", `/api/card/${questionId}/public_link`);

    cy.createDashboard({ name: "17160D" }).then(
      ({ body: { id: dashboardId } }) => {
        // Share the dashboard
        cy.request("POST", `/api/dashboard/${dashboardId}/public_link`).then(
          ({ body: { uuid } }) => {
            cy.wrap(uuid).as("sourceDashboardUUID");
          },
        );
        cy.wrap(dashboardId).as("sourceDashboardId");

        // Add the question to the dashboard
        cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
          cardId: questionId,
        }).then(({ body: { id: dashCardId } }) => {
          // Add dashboard filter
          cy.request("PUT", `/api/dashboard/${dashboardId}`, {
            parameters: [
              {
                default: ["Doohickey", "Gadget"],
                id: CATEGORY_FILTER_PARAMETER_ID,
                name: "Category",
                slug: "category",
                sectionId: "string",
                type: "string/=",
              },
            ],
          });

          createTargetDashboard().then(targetDashboardId => {
            cy.intercept("GET", `/api/dashboard/${targetDashboardId}`).as(
              "targetDashboardLoaded",
            );

            cy.wrap(targetDashboardId).as("targetDashboardId");

            // Create a click behavior and resize the question card
            cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
              cards: [
                {
                  id: dashCardId,
                  card_id: questionId,
                  row: 0,
                  col: 0,
                  size_x: 12,
                  size_y: 10,
                  parameter_mappings: [
                    {
                      parameter_id: CATEGORY_FILTER_PARAMETER_ID,
                      card_id: 4,
                      target: ["dimension", ["template-tag", "CATEGORY"]],
                    },
                  ],
                  visualization_settings: getVisualSettingsWithClickBehavior(
                    questionId,
                    targetDashboardId,
                  ),
                },
              ],
            });
          });
        });
      },
    );
  });
}

function getVisualSettingsWithClickBehavior(questionTarget, dashboardTarget) {
  return {
    column_settings: {
      '["name","ID"]': {
        click_behavior: {
          targetId: questionTarget,
          parameterMapping: {
            "6b8b10ef-0104-1047-1e1b-2492d5954322": {
              source: {
                type: "parameter",
                id: CATEGORY_FILTER_PARAMETER_ID,
                name: "Category",
              },
              target: {
                type: "variable",
                id: "CATEGORY",
              },
              id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
            },
          },
          linkType: "question",
          type: "link",
          linkTextTemplate: "click-behavior-question-label",
        },
      },

      '["name","EAN"]': {
        click_behavior: {
          targetId: dashboardTarget,
          parameterMapping: {
            dd19ec03: {
              source: {
                type: "parameter",
                id: CATEGORY_FILTER_PARAMETER_ID,
                name: "Category",
              },
              target: {
                type: "parameter",
                id: "dd19ec03",
              },
              id: "dd19ec03",
            },
          },
          linkType: "dashboard",
          type: "link",
          linkTextTemplate: "click-behavior-dashboard-label",
        },
      },
    },
  };
}

function createTargetDashboard() {
  return cy
    .createQuestionAndDashboard({
      dashboardDetails: {
        name: TARGET_DASHBOARD_NAME,
      },
      questionDetails: {
        query: {
          "source-table": PRODUCTS_ID,
        },
      },
    })
    .then(({ body: { id, card_id, dashboard_id } }) => {
      // Share the dashboard
      cy.request("POST", `/api/dashboard/${dashboard_id}/public_link`);

      // Add a filter
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        parameters: [
          {
            name: "Category",
            slug: "category",
            id: "dd19ec03",
            type: "string/=",
            sectionId: "string",
          },
        ],
      });

      // Resize the question card and connect the filter to it
      return cy
        .request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 12,
              size_y: 10,
              parameter_mappings: [
                {
                  parameter_id: "dd19ec03",
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                },
              ],
            },
          ],
        })
        .then(() => {
          return dashboard_id;
        });
    });
}

function visitSourceDashboard() {
  cy.get("@sourceDashboardId").then(id => {
    visitDashboard(id);
    cy.wait("@targetDashboardLoaded");
  });
}

function visitPublicSourceDashboard() {
  cy.get("@sourceDashboardUUID").then(uuid => {
    cy.visit(`/public/dashboard/${uuid}`);

    cy.findByTextEnsureVisible("Enormous Wool Car");
  });
}
