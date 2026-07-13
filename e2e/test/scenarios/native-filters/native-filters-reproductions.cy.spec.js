const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import * as FieldFilter from "./helpers/e2e-field-filter-helpers";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

const { ORDERS, PRODUCTS } = SAMPLE_DATABASE;

const { COLLECTION_GROUP } = USER_GROUPS;

describe("issue 9357", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it(
    "should reorder template tags by drag and drop (metabase#9357)",
    { viewportWidth: 800, viewportHeight: 600 },
    () => {
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery(
        "{{firstparameter}} {{nextparameter}} {{lastparameter}}",
      );

      // Drag the firstparameter to last position
      H.filterWidget().findAllByRole("listitem").first().as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", {
        vertical: 50,
        useMouseEvents: true,
      });

      // Ensure they're in the right order
      cy.findAllByText("Variable name").parent().as("variableField");

      cy.get("@variableField").first().findByText("nextparameter");

      cy.get("@variableField").eq(1).findByText("firstparameter");
    },
  );
});

describe("issue 11480", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();
  });

  it("should clear a template tag's default value when the type changes (metabase#11480)", () => {
    H.startNewNativeQuestion();
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
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains('Data conversion error converting "some text"');

    // Oh wait! That doesn't match the total column, so we'll change the parameter to a number.
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Number");
    cy.location("search").should("eq", "?x=");

    // Although there's no default, we should be still able to run the query.
    SQLFilter.getRunQueryButton().should("not.be.disabled");
  });
});

describe("issue 11580", () => {
  function assertVariablesOrder() {
    cy.get("@variableLabels").first().should("have.text", "foo");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.get("@variableLabels").last().should("have.text", "bar");
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shouldn't reorder template tags when updated (metabase#11580)", () => {
    H.startNewNativeQuestion();
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

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(nativeQuery, { visitQuestion: true });
  });

  it("should correctly display a revision state after a restore (metabase#12581)", () => {
    // Start with the original version of the question made with API
    cy.findByTestId("visibility-toggler")
      .findByText(/open editor/i)
      .click();
    cy.findByTestId("visibility-toggler")
      .findByText(/open editor/i)
      .should("not.exist");

    // Both delay and a repeated sequence of `{selectall}{backspace}` are there to prevent typing flakes
    // Without them at least 1 in 10 test runs locally didn't fully clear the field or type correctly
    H.NativeEditor.clear().type("SELECT 1");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.findByTestId("save-question-modal").within((modal) => {
      cy.findByText("Save").click();
    });

    cy.reload();
    cy.wait("@cardQuery");

    cy.findByTestId("revision-history-button").click();
    H.sidesheet().within(() => {
      cy.findByRole("tab", { name: "History" }).click();
      // Make sure sidebar opened and the history loaded
      cy.findByText(/You created this/i);

      cy.findByTestId("question-revert-button").click(); // Revert to the first revision
    });

    // Reverting reloads the question, which re-runs its query and resets the
    // info sidesheet to the Overview tab. Wait for that reload to settle before
    // re-reading the History tab, otherwise the tab switch races the reset.
    cy.wait("@cardQuery");

    H.sidesheet().within(() => {
      cy.findByRole("tab", { name: "History" }).click();
      cy.findByText(/You reverted to an earlier version/i);
    });

    cy.findByLabelText("Close").click();

    cy.findByTestId("visibility-toggler")
      .findByText(/open editor/i)
      .click();

    cy.log("Reported failing on v0.35.3");
    H.NativeEditor.get().should("be.visible").and("contain", ORIGINAL_QUERY);

    H.tableInteractive().findByText("37.65");

    // Filter dropdown field
    H.filterWidget().contains("Filter");
  });
});

describe("issue 13961", { tags: "@skip" }, () => {
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
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(nativeQuery, { visitQuestion: true });
  });

  it("should clear default filter value in native questions (metabase#13961)", () => {
    cy.findAllByText("Small Marble Shoes"); // Product ID 2, Doohickey

    cy.location("search").should("eq", "?category=Doohickey");

    // Remove default filter (category)
    H.filterWidget().findByRole("button").click();

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
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(nativeQuery, { visitQuestion: true });
  });

  it("should not make the question dirty when there are no changes (metabase#14302)", () => {
    cy.log("Reported on v0.37.5 - Regression since v0.37.0");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").should("not.exist");
  });
});

["nodata+nosql", "nosql"].forEach((test) => {
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

      H.restore();
      cy.signInAsAdmin();

      H.createNativeQuestionAndDashboard({
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New Title").click();

      cy.wait("@cardQuery", { timeout: 5000 }).then((xhr) => {
        expect(xhr.response.body.error).not.to.exist;
      });

      H.NativeEditor.get().should("not.exist");
      cy.get("[data-testid=cell-data]").should("contain", "51");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 1 row");
    });
  });
});

describe("issue 15700", () => {
  const widgetType = "String is not";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be able to select 'Field Filter' category in native query (metabase#15700)", () => {
    H.startNewNativeQuestion();
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
    H.restore();
    cy.signInAsAdmin();

    H.startNewNativeQuestion();

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
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
    H.restore();
    cy.signInAsAdmin();
  });

  ["normal", "nodata"].forEach((user) => {
    //Very related to the metabase#15981, only this time the issue happens with the "Field Filter" without the value being set.
    it(`filter feature flag shouldn't cause run-overlay of results in native editor for ${user} user (metabase#16739)`, () => {
      H.createNativeQuestion({
        native: {
          query: "select * from PRODUCTS where {{ filter }}",
          "template-tags": { filter },
        },
      }).then(({ body: { id } }) => {
        if (user === "nodata") {
          cy.signOut();
          cy.signIn(user);
        }

        H.visitQuestion(id);
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

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.intercept("POST", `/api/card/**/${id}/query`).as("cardQuery");

      cy.visit(`/question/${id}?filter=2027-03-31~2028-03-31`);

      cy.wait("@cardQuery");
    });
  });

  it("should allow switching between date filter types (metabase#16756)", () => {
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open editor/i).click();
    cy.icon("variable").click();

    // Update the filter widget type
    cy.findByTestId("sidebar-right").findByDisplayValue("Date Range").click();

    H.popover().contains("Single Date").click();

    // The previous filter value should reset
    cy.location("search").should("eq", "?filter=");

    cy.log("Set the date to the 15th of October 2026");
    cy.clock(new Date("2026-10-31"), ["Date"]);
    H.filterWidget().click();

    H.popover().contains("15").click();

    cy.button("Add filter").click();

    SQLFilter.runQuery();

    // We expect "No results"
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No results");
  });
});

describe("issue 17490", () => {
  function mockDatabaseTables() {
    cy.intercept("GET", "/api/database?include=tables", (req) => {
      req.reply((res) => {
        const mockTables = new Array(7).fill({
          id: 42, // id is hard coded, but it doesn't matter for this repro
          db_id: 1,
          name: "Z",
          display_name: "ZZZ",
          schema: "PUBLIC",
        });

        res.body.data = res.body.data.map((d) => ({
          ...d,
          tables: [...d.tables, ...mockTables],
        }));
      });
    });
  }

  beforeEach(() => {
    mockDatabaseTables();

    H.restore();
    cy.signInAsAdmin();
  });
});

describe("issue 27257", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();

    H.startNewNativeQuestion();
    SQLFilter.enterParameterizedQuery("SELECT {{number}}");

    H.filterWidget().within(() => {
      cy.icon("string");
    });

    cy.findByTestId("variable-type-select").click();
    H.popover().contains("Number").click();

    H.filterWidget().within(() => {
      cy.icon("number");
      cy.findByPlaceholderText("Number").type("0").blur();
      cy.findByDisplayValue("0");
    });

    SQLFilter.runQuery();

    cy.findByTestId("scalar-value").invoke("text").should("eq", "0");
  });

  it("should not drop numeric filter widget value on refresh even if it's zero (metabase#27257)", () => {
    cy.reload();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Here's where your results will appear");
    cy.findByDisplayValue("0");
  });
});

describe("issue 31606", { tags: "@external" }, () => {
  const SQL_QUERY = "SELECT * FROM PRODUCTS WHERE CATEGORY = {{test}}";

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();
  });

  it("should clear values on UI for Text, Number, Date and Field Filter Types (metabase#31606)", () => {
    H.startNewNativeQuestion();

    SQLFilter.enterParameterizedQuery(SQL_QUERY);

    // Text
    SQLFilter.setWidgetValue("Gizmo");
    SQLFilter.runQuery();

    H.queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("not.exist");

    H.filterWidget().findByRole("textbox").clear();

    SQLFilter.runQuery();
    H.queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("be.visible");

    H.filterWidget().within(() => {
      cy.icon("close").should("not.exist");
    });

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Number");
    SQLFilter.setWidgetValue("123");

    SQLFilter.runQuery();

    H.queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("not.exist");

    H.filterWidget().findByRole("textbox").clear();
    SQLFilter.runQuery();
    H.queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("be.visible");

    H.filterWidget().within(() => {
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

    FieldFilter.addDefaultStringFilter("2", "Add filter");

    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("Enter a default value…").should("not.exist");
      cy.findByText("Default filter widget value")
        .next()
        .find("div")
        .first()
        .click();
    });

    H.popover().within(() => {
      H.removeFieldValuesValue(0);
      cy.findByText("Update filter").click();
    });
    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("Enter a default value…").should("be.visible");
    });

    // Field Filter
    H.filterWidget().click();
    H.popover().findByPlaceholderText("Enter an ID").type("23");
    H.popover().findByText("Add filter").click();

    H.filterWidget().within(() => {
      cy.icon("close").should("be.visible");
    });

    SQLFilter.runQuery();
    H.queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("not.exist");

    H.filterWidget().click();

    H.popover().within(() => {
      H.removeFieldValuesValue(0);
      cy.findByText("Update filter").click();
    });

    H.filterWidget().within(() => {
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
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("/api/card/*/query").as("cardQuery");
    cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should support mismatching date filter parameter values when navigating from a dashboard (metabase#34129)", () => {
    H.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: card }) => {
      const { card_id, dashboard_id } = card;
      const mapping = getParameterMapping(card_id, parameter.id);
      H.editDashboardCard(card, { parameter_mappings: [mapping] });
      H.visitDashboard(dashboard_id);
      cy.wait("@dashcardQuery");
    });

    H.filterWidget().click();
    H.popover().findByText("Today").click();
    cy.wait("@dashcardQuery");

    H.getDashboardCard().findByText(questionDetails.name).click();
    cy.wait("@cardQuery");

    H.filterWidget().findByText("Today").should("exist");
  });
});

describe("issue 31606", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not start drag and drop from clicks on popovers", () => {
    H.startNewNativeQuestion();

    SQLFilter.enterParameterizedQuery("{{foo}} {{bar}}");

    cy.findAllByRole("radio", { name: "Search box" }).first().click();
    H.filterWidget().first().click();

    H.popover().findByText("Add filter").as("dragElement");
    H.moveDnDKitElementByAlias("@dragElement", {
      horizontal: 300,
    });

    H.filterWidget()
      .should("have.length", 2)
      .first()
      .should("contain.text", "Foo");
  });
});

describe("issue 49577", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not show the values initially when using a single select search box (metabase#49577)", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from {{param");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.sidebar()
      .last()
      .within(() => {
        cy.findByText("Search box").click();
        cy.findByText("Edit").click();
      });

    H.modal().within(() => {
      cy.findByText("Custom list").click();
      cy.findByRole("textbox").type("foo\nbar\nbaz");
      cy.button("Done").click();
    });

    H.filterWidget().click();

    H.popover().within(() => {
      cy.findByText("foo").should("not.exist");
      cy.findByText("bar").should("not.exist");
      cy.findByText("baz").should("not.exist");

      cy.findByPlaceholderText("Search").should("be.visible").type("fo");

      cy.findByText("foo").should("be.visible");
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.sidebar().last().findByText("Dropdown list").click();

    H.filterWidget().click();

    H.popover().within(() => {
      cy.findByPlaceholderText("Search the list").should("be.visible");
      cy.findByText("foo").should("be.visible");
      cy.findByText("bar").should("be.visible");
      cy.findByText("baz").should("be.visible");
    });
  });
});

describe("issue 70311", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should not show the run overlay for a saved question with an empty between field filter (metabase#70311)", () => {
    H.createNativeQuestion(
      {
        name: "70311",
        native: {
          query: "SELECT * FROM PRODUCTS WHERE {{filter}} LIMIT 5",
          "template-tags": {
            filter: {
              id: "a3b95feb-b6d2-33b6-660b-bb656f59b1d7",
              name: "filter",
              "display-name": "Filter",
              type: "dimension",
              dimension: ["field", PRODUCTS.RATING, null],
              "widget-type": "number/between",
              default: null,
            },
          },
        },
      },
      { visitQuestion: true },
    );

    cy.wait("@cardQuery");

    cy.findByTestId("query-visualization-root").should("be.visible");
    cy.icon("play").should("not.exist");
  });
});
