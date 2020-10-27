import {
  signIn,
  restore,
  modal,
  popover,
  selectDashboardFilter,
} from "__support__/cypress";

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
    // go to admin > data model > sample dataset > reviews
    cy.visit("/admin/datamodel/database/1/table/4");

    // Set "Rating" Field type to: "Category" ("Score" is selected by default)
    cy.findByText("Score").click();
    // "Category" is not visible and any other method couldn't find it, including `Popover().contains("Category")`
    cy.get(".ReactVirtualized__Grid")
      .scrollTo("top")
      .contains("Category")
      .click();
    // make sure the field updated before navigating away
    cy.findByText("Category");

    // go straight to simple question > reviews
    cy.visit("/question/new?database=1&table=4");

    // save the question
    cy.findByText("Save").click();
    cy.get(".Modal").within(() => {
      cy.findByText("Save").click();
    });
    // and add it to a new dashboard
    cy.findByText("Yes please!").click();
    cy.findByText("Create a new dashboard").click();
    cy.findByLabelText("Name")
      .click()
      .type("13062");
    cy.findByText("Create").click();

    // make sure we switched to the dashboard in edit mode
    cy.findByText("You're editing this dashboard.");

    // add filter
    cy.get(".Icon-filter").click();
    cy.findByText("Other Categories").click();
    // and link it to the card
    selectDashboardFilter(cy.get(".DashCard"), "Rating");

    // save the dashboard and exit editing mode
    cy.findByText("Save").click();
    cy.findByText("You're editing this dashboard.").should("not.exist");

    // add values to the filter
    cy.findByText("Category").click();
    popover().within(() => {
      cy.findByText("5").click();
      cy.findByText("4").click();
    });
    cy.findByText("Add filter").click();

    // drill-through
    cy.findByText("xavier").click();
    cy.findByText("=").click();

    cy.log("**Reported failing on Metabase 1.34.3 and 0.36.2**");
    cy.findByText("Reviewer is xavier");
    cy.findByText("Rating is equal to 2 selections");
    // wait for data to finish loading
    cy.get(".LoadingSpinner").should("not.exist");

    cy.log("**Test the second case reported in this issue**");
    // go back to the dashboard
    cy.visit("/dashboard/6?category=5&category=4");
    cy.findByText("2 selections");

    cy.findByText("Reviews").click(); // the card title
    cy.findByText("Rating is equal to 2 selections");
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
