import {
  restore,
  popover,
  showDashboardCardActions,
} from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PEOPLE, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

// This token (simliar to what's done in parameters-embedded.cy.spec.js) just encodes the dashboardId=2 and dashboard parameters
// See this link for details: https://jwt.io/#debugger-io?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjJ9LCJwYXJhbXMiOnt9LCJpYXQiOjE2MDc5NzUwMTMsIl9lbWJlZGRpbmdfcGFyYW1zIjp7InN0YXRlIjoiZW5hYmxlZCIsImNpdHkiOiJlbmFibGVkIn19.nqy_ibysLb6QB9o3loG5SNgOoE5HdexuUjCjA_KS1kM
const DASHBOARD_JWT_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjJ9LCJwYXJhbXMiOnt9LCJpYXQiOjE2MDc5NzUwMTMsIl9lbWJlZGRpbmdfcGFyYW1zIjp7InN0YXRlIjoiZW5hYmxlZCIsImNpdHkiOiJlbmFibGVkIn19.nqy_ibysLb6QB9o3loG5SNgOoE5HdexuUjCjA_KS1kM";

// TODO: Refactor `createDashboardWithQuestion`, `createQuestion`, and `createDashboard` into helpers at some point.
// They're also used in `dashboard-drill.cy.spec.js` to help with question setup.
function createDashboardWithQuestion(
  { dashboardName = "dashboard" } = {},
  callback,
) {
  createQuestion({}, questionId => {
    createDashboard({ dashboardName, questionId }, callback);
  });
}

// Create a native SQL question with two parameters for city and state.
function createQuestion(options, callback) {
  cy.createNativeQuestion({
    name: "Count of People by State (SQL)",
    native: {
      query:
        'SELECT "PUBLIC"."PEOPLE"."STATE" AS "STATE", count(*) AS "count" FROM "PUBLIC"."PEOPLE" WHERE 1=1 [[ AND {{city}}]] [[ AND {{state}}]] GROUP BY "PUBLIC"."PEOPLE"."STATE" ORDER BY "count" DESC, "PUBLIC"."PEOPLE"."STATE" ASC',
      "template-tags": {
        city: {
          id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
          name: "city",
          "display-name": "City",
          type: "dimension",
          dimension: ["field", PEOPLE.CITY, null],
          "widget-type": "category",
        },
        state: {
          id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
          name: "state",
          "display-name": "State",
          type: "dimension",
          dimension: ["field", PEOPLE.STATE, null],
          "widget-type": "category",
        },
      },
    },
    display: "bar",
  }).then(({ body: { id: questionId } }) => {
    callback(questionId);
  });
}

// Create a dashboard with the city filter dependent on the state filter.
// Once created, add the provided questionId to the dashboard and then
// map the city/state filters to the template-tags in the native query.
function createDashboard({ dashboardName, questionId }, callback) {
  cy.createDashboard(dashboardName).then(({ body: { id: dashboardId } }) => {
    cy.request("PUT", `/api/dashboard/${dashboardId}`, {
      parameters: [
        {
          name: "State",
          slug: "state",
          id: "e8f79be9",
          type: "location/state",
        },
        {
          name: "City",
          slug: "city",
          id: "170b8e99",
          type: "location/city",
          filteringParameters: ["e8f79be9"],
        },
      ],
    });

    cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
      cardId: questionId,
    }).then(({ body: { id: dashCardId } }) => {
      cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
        cards: [
          {
            id: dashCardId,
            card_id: questionId,
            row: 0,
            col: 0,
            sizeX: 10,
            sizeY: 10,
            parameter_mappings: [
              {
                parameter_id: "e8f79be9",
                card_id: questionId,
                target: ["dimension", ["template-tag", "state"]],
              },
              {
                parameter_id: "170b8e99",
                card_id: questionId,
                target: ["dimension", ["template-tag", "city"]],
              },
            ],
          },
        ],
      });

      callback(dashboardId);
    });
  });
}

describe("scenarios > dashboard > chained filter", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  for (const has_field_values of ["search", "list"]) {
    it(`limit ${has_field_values} options based on linked filter`, () => {
      cy.request("PUT", `/api/field/${PEOPLE.CITY}`, { has_field_values }),
        cy.visit("/dashboard/1");
      // start editing
      cy.icon("pencil").click();

      // add a state filter
      cy.icon("filter").click();
      popover().within(() => {
        cy.findByText("Location").click();
        cy.findByText("Dropdown").click();
      });

      // connect that to people.state
      cy.findByText("Column to filter on")
        .parent()
        .within(() => {
          cy.findByText("Select…").click();
        });
      popover().within(() => {
        cy.findByText("State").click();
      });

      // open the linked filters tab, and click the click to add a City filter
      cy.findByText("Linked filters").click();
      cy.findByText("add another dashboard filter").click();
      popover().within(() => {
        cy.findByText("Location").click();
        cy.findByText("Dropdown").click();
      });

      // connect that to person.city
      cy.findByText("Column to filter on")
        .parent()
        .within(() => {
          cy.findByText("Select…").click();
        });
      popover().within(() => {
        cy.findByText("City").click();
      });

      // Link city to state
      cy.findByText("Limit this filter's choices")
        .parent()
        .within(() => {
          // turn on the toggle
          cy.findByText("Location")
            .parent()
            .within(() => {
              cy.get("a").click();
            });

          // open up the list of linked columns
          cy.findByText("Location").click();
          // It's hard to assert on the "table.column" pairs.
          // We just assert that the headers are there to know that something appeared.
          cy.findByText("Filtering column");
          cy.findByText("Filtered column");
        });

      cy.findByText("Save").click();
      cy.findByText("You're editing this dashboard.").should("not.exist");

      // now test that it worked!
      // Select Alaska as a state. We should see Anchorage as a option but not Anacoco
      cy.findByText("Location").click();
      popover().within(() => {
        cy.findByText("AK").click();
        cy.findByText("Add filter").click();
      });
      cy.findByText("Location 1").click();
      popover().within(() => {
        cy.findByPlaceholderText(
          has_field_values === "search" ? "Search by City" : "Search the list",
        ).type("An");
        cy.findByText("Anchorage");
        cy.findByText("Anacoco").should("not.exist");
      });
    });
  }

  it("can use a chained filter with embedded SQL questions (metabase#13868)", () => {
    createDashboardWithQuestion({}, dashboardId => {
      // Enable embedding for this dashboard with both the city and state filters enabled
      cy.request("PUT", `/api/dashboard/${dashboardId}`, {
        embedding_params: {
          city: "enabled",
          state: "enabled",
        },
        enable_embedding: true,
      });
      cy.visit(`/dashboard/${dashboardId}`);
    });

    // First make sure normal filtering works - we reuse the chained filter test above.
    // Select Alaska as a state. We should see Anchorage as a option but not Anacoco.
    // Once Anchorage is selected, the chart should display.
    cy.findByText("State").click();
    popover().within(() => {
      cy.findByText("AK").click();
      cy.findByText("Add filter").click();
    });
    cy.findByText("City").click();
    popover().within(() => {
      cy.findByPlaceholderText("Search by City").type("An");
      cy.findByText("Anacoco").should("not.exist");
      cy.findByText("Anchorage").click();
      cy.findByText("Add filter").click();
    });
    cy.get(".y-label").contains("count");

    // Then we make sure it works in pseudo-embedded mode.
    cy.visit(`/embed/dashboard/${DASHBOARD_JWT_TOKEN}`);
    cy.findByText("State").click();
    popover().within(() => {
      cy.findByText("AK").click();
      cy.findByText("Add filter").click();
    });
    cy.findByText("City").click();
    popover().within(() => {
      cy.findByPlaceholderText("Search by City").type("An");
      cy.findByText("Anacoco").should("not.exist");
      cy.findByText("Anchorage").click();
      cy.findByText("Add filter").click();
    });

    cy.get(".y-label").contains("count");
    cy.findByText("There was a problem displaying this chart.").should(
      "not.exist",
    );
  });

  it.skip("should work for all field types (metabase#15170)", () => {
    // Change Field Types for the following fields
    cy.request("PUT", `/api/field/${PRODUCTS.ID}`, {
      special_type: null,
    });

    cy.request("PUT", `/api/field/${PRODUCTS.EAN}`, {
      special_type: "type/PK",
    });

    cy.createQuestion({
      name: "15170",
      query: { "source-table": PRODUCTS_ID },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard("15170D").then(({ body: { id: DASHBOARD_ID } }) => {
        // Add filter to the dashboard
        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
          parameters: [
            {
              id: "50c9eac6",
              name: "ID",
              slug: "id",
              type: "id",
            },
          ],
        });

        // Add previously created question to the dashboard
        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          // Connect filter to that question
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 8,
                sizeY: 6,
                parameter_mappings: [
                  {
                    parameter_id: "50c9eac6",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field-id", PRODUCTS.EAN]],
                  },
                ],
              },
            ],
          });
        });

        cy.visit(`/dashboard/${DASHBOARD_ID}`);
        cy.icon("pencil").click();
        showDashboardCardActions();
        cy.icon("click").click();
        cy.findByText(/Ean/i).click();
        cy.findByText("Update a dashboard filter").click();
        cy.findByText("Available filters")
          .parent()
          .findByText(/ID/i)
          .click();
        popover().within(() => {
          cy.findByText(/Ean/i);
        });
      });
    });
  });
});
