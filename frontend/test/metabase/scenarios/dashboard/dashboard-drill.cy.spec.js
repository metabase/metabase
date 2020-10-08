import { signIn, restore, modal, popover } from "__support__/cypress";

describe("scenarios > dashboard > dashboard drill", () => {
  before(restore);
  beforeEach(signIn);

  it("should handle URL click through on a table", () => {
    createDashboardWithQuestion();
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-click").click({ force: true });

    // configure a URL click through on the  "MY_NUMBER" column
    cy.findByText("On-click behavior for each column")
      .parent()
      .parent()
      .within(() => cy.findByText("MY_NUMBER").click());
    cy.findByText("Go to a custom destination").click();
    cy.findByText("URL").click();
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

    // wait to leave editing mode and set a param value
    cy.findByText("You're editing this dashboard.").should("not.exist");
    cy.findByPlaceholderText("My Param").type("param-value{enter}");

    // click value and confirm url updates
    cy.findByText("column value: 111").click();
    cy.location("pathname").should("eq", "/foo/111/param-value");
  });

  it("should handle question click through on a table", () => {
    createDashboardWithQuestion();
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
    cy.findByPlaceholderText("E.x. Details for {{Column Name}}").type(
      "num: {{my_number}}",
      { parseSpecialCharSequences: false },
    );
    cy.findByText("Save").click();

    // wait to leave editing mode and set a param value
    cy.findByText("You're editing this dashboard.").should("not.exist");
    cy.findByPlaceholderText("My Param").type("Widget{enter}");

    // click on table value
    cy.findByText("num: 111").click();

    // show filtered question
    cy.findByText("Orders");
    cy.findByText("User ID is 111");
    cy.findByText("Category is Widget");
    cy.findByText("Showing 5 rows");
  });

  // TODO: fix flake - blocking the merge of metabase#13401
  it.skip("should handle cross-filter on a table", () => {
    createDashboardWithQuestion();
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
      .find("input")
      .should("have.value", "foo");
  });
});

function createDashboardWithQuestion() {
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
    cy.request("POST", "/api/dashboard", {
      name: "dashboard",
    }).then(({ body: { id: dashboardId } }) => {
      cy.request("PUT", `/api/dashboard/${dashboardId}`, {
        name: "dashboard",
        description: null,
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
            },
          ],
        });

        cy.visit(`/dashboard/${dashboardId}`);
      });
    });
  });
}
