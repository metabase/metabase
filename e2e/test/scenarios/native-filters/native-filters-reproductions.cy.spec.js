import { USER_GROUPS, SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  openNativeEditor,
  moveDnDKitElement,
  filterWidget,
  popover,
  visitQuestionAdhoc,
  visitQuestion,
  openPublicLinkPopoverFromMenu,
  queryBuilderMain,
  visitDashboard,
  getDashboardCard,
} from "e2e/support/helpers";

import * as FieldFilter from "./helpers/e2e-field-filter-helpers";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

const { ORDERS, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const { COLLECTION_GROUP } = USER_GROUPS;

function runQuery() {
  cy.findByTestId("qb-header").within(() => {
    cy.icon("play").click();
  });

  cy.wait("@cardQuery");
}

describe("issue 9357", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should reorder template tags by drag and drop (metabase#9357)", () => {
    openNativeEditor();
    SQLFilter.enterParameterizedQuery(
      "{{firstparameter}} {{nextparameter}} {{lastparameter}}",
    );

    // Drag the firstparameter to last position
    moveDnDKitElement(cy.get("fieldset").findAllByRole("listitem").first(), {
      horizontal: 430,
    });

    // Ensure they're in the right order
    cy.findAllByText("Variable name").parent().as("variableField");

    cy.get("@variableField").first().findByText("nextparameter");

    cy.get("@variableField").eq(1).findByText("firstparameter");
  });
});

describe("issue 11480", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("should clear a template tag's default value when the type changes (metabase#11480)", () => {
    openNativeEditor();
    // Parameter `x` defaults to a text parameter.
    SQLFilter.enterParameterizedQuery(
      "select * from orders where total = {{x}}",
    );

    // Mark field as required and add a default text value.
    SQLFilter.toggleRequired();
    SQLFilter.setDefaultValue("some text");
    cy.location("search").should("eq", "?x=some%20text");

    // Run the query and see an error.
    SQLFilter.runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains('Data conversion error converting "some text"');

    // Oh wait! That doesn't match the total column, so we'll change the parameter to a number.
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Number");
    cy.location("search").should("eq", "?x=");

    // Although there's no default, we should be still able to run the query.
    cy.findByTestId("native-query-editor-sidebar")
      .button("Get Answer")
      .should("not.be.disabled");
  });
});

describe("issue 11580", () => {
  function assertVariablesOrder() {
    cy.get("@variableLabels").first().should("have.text", "foo");
    cy.get("@variableLabels").last().should("have.text", "bar");
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shouldn't reorder template tags when updated (metabase#11580)", () => {
    openNativeEditor();
    SQLFilter.enterParameterizedQuery("{{foo}} {{bar}}");

    cy.findAllByText("Variable name").next().as("variableLabels");

    // ensure they're in the right order to start
    assertVariablesOrder();

    // change the parameter to a number.
    cy.findAllByTestId("variable-type-select")
      .first()
      .as("variableType")
      .click();
    SQLFilter.chooseType("Number");

    cy.get("@variableType").should("have.value", "Number");

    // ensure they're still in the right order
    assertVariablesOrder();
  });
});

describe("issue 12228", () => {
  const filter = {
    id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
    name: "created_at",
    "display-name": "Created at",
    type: "dimension",
    dimension: ["field", ORDERS.CREATED_AT, null],
    "widget-type": "date/month-year",
  };

  const nativeQuery = {
    name: "12228",
    native: {
      query: "select count(*) from orders where {{created_at}}",
      "template-tags": {
        created_at: filter,
      },
    },
    display: "scalar",
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("can load a question with a date filter (metabase#12228)", () => {
    cy.createNativeQuestion(nativeQuery).then(({ body: { id } }) => {
      cy.visit(`/question/${id}?created_at=2026-01`);
      cy.contains("580");
    });
  });
});

describe("issue 12581", () => {
  const ORIGINAL_QUERY = "SELECT * FROM ORDERS WHERE {{filter}} LIMIT 2";

  const filter = {
    id: "a3b95feb-b6d2-33b6-660b-bb656f59b1d7",
    name: "filter",
    "display-name": "Filter",
    type: "dimension",
    dimension: ["field", ORDERS.CREATED_AT, null],
    "widget-type": "date/month-year",
    default: null,
  };

  const nativeQuery = {
    name: "12581",
    native: {
      query: ORIGINAL_QUERY,
      "template-tags": {
        filter,
      },
    },
  };

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(nativeQuery, { visitQuestion: true });
  });

  it("should correctly display a revision state after a restore (metabase#12581)", () => {
    // Start with the original version of the question made with API
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open Editor/i).click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open Editor/i).should("not.exist");

    // Both delay and a repeated sequence of `{selectall}{backspace}` are there to prevent typing flakes
    // Without them at least 1 in 10 test runs locally didn't fully clear the field or type correctly
    cy.get(".ace_content")
      .as("editor")
      .click()
      .type("{selectall}{backspace}", { delay: 50 });
    cy.get("@editor").click().type("{selectall}{backspace}SELECT 1");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });

    cy.reload();
    cy.wait("@cardQuery");

    cy.findByTestId("revision-history-button").click();
    // Make sure sidebar opened and the history loaded
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/You created this/i);

    cy.findByTestId("question-revert-button").click(); // Revert to the first revision
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/You reverted to an earlier version/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open Editor/i).click();

    cy.log("Reported failing on v0.35.3");
    cy.get("@editor").should("be.visible").and("contain", ORIGINAL_QUERY);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("37.65");

    // Filter dropdown field
    filterWidget().contains("Filter");
  });
});

describe.skip("issue 13961", () => {
  const categoryFilter = {
    id: "00315d5e-4a41-99da-1a41-e5254dacff9d",
    name: "category",
    "display-name": "Category",
    type: "dimension",
    default: "Doohickey",
    dimension: ["field", PRODUCTS.CATEGORY, null],
    "widget-type": "category",
  };

  const productIdFilter = {
    id: "4775bccc-e82a-4069-fc6b-2acc90aadb8b",
    name: "prodid",
    "display-name": "ProdId",
    type: "number",
    default: null,
  };

  const nativeQuery = {
    name: "13961",
    native: {
      query:
        "SELECT * FROM PRODUCTS WHERE 1=1 AND {{category}} [[AND ID={{prodid}}]]",
      "template-tags": {
        category: categoryFilter,
        prodid: productIdFilter,
      },
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(nativeQuery, { visitQuestion: true });
  });

  it("should clear default filter value in native questions (metabase#13961)", () => {
    cy.findAllByText("Small Marble Shoes"); // Product ID 2, Doohickey

    cy.location("search").should("eq", "?category=Doohickey");

    // Remove default filter (category)
    cy.get("fieldset .Icon-close").click();

    cy.icon("play").first().should("be.visible").as("rerunQuestion").click();
    cy.wait("@cardQuery");

    cy.url().should("not.include", "?category=Doohickey");

    // Add value `1` to the ID filter
    cy.findByPlaceholderText(productIdFilter["display-name"]).type("1");

    cy.get("@rerunQuestion").click();
    cy.wait("@cardQuery");

    cy.log("Reported tested and failing on v0.34.3 through v0.37.3");
    cy.log("URL is correct at this point, but there are no results");

    cy.location("search").should("eq", `?${productIdFilter.name}=1`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rustic Paper Wallet"); // Product ID 1, Gizmo
  });
});

describe("issue 14302", () => {
  const priceFilter = {
    id: "39b51ccd-47a7-9df6-a1c5-371918352c79",
    name: "PRICE",
    "display-name": "Price",
    type: "number",
    default: "10",
    required: true,
  };

  const nativeQuery = {
    name: "14302",
    native: {
      query:
        'SELECT "CATEGORY", COUNT(*)\nFROM "PRODUCTS"\nWHERE "PRICE" > {{PRICE}}\nGROUP BY "CATEGORY"',
      "template-tags": {
        PRICE: priceFilter,
      },
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(nativeQuery, { visitQuestion: true });
  });

  it("should not make the question dirty when there are no changes (metabase#14302)", () => {
    cy.log("Reported on v0.37.5 - Regression since v0.37.0");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").should("not.exist");
  });
});

["nodata+nosql", "nosql"].forEach(test => {
  describe("issue 15163", () => {
    const nativeFilter = {
      id: "dd7f3e66-b659-7d1c-87b3-ab627317581c",
      name: "cat",
      "display-name": "Cat",
      type: "dimension",
      dimension: ["field-id", PRODUCTS.CATEGORY],
      "widget-type": "category",
      default: null,
    };

    const nativeQuery = {
      name: "15163",
      native: {
        query: 'SELECT COUNT(*) FROM "PRODUCTS" WHERE {{cat}}',
        "template-tags": {
          cat: nativeFilter,
        },
      },
    };

    const dashboardFilter = {
      name: "Category",
      slug: "category",
      id: "fd723065",
      type: "category",
    };

    const dashboardDetails = {
      parameters: [dashboardFilter],
    };

    beforeEach(() => {
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");

      restore();
      cy.signInAsAdmin();

      cy.createNativeQuestionAndDashboard({
        questionDetails: nativeQuery,
        dashboardDetails,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        // Connect filter to the dashboard card
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 13,
              size_y: 8,
              series: [],
              visualization_settings: {
                "card.title": "New Title",
              },
              parameter_mappings: [
                {
                  parameter_id: dashboardFilter.id,
                  card_id,
                  target: ["dimension", ["template-tag", "cat"]],
                },
              ],
            },
          ],
        });

        if (test === "nosql") {
          cy.updatePermissionsGraph({
            [COLLECTION_GROUP]: {
              1: {
                "view-data": "unrestricted",
                "create-queries": "query-builder",
              },
            },
          });
        }

        cy.signIn("nodata");

        // Visit dashboard and set the filter through URL
        cy.visit(`/dashboard/${dashboard_id}?category=Gizmo`);
      });
    });

    it(`${test.toUpperCase()} version:\n should be able to view SQL question when accessing via dashboard with filters connected to modified card without SQL permissions (metabase#15163)`, () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New Title").click();

      cy.wait("@cardQuery", { timeout: 5000 }).then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });

      cy.get(".ace_content").should("not.be.visible");
      cy.get("[data-testid=cell-data]").should("contain", "51");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 1 row");
    });
  });
});

describe("issue 15444", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should run with the default field filter set (metabase#15444)", () => {
    openNativeEditor();
    SQLFilter.enterParameterizedQuery(
      "select * from products where {{category}}",
    );

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    FieldFilter.mapTo({
      table: "Products",
      field: "Category",
    });

    SQLFilter.toggleRequired();

    FieldFilter.openEntryForm({ isFilterRequired: true });
    // We could've used `FieldFilter.addDefaultStringFilter("Doohickey")` but that's been covered already in the filter test matrix.
    // This flow tests the ability to pick the filter from a dropdown when there are not too many results (easy to choose from).
    popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    SQLFilter.runQuery();

    cy.findByTestId("query-visualization-root").within(() => {
      cy.findAllByText("Doohickey");
      cy.findAllByText("Gizmo").should("not.exist");
    });
  });
});

describe("issue 15460", () => {
  const filter = {
    id: "d98c3875-e0f1-9270-d36a-5b729eef938e",
    name: "category",
    "display-name": "Category",
    type: "dimension",
    dimension: ["field", PRODUCTS.CATEGORY, null],
    "widget-type": "category",
    default: null,
  };

  const questionQuery = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      native: {
        query:
          "select p.created_at, products.category\nfrom products\nleft join products p on p.id=products.id\nwhere {{category}}\n",
        "template-tags": {
          category: filter,
        },
      },
      type: "native",
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionQuery);
  });

  it("should be possible to use field filter on a query with joins where tables have similar columns (metabase#15460)", () => {
    // Set the filter value by picking the value from the dropdown
    filterWidget().contains(filter["display-name"]).click();

    popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    SQLFilter.runQuery();

    cy.findByTestId("query-visualization-root").within(() => {
      cy.findAllByText("Doohickey");
      cy.findAllByText("Gizmo").should("not.exist");
    });
  });
});

describe("issue 15700", () => {
  const widgetType = "String is not";
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to select 'Field Filter' category in native query (metabase#15700)", () => {
    openNativeEditor();
    SQLFilter.enterParameterizedQuery("{{filter}}");

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    FieldFilter.mapTo({
      table: "Products",
      field: "Category",
    });

    FieldFilter.setWidgetType(widgetType);
  });
});

describe("issue 15981", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openNativeEditor();

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it('"Text" filter should work (metabase#15981-1)', () => {
    SQLFilter.enterParameterizedQuery(
      "select * from PRODUCTS where CATEGORY = {{text_filter}}",
    );

    SQLFilter.setWidgetValue("Gizmo");

    SQLFilter.runQuery();

    cy.findByTestId("query-visualization-root").contains("Rustic Paper Wallet");

    cy.icon("contract").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 51 rows");
    cy.icon("play").should("not.exist");
  });

  it('"Number" filter should work (metabase#15981-2)', () => {
    SQLFilter.enterParameterizedQuery(
      "select * from ORDERS where QUANTITY = {{number_filter}}",
    );

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Number");

    SQLFilter.setWidgetValue("20");

    SQLFilter.runQuery();

    cy.findByTestId("query-visualization-root").contains("23.54");
  });
});

describe("issue 16739", () => {
  const filter = {
    id: "7795c137-a46c-3db9-1930-1d690c8dbc03",
    name: "filter",
    "display-name": "Filter",
    type: "dimension",
    dimension: ["field", PRODUCTS.CATEGORY, null],
    "widget-type": "string/=",
    default: null,
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  ["normal", "nodata"].forEach(user => {
    //Very related to the metabase#15981, only this time the issue happens with the "Field Filter" without the value being set.
    it(`filter feature flag shouldn't cause run-overlay of results in native editor for ${user} user (metabase#16739)`, () => {
      cy.createNativeQuestion({
        native: {
          query: "select * from PRODUCTS where {{ filter }}",
          "template-tags": { filter },
        },
      }).then(({ body: { id } }) => {
        if (user === "nodata") {
          cy.signOut();
          cy.signIn(user);
        }

        visitQuestion(id);
      });

      cy.icon("play").should("not.exist");
    });
  });
});

describe("issue 16756", () => {
  const questionDetails = {
    name: "16756",
    native: {
      query: "select * from PRODUCTS where {{filter}}",
      "template-tags": {
        filter: {
          id: "d3643bc3-a8f3-e015-8c83-d2ea50bfdf22",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          dimension: ["field", PRODUCTS.CREATED_AT, null],
          "widget-type": "date/range",
          default: null,
        },
      },
    },
  };
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.intercept("POST", `/api/card/**/${id}/query`).as("cardQuery");

      cy.visit(`/question/${id}?filter=2024-03-31~2025-03-31`);

      cy.wait("@cardQuery");
    });
  });

  it("should allow switching between date filter types (metabase#16756)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open editor/i).click();
    cy.icon("variable").click();

    // Update the filter widget type
    cy.findByTestId("sidebar-right").findByDisplayValue("Date Range").click();

    popover().contains("Single Date").click();

    // The previous filter value should reset
    cy.location("search").should("eq", "?filter=");

    cy.log("Set the date to the 15th of October 2023");
    cy.clock(new Date("2023-10-31"), ["Date"]);
    filterWidget().click();

    popover().contains("15").click();

    cy.button("Add filter").click();

    SQLFilter.runQuery();

    // We expect "No results"
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No results!");
  });
});

describe("issue 17019", () => {
  const question = {
    name: "17019",
    native: {
      query: "select {{foo}}",
      "template-tags": {
        foo: {
          id: "08edf340-3d89-cfb1-b7f0-073b9eca6a32",
          name: "foo",
          "display-name": "Filter",
          type: "text",
        },
      },
    },
    display: "scalar",
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(question).then(({ body: { id } }) => {
      // Enable sharing
      cy.request("POST", `/api/card/${id}/public_link`);

      visitQuestion(id);
    });
  });

  it("question filters should work for embedding/public sharing scenario (metabase#17019)", () => {
    openPublicLinkPopoverFromMenu();

    cy.findByTestId("public-link-popover-content")
      .findByTestId("public-link-input")
      .invoke("val")
      .then(publicLink => {
        cy.visit(publicLink);
      });

    cy.findByPlaceholderText("Filter").type("456{enter}");

    // We should see the result as a scalar
    cy.findByTestId("scalar-value").contains("456");
    // But let's also check that the filter widget has that same value still displayed
    cy.findByDisplayValue("456");
  });
});

describe("issue 17490", () => {
  function mockDatabaseTables() {
    cy.intercept("GET", "/api/database?include=tables", req => {
      req.reply(res => {
        const mockTables = new Array(7).fill({
          id: 42, // id is hard coded, but it doesn't matter for this repro
          db_id: 1,
          name: "Z",
          display_name: "ZZZ",
          schema: "PUBLIC",
        });

        res.body.data = res.body.data.map(d => ({
          ...d,
          tables: [...d.tables, ...mockTables],
        }));
      });
    });
  }
  beforeEach(() => {
    mockDatabaseTables();

    restore();
    cy.signInAsAdmin();
  });

  it.skip("nav bar shouldn't cut off the popover with the tables for field filter selection (metabase#17490)", () => {
    openNativeEditor();
    SQLFilter.enterParameterizedQuery("{{f}}");

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    /**
     * Although `.click()` isn't neccessary for Cypress to fill out this input field,
     * it's something that we can use to assert that the input field is covered by another element.
     * Cypress fails to click any element that is not "actionable" (for example - when it's covered).
     * In other words, the `.click()` part is essential for this repro to work. Don't remove it.
     */
    cy.findByPlaceholderText("Find...").click().type("Orders").blur();

    cy.findByDisplayValue("Orders");
  });
});

describe("issue 21160", () => {
  const filterName = "Number comma";

  const questionDetails = {
    native: {
      query: "select count(*) from orders where user_id in ({{number_comma}})",
      "template-tags": {
        number_comma: {
          id: "d8870111-7b0f-26f2-81ce-6ec911e54048",
          name: "number_comma",
          "display-name": filterName,
          type: "number",
        },
      },
    },
    display: "scalar",
  };

  function resultAssertion(res) {
    cy.findByTestId("scalar-value").invoke("text").should("eq", res);
  }

  function getInput() {
    return cy.findByPlaceholderText(filterName);
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("number filter should work with values separated by comma (metabase#21160)", () => {
    getInput().type("1,2,3{enter}", { delay: 0 });

    runQuery();
    resultAssertion("21");

    getInput().clear().type("123,456,789,321{enter}");

    runQuery();
    resultAssertion("18");
  });
});

describe("issue 21246", () => {
  const questionDetails = {
    query: { "source-table": PRODUCTS_ID },
  };
  function resultAssertion(res) {
    cy.findByTestId("scalar-value").invoke("text").should("eq", res);
  }
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      const cardTagName = "#" + id;

      const nativeQuestionDetails = {
        native: {
          query: `with exclude_products as {{${cardTagName}}}\nselect count(*) from orders where true [[and {{filter}}]] [[and orders.created_at::date={{datevariable}}]]`,
          "template-tags": {
            filter: {
              id: "e1c37b07-7a85-1df9-a5e4-a0bf748e6dcf",
              name: "filter",
              "display-name": "Field Filter",
              type: "dimension",
              dimension: ["field", ORDERS.CREATED_AT, null],
              "widget-type": "date/month-year",
              default: null,
            },
            datevariable: {
              id: "d4a5fc2d-b223-a5ec-9436-bf6ea5e6b8bf",
              name: "datevariable",
              "display-name": "Date Variable",
              type: "date",
              default: null,
            },
            [cardTagName]: {
              id: "3a0be5e9-e46f-f34f-8e1b-f91567ca4317",
              name: cardTagName,
              "display-name": cardTagName,
              type: "card",
              "card-id": id,
            },
          },
        },
        display: "scalar",
      };

      cy.createNativeQuestion(nativeQuestionDetails, {
        wrapId: true,
      });

      cy.get("@questionId").then(id => {
        cy.visit(`/question/${id}`);
        cy.wait("@dataset");

        cy.findByTestId("scalar-value").invoke("text").should("eq", "18,760");
      });
    });
  });

  it("should be able to use sub-query referencing a GUI question and date based filters (metabase#21246)", () => {
    const fieldFilterValue = "filter=2024-02";
    const dateFilterValue = "datevariable=2024-02-19";

    cy.get("@questionId").then(id => {
      // Let's set filter values directly through URL, rather than through the UI
      // for the sake of speed and reliability
      cy.visit(`/question/${id}?${fieldFilterValue}`);
      cy.wait("@dataset");

      resultAssertion("404");

      cy.visit(`/question/${id}?${fieldFilterValue}&${dateFilterValue}`);
      cy.wait("@dataset");

      resultAssertion("12");
    });
  });
});

describe("issue 27257", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    openNativeEditor();
    SQLFilter.enterParameterizedQuery("SELECT {{number}}");

    filterWidget().within(() => {
      cy.icon("string");
    });

    cy.findByTestId("variable-type-select").click();
    popover().contains("Number").click();

    filterWidget().within(() => {
      cy.icon("number");
      cy.findByPlaceholderText("Number").type("0").blur();
      cy.findByDisplayValue("0");
    });

    SQLFilter.runQuery();

    cy.findByTestId("scalar-value").invoke("text").should("eq", "0");
  });

  it("should not drop numeric filter widget value on refresh even if it's zero (metabase#27257)", () => {
    cy.reload();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Here's where your results will appear");
    cy.findByDisplayValue("0");
  });
});

describe("issue 29786", { tags: "@external" }, () => {
  const SQL_QUERY = "SELECT * FROM PRODUCTS WHERE {{f1}} AND {{f2}}";
  beforeEach(() => {
    restore("mysql-8");
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.signInAsAdmin();
  });

  it("should allow using field filters with null schema (metabase#29786)", () => {
    openNativeEditor({ databaseName: "QA MySQL8" });
    SQLFilter.enterParameterizedQuery(SQL_QUERY);

    cy.findAllByTestId("variable-type-select").first().click();
    SQLFilter.chooseType("Field Filter");
    FieldFilter.mapTo({ table: "Products", field: "Category" });
    cy.findAllByTestId("variable-type-select").last().click();
    SQLFilter.chooseType("Field Filter");
    FieldFilter.mapTo({ table: "Products", field: "Vendor" });

    filterWidget().first().click();
    FieldFilter.addWidgetStringFilter("Widget");
    filterWidget().last().click();
    FieldFilter.addWidgetStringFilter("Von-Gulgowski");

    SQLFilter.runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1087115303928").should("be.visible");
  });
});

describe("issue 31606", { tags: "@external" }, () => {
  const SQL_QUERY = "SELECT * FROM PRODUCTS WHERE CATEGORY = {{test}}";
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("should clear values on UI for Text, Number, Date and Field Filter Types (metabase#31606)", () => {
    openNativeEditor();

    SQLFilter.enterParameterizedQuery(SQL_QUERY);

    // Text
    SQLFilter.setWidgetValue("Gizmo");
    SQLFilter.runQuery();

    queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("not.exist");

    filterWidget().findByRole("textbox").clear();

    SQLFilter.runQuery();
    queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("be.visible");

    filterWidget().within(() => {
      cy.icon("close").should("not.exist");
    });

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Number");
    SQLFilter.setWidgetValue("123");

    SQLFilter.runQuery();

    queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("not.exist");

    filterWidget().findByRole("textbox").clear();
    SQLFilter.runQuery();
    queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("be.visible");

    filterWidget().within(() => {
      cy.icon("close").should("not.exist");
    });

    // Field Filter - Default value
    SQLFilter.openTypePickerFromSelectedFilterType("Number");
    SQLFilter.chooseType("Field Filter");

    FieldFilter.mapTo({
      table: "Products",
      field: "ID",
    });

    cy.findByTestId("filter-widget-type-select")
      .should("have.value", "ID")
      .should("be.disabled");

    FieldFilter.openEntryForm({ isFilterRequired: true });
    FieldFilter.addDefaultStringFilter("2");

    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("Enter a default value…").should("not.exist");
      cy.findByText("Default filter widget value")
        .next()
        .find("a")
        .first()
        .click();
    });

    popover().within(() => {
      cy.icon("close").click();
      cy.findByText("Update filter").click();
    });
    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("Enter a default value…").should("be.visible");
    });

    // Field Filter
    SQLFilter.setWidgetValue("23");
    popover().findByText("Add filter").click();

    filterWidget().within(() => {
      cy.icon("close").should("be.visible");
    });

    SQLFilter.runQuery();
    queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("not.exist");

    filterWidget().click();

    popover().within(() => {
      cy.icon("close").click();
      cy.findByText("Update filter").click();
    });

    filterWidget().within(() => {
      cy.icon("close").should("not.exist");
    });
  });
});

describe("issue 34129", () => {
  const parameter = {
    name: "Relative Date",
    slug: "relative_date",
    id: "3952592",
    type: "date/relative",
    sectionId: "date",
  };

  const templateTag = {
    type: "dimension",
    name: "time",
    id: "301a329f-5a83-40df-898b-236078025cbe",
    "display-name": "Time",
    dimension: ["field", ORDERS.CREATED_AT, null],
    "widget-type": "date/month-year",
  };

  const questionDetails = {
    name: "issue 34129",
    native: {
      query:
        "select min(CREATED_AT), max(CREATED_AT), count(*) from ORDERS where {{ time }}",
      "template-tags": {
        [templateTag.name]: templateTag,
      },
    },
  };

  const dashboardDetails = {
    parameters: [parameter],
  };

  const getParameterMapping = (cardId, parameterId) => ({
    card_id: cardId,
    parameter_id: parameterId,
    target: ["dimension", ["template-tag", templateTag.name]],
  });

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("/api/card/*/query").as("cardQuery");
    cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should support mismatching date filter parameter values when navigating from a dashboard (metabase#34129)", () => {
    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: card }) => {
      const { card_id, dashboard_id } = card;
      const mapping = getParameterMapping(card_id, parameter.id);
      cy.editDashboardCard(card, { parameter_mappings: [mapping] });
      visitDashboard(dashboard_id);
      cy.wait("@dashcardQuery");
    });

    filterWidget().click();
    popover().findByText("Today").click();
    cy.wait("@dashcardQuery");

    getDashboardCard().findByText(questionDetails.name).click();
    cy.wait("@cardQuery");

    filterWidget().findByText("Today").should("exist");
  });
});

describe("issue 31606", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not start drag and drop from clicks on popovers", () => {
    openNativeEditor();

    SQLFilter.enterParameterizedQuery("{{foo}} {{bar}}");

    cy.findAllByRole("radio", { name: "Search box" }).first().click();
    filterWidget().first().click();

    moveDnDKitElement(popover().findByText("Add filter"), {
      horizontal: 300,
    });

    filterWidget()
      .should("have.length", 2)
      .first()
      .should("contain.text", "Foo");
  });
});
