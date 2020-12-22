import {
  signIn,
  restore,
  modal,
  popover,
  createNativeQuestion,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { REVIEWS, REVIEWS_ID } = SAMPLE_DATASET;

describe("scenarios > dashboard > dashboard drill", () => {
  before(restore);
  beforeEach(signIn);

  it("should handle URL click through on a table", () => {
    createDashboardWithQuestion({}, dashboardId =>
      cy.visit(`/dashboard/${dashboardId}`),
    );
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-click").click({ force: true });

    // configure a URL click through on the  "MY_NUMBER" column
    cy.findByText("On-click behavior for each column")
      .parent()
      .parent()
      .within(() => cy.findByText("MY_NUMBER").click());
    cy.findByText("Go to a custom destination").click();
    cy.findByText("URL").click();

    // set the url and text template
    modal().within(() => {
      cy.get("input")
        .first()
        .type("/foo/{{my_number}}/{{my_param}}", {
          parseSpecialCharSequences: false,
        });
      cy.get("input")
        .last()
        .type("column value: {{my_number}}", {
          parseSpecialCharSequences: false,
        });
      cy.findByText("Done").click();
    });

    cy.findByText("Save").click();

    setParamValue("My Param", "param-value");

    // click value and confirm url updates
    cy.findByText("column value: 111").click();
    cy.location("pathname").should("eq", "/foo/111/param-value");
  });

  it.skip("should insert values from hidden column on custom destination URL click through (metabase#13927)", () => {
    cy.log("**-- 1. Create a question --**");

    createNativeQuestion(
      "13927",
      `SELECT PEOPLE.STATE, PEOPLE.CITY from PEOPLE;`,
    ).then(({ body: { id: QUESTION_ID } }) => {
      cy.log("**-- 2. Create a dashboard --**");

      cy.request("POST", "/api/dashboard", {
        name: "13927D",
      }).then(({ body: { id: DASHBOARD_ID } }) => {
        cy.log("**-- 3. Add question to the dashboard --**");

        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          cy.log("**-- 4. Set card parameters --**");

          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 6,
                sizeY: 8,
                series: [],
                visualization_settings: {
                  "table.cell_column": "CITY",
                  "table.pivot_column": "STATE",
                  column_settings: {
                    '["name","CITY"]': {
                      click_behavior: {
                        type: "link",
                        linkType: "url",
                        linkTextTemplate:
                          "Click to find out which state does {{CITY}} belong to.",
                        linkTemplate: "/test/{{STATE}}",
                      },
                    },
                  },
                  "table.columns": [
                    {
                      name: "STATE",
                      fieldRef: ["field-literal", "STATE", "type/Text"],
                      enabled: false,
                    },
                    {
                      name: "CITY",
                      fieldRef: ["field-literal", "CITY", "type/Text"],
                      enabled: true,
                    },
                  ],
                },
                parameter_mappings: [],
              },
            ],
          });
        });

        cy.visit(`/dashboard/${DASHBOARD_ID}`);

        cy.findByText(
          "Click to find out which state does Rye belong to.",
        ).click();

        cy.log("**Reported failing on v0.37.2**");
        cy.location("pathname").should("eq", "/test/CO");
      });
    });
  });

  it("should handle question click through on a table", () => {
    createDashboardWithQuestion({}, dashboardId =>
      cy.visit(`/dashboard/${dashboardId}`),
    );
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-click").click({ force: true });

    // configure a dashboard target for the "MY_NUMBER" column
    cy.findByText("On-click behavior for each column")
      .parent()
      .parent()
      .within(() => cy.findByText("MY_NUMBER").click());
    cy.findByText("Go to a custom destination").click();
    cy.findByText("Saved question").click();
    cy.findByText("Orders").click();
    cy.findByText("Orders → User ID").click();
    popover().within(() => cy.findByText("MY_NUMBER").click());
    cy.findByText("Products → Category").click();
    popover().within(() => cy.findByText("My Param").click());

    // set the text template
    cy.findByPlaceholderText("E.x. Details for {{Column Name}}").type(
      "num: {{my_number}}",
      { parseSpecialCharSequences: false },
    );
    cy.findByText("Save").click();

    // wait to leave editing mode and set a param value
    cy.findByText("You're editing this dashboard.").should("not.exist");
    setParamValue("My Param", "Widget");

    // click on table value
    cy.findByText("num: 111").click();

    // show filtered question
    cy.findByText("Orders");
    cy.findByText("User ID is 111");
    cy.findByText("Category is Widget");
    cy.findByText("Showing 5 rows");
  });

  it("should handle dashboard click through on a table", () => {
    createQuestion({}, questionId => {
      createDashboard(
        { dashboardName: "start dash", questionId },
        dashboardIdA => {
          createDashboardWithQuestion(
            { dashboardName: "end dash" },
            dashboardIdB => {
              cy.visit(`/dashboard/${dashboardIdA}`);
            },
          );
        },
      );
    });
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-click").click({ force: true });

    // configure clicks on "MY_NUMBER to update the param
    cy.findByText("On-click behavior for each column")
      .parent()
      .parent()
      .within(() => cy.findByText("MY_NUMBER").click());
    cy.findByText("Go to a custom destination").click();
    cy.findByText("Link to")
      .parent()
      .within(() => cy.findByText("Dashboard").click());
    modal().within(() => cy.findByText("end dash").click());
    cy.findByText("Available filters")
      .parent()
      .within(() => cy.findByText("My Param").click());
    popover().within(() => cy.findByText("MY_STRING").click());

    // set the text template
    cy.findByPlaceholderText("E.x. Details for {{Column Name}}").type(
      "text: {{my_string}}",
      { parseSpecialCharSequences: false },
    );
    cy.findByText("Save").click();

    // click on table value
    cy.findByText("text: foo").click();

    // check that param was set to "foo"
    cy.location("search").should("eq", "?my_param=foo");
    cy.findByText("My Param")
      .parent()
      .within(() => {
        cy.findByText("foo");
      });
  });

  // This was flaking. Example: https://dashboard.cypress.io/projects/a394u1/runs/2109/test-results/91a15b66-4b80-40bf-b569-de28abe21f42
  it.skip("should handle cross-filter on a table", () => {
    createDashboardWithQuestion({}, dashboardId =>
      cy.visit(`/dashboard/${dashboardId}`),
    );
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-click").click({ force: true });

    // configure clicks on "MY_NUMBER to update the param
    cy.findByText("On-click behavior for each column")
      .parent()
      .parent()
      .within(() => cy.findByText("MY_NUMBER").click());
    cy.findByText("Update a dashboard filter").click();
    cy.findByText("Pick one or more filters to update")
      .parent()
      .within(() => cy.findByText("My Param").click());
    popover().within(() => cy.findByText("MY_STRING").click());
    cy.findByText("Save").click();

    // click on table value
    cy.findByText("111").click();

    // check that param was set to "foo"
    cy.location("search").should("eq", "?my_param=foo");
    cy.findByText("My Param")
      .parent()
      .within(() => cy.findByText("foo"));
  });

  it("should pass multiple filters for numeric column on drill-through (metabase#13062)", () => {
    // Preparation for the test: "Arrange and Act phase" - see repro steps in #13062
    // 1. set "Rating" Field type to: "Category"

    cy.request("PUT", `/api/field/${REVIEWS.RATING}`, {
      special_type: "type/Category",
    });
    // 2. create a question based on Reviews
    cy.request("POST", `/api/card`, {
      name: "13062Q",
      dataset_query: {
        database: 1,
        query: {
          "source-table": REVIEWS_ID,
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
    }).then(({ body: { id: questionId } }) => {
      // 3. create a dashboard
      cy.request("POST", "/api/dashboard", {
        name: "13062D",
      }).then(({ body: { id: dashboardId } }) => {
        // add filter to the dashboard
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          parameters: [
            {
              id: "18024e69",
              name: "Category",
              slug: "category",
              type: "category",
            },
          ],
        });

        // add previously created question to the dashboard
        cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
          cardId: questionId,
        }).then(({ body: { id: dashCardId } }) => {
          // connect filter to that question
          cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
            cards: [
              {
                id: dashCardId,
                card_id: questionId,
                row: 0,
                col: 0,
                sizeX: 8,
                sizeY: 6,
                parameter_mappings: [
                  {
                    parameter_id: "18024e69",
                    card_id: questionId,
                    target: ["dimension", ["field-id", REVIEWS.RATING]],
                  },
                ],
              },
            ],
          });
        });

        // NOTE: The actual "Assertion" phase begins here
        cy.log("**Reported failing on Metabase 1.34.3 and 0.36.2**");

        cy.log("**The first case**");
        // set filter values (ratings 5 and 4) directly through the URL
        cy.visit(`/dashboard/${dashboardId}?category=5&category=4`);

        // drill-through
        cy.findByText("xavier").click();
        cy.findByText("=").click();

        cy.findByText("Reviewer is xavier");
        cy.findByText("Rating is equal to 2 selections");
        cy.contains("Reprehenderit non error"); // xavier's review

        cy.log("**The second case**");
        // go back to the dashboard
        cy.visit(`/dashboard/${dashboardId}?category=5&category=4`);
        cy.findByText("2 selections");

        cy.findByText("13062Q").click(); // the card title
        cy.findByText("Rating is equal to 2 selections");
        cy.contains("Ad perspiciatis quis et consectetur."); // 5 star review
      });
    });
  });
});

function createDashboardWithQuestion(
  { dashboardName = "dashboard" } = {},
  callback,
) {
  createQuestion({}, questionId => {
    createDashboard({ dashboardName, questionId }, callback);
  });
}

function createQuestion(options, callback) {
  cy.request("POST", "/api/card", {
    dataset_query: {
      database: 1,
      type: "native",
      native: { query: "select 111 as my_number, 'foo' as my_string" },
    },
    display: "table",
    visualization_settings: {},
    name: "Question",
    collection_id: null,
  }).then(({ body: { id: questionId } }) => {
    callback(questionId);
  });
}

function createDashboard({ dashboardName, questionId }, callback) {
  cy.request("POST", "/api/dashboard", {
    name: dashboardName,
  }).then(({ body: { id: dashboardId } }) => {
    cy.request("PUT", `/api/dashboard/${dashboardId}`, {
      parameters: [
        {
          name: "My Param",
          slug: "my_param",
          id: "e8f79be9",
          type: "category",
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
            sizeX: 6,
            sizeY: 6,
            parameter_mappings: [
              {
                parameter_id: "e8f79be9",
                card_id: questionId,
                target: [
                  "dimension",
                  ["fk->", ["field-id", 11], ["field-id", 22]],
                ],
              },
            ],
          },
        ],
      });

      callback(dashboardId);
    });
  });
}

function setParamValue(paramName, text) {
  // wait to leave editing mode and set a param value
  cy.findByText("You're editing this dashboard.").should("not.exist");
  cy.findByText(paramName).click();
  popover().within(() => {
    cy.findByPlaceholderText("Search by Name").type(text);
    cy.findByText("Add filter").click();
  });
}
