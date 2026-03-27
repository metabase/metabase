const { H } = cy;
import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createMockActionParameter,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import { turnIntoModel } from "./helpers/e2e-models-helpers";

const { ORDERS_ID, ORDERS, REVIEWS, REVIEWS_ID, PRODUCTS, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

describe("issue 19737", () => {
  const modelName = "Orders Model";
  const personalCollectionName = "Bobby Tables's Personal Collection";

  function moveModel(modelName, collectionName) {
    openEllipsisMenuFor(modelName);
    H.popover().findByText("Move").click();

    H.pickEntity({
      path: Array.isArray(collectionName) ? collectionName : [collectionName],
    });

    H.entityPickerModal().within(() => {
      cy.button("Move").click();
    });
  }

  function openEllipsisMenuFor(item) {
    cy.findByText(item).closest("tr").find(".Icon-ellipsis").click();
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show moved model in the data picker without refreshing (metabase#19737)", () => {
    cy.visit("/collection/root");

    moveModel(modelName, personalCollectionName);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Moved model");

    cy.findByLabelText("Navigation bar").within(() => {
      cy.findByText("New").click();
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("be.visible").click();

    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      cy.findByText(personalCollectionName).click();
      cy.findByText(modelName);
    });
  });

  it("should not show duplicate models in the data picker after it's moved from a custom collection without refreshing (metabase#19737)", () => {
    // move "Orders Model" to "First collection"
    cy.visit("/collection/root");

    moveModel(modelName, ["Our analytics", "First collection"]);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Moved model");
    // Close the modal so the next time we move the model another model will always be shown
    cy.icon("close:visible").click();

    cy.findByLabelText("Navigation bar").within(() => {
      cy.findByText("New").click();
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("be.visible").click();

    // Open question picker (this is crucial) so the collection list are loaded.
    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("First collection").click();
      cy.findByText(modelName);
    });

    // Use back button to so the state is kept
    cy.go("back");

    // move "Orders Model" from a custom collection ("First collection") to another collection
    H.openNavigationSidebar();
    H.navigationSidebar().findByText("First collection").click();

    moveModel(modelName, personalCollectionName);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Moved model");

    cy.findByLabelText("Navigation bar").within(() => {
      cy.findByText("New").click();
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("be.visible").click();

    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      cy.findByText("First collection").should("not.exist");
      H.entityPickerModalLevel(1).should("exist");
      H.entityPickerModalLevel(2).should("not.exist");
    });
  });
});

describe("issue 20517", () => {
  const modelDetails = {
    name: "20517",
    query: {
      "source-table": ORDERS_ID,
      limit: 5,
    },
    type: "model",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestion(modelDetails).then(({ body: { id } }) => {
      cy.intercept("POST", `/api/card/${id}/query`).as("modelQuery");
      cy.intercept("PUT", `/api/card/${id}`).as("updateModel");
      cy.visit(`/model/${id}/columns`);
      cy.wait("@modelQuery");
    });
  });

  it("should be able to save metadata changes with empty description (metabase#20517)", () => {
    cy.findByTestId("dataset-edit-bar")
      .button("Save changes")
      .should("be.disabled");
    cy.findByDisplayValue(/^This is a unique ID/).clear();
    cy.findByDisplayValue(/^This is a unique ID/).should("not.exist");
    cy.findByTestId("dataset-edit-bar")
      .button("Save changes")
      .should("not.be.disabled")
      .click();
    cy.wait("@updateModel").then(({ response: { body, statusCode } }) => {
      expect(statusCode).not.to.eq(400);
      expect(body.errors).not.to.exist;
      expect(body.description).to.be.null;
    });
    cy.button("Save failed").should("not.exist");
  });
});

describe("issue 22519", { tags: "@skip" }, () => {
  const questionDetails = {
    query: {
      "source-table": REVIEWS_ID,
    },
  };

  beforeEach(() => {
    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();

    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: REVIEWS_ID,
      fieldId: REVIEWS.REVIEWS,
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Don't cast").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("UNIX seconds → Datetime").click();
    cy.wait("@updateField");
  });

  it("model query should not fail when data model is using casting (metabase#22519)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("xavier");

    turnIntoModel();

    cy.wait("@dataset");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("xavier");
  });
});

describe("issue 23024", () => {
  function addModelToDashboardAndVisit() {
    H.createDashboard().then(({ body: { id } }) => {
      cy.get("@modelId").then((cardId) => {
        H.addOrUpdateDashboardCard({
          dashboard_id: id,
          card_id: cardId,
        });
      });

      H.visitDashboard(id);
    });
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("PUT", "/api/card/*").as("updateMetadata");

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(
      {
        native: {
          query: `select *
                  from products limit 5`,
        },
        type: "model",
      },
      { wrapId: true, idAlias: "modelId" },
    );

    cy.get("@modelId").then((modelId) => {
      H.setModelMetadata(modelId, (field) => {
        if (field.display_name === "CATEGORY") {
          return {
            ...field,
            id: PRODUCTS.CATEGORY,
            display_name: "Category",
            semantic_type: "type/Category",
          };
        }

        return field;
      });
    });

    addModelToDashboardAndVisit();
  });

  it("should not be possible to apply the dashboard filter to the native model (metabase#23024)", () => {
    H.editDashboard();

    H.setFilter("Text or Category", "Is");

    H.getDashboardCard().within(() => {
      cy.findByText(/Models are data sources/).should("be.visible");
      cy.findByText("Select…").should("not.exist");
    });
  });
});

describe("issue 23421", () => {
  const query =
    'SELECT 1 AS "id", current_timestamp::timestamp AS "created_at"';

  const emptyColumnsQuestionDetails = {
    native: {
      query,
    },
    displayIsLocked: true,
    visualization_settings: {
      "table.columns": [],
      "table.pivot_column": "orphaned1",
      "table.cell_column": "orphaned2",
    },
    type: "model",
  };

  const hiddenColumnsModelDetails = {
    native: {
      query,
    },
    displayIsLocked: true,
    visualization_settings: {
      "table.columns": [
        {
          name: "id",
          key: '["name","id"]',
          enabled: false,
          fieldRef: ["field", "id", { "base-type": "type/Integer" }],
        },
        {
          name: "created_at",
          key: '["name","created_at"]',
          enabled: false,
          fieldRef: ["field", "created_at", { "base-type": "type/DateTime" }],
        },
      ],
      "table.pivot_column": "orphaned1",
      "table.cell_column": "orphaned2",
    },
    type: "model",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("`visualization_settings` should not break UI (metabase#23421)", () => {
    H.createNativeQuestion(emptyColumnsQuestionDetails, {
      visitQuestion: true,
    });
    H.openQuestionActions();
    H.popover().findByText("Edit query definition").click();

    H.NativeEditor.get().should("be.visible").and("contain", query);
    cy.findByRole("columnheader", { name: "id" }).should("be.visible");
    cy.findByRole("columnheader", { name: "created_at" }).should("be.visible");
    cy.button("Save changes").should("be.visible");
  });

  it("`visualization_settings` with hidden columns should not break UI (metabase#23421)", () => {
    H.createNativeQuestion(hiddenColumnsModelDetails, {
      visitQuestion: true,
    });
    H.openQuestionActions();
    H.popover().findByText("Edit query definition").click();

    H.NativeEditor.get().should("be.visible").and("contain", query);
    H.tableInteractiveHeader().within(() => {
      cy.findByText("id").should("be.visible");
      cy.findByText("created_at").should("be.visible");
    });
    cy.button("Save changes").should("be.disabled");
  });
});

describe("issue 23449", () => {
  const questionDetails = { query: { "source-table": REVIEWS_ID, limit: 2 } };
  function turnIntoModel() {
    cy.intercept("PUT", "/api/card/*").as("cardUpdate");

    H.openQuestionActions();
    cy.findByText("Turn into a model").click();
    cy.findByText("Turn this into a model").click();

    cy.wait("@cardUpdate").then(({ response }) => {
      expect(response.body.error).to.not.exist;
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.request("POST", `/api/field/${REVIEWS.RATING}/dimension`, {
      type: "internal",
      name: "Rating",
    });

    cy.request("POST", `/api/field/${REVIEWS.RATING}/values`, {
      values: [
        [1, "Awful"],
        [2, "Unpleasant"],
        [3, "Meh"],
        [4, "Enjoyable"],
        [5, "Perfecto"],
      ],
    });
  });

  it("should work with the remapped custom values from data model (metabase#23449)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    cy.findByTextEnsureVisible("Perfecto");

    turnIntoModel();
    cy.findByTextEnsureVisible("Perfecto");
  });
});

describe("issue 25537", () => {
  const questionDetails = {
    name: "Orders model",
    query: { "source-table": ORDERS_ID },
    type: "model",
  };
  const setLocale = (locale) => {
    cy.request("GET", "/api/user/current").then(({ body: { id: user_id } }) => {
      cy.request("PUT", `/api/user/${user_id}`, { locale });
    });
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be able to pick a saved model when using a non-english locale (metabase#25537)", () => {
    setLocale("de");
    H.createQuestion(questionDetails);

    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Unsere Analysen").click();
      cy.findByText(questionDetails.name).should("exist");
    });
  });
});

describe("issue 29378", () => {
  const ACTION_DETAILS = {
    name: "Update orders quantity",
    description: "Set orders quantity to the same value",
    type: "query",
    model_id: ORDERS_QUESTION_ID,
    database_id: SAMPLE_DB_ID,
    dataset_query: {
      database: SAMPLE_DB_ID,
      native: {
        query: "UPDATE orders SET quantity = quantity",
      },
      type: "native",
    },
    parameters: [],
    visualization_settings: {
      type: "button",
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setActionsEnabledForDB(SAMPLE_DB_ID);
  });

  it("should not crash the model detail page after searching for an action (metabase#29378)", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    H.createAction(ACTION_DETAILS);

    cy.visit(`/model/${ORDERS_QUESTION_ID}/detail`);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(ACTION_DETAILS.name).should("be.visible");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(ACTION_DETAILS.dataset_query.native.query).should(
      "be.visible",
    );

    H.commandPaletteSearch(ACTION_DETAILS.name, false);
    H.commandPalette()
      .findByRole("option", { name: ACTION_DETAILS.name })
      .should("exist");
    H.closeCommandPalette();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(ACTION_DETAILS.name).should("be.visible");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(ACTION_DETAILS.dataset_query.native.query).should(
      "be.visible",
    );
  });
});

function mapModelColumnToDatabase({ table, field }) {
  cy.findByText("Database column this maps to")
    .parent()
    .findByTestId("select-button")
    .click();
  H.popover().findByRole("option", { name: table }).click();
  H.popover().findByRole("option", { name: field }).click();
  cy.contains(`${table} → ${field}`).should("be.visible");
  cy.findAllByDisplayValue(field);
  cy.findByLabelText("Description").should("not.be.empty");
}

function selectModelColumn(column) {
  cy.findAllByTestId("header-cell").contains(column).click();
}

describe("issue 29517 - nested question based on native model with remapped values", () => {
  const questionDetails = {
    name: "29517",
    type: "model",
    native: {
      query:
        'Select Orders."ID" AS "ID",\nOrders."CREATED_AT" AS "CREATED_AT"\nFrom Orders',
      "template-tags": {},
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.intercept(
        "GET",
        `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC?can-query=true`,
      ).as("schema");
      cy.visit(`/model/${id}/columns`);
      cy.wait("@schema");

      mapModelColumnToDatabase({ table: "Orders", field: "ID" });
      selectModelColumn("CREATED_AT");
      mapModelColumnToDatabase({ table: "Orders", field: "Created At" });

      cy.intercept("PUT", "/api/card/*").as("updateModel");
      cy.button("Save changes").click();
      cy.wait("@updateModel");

      const nestedQuestionDetails = {
        query: {
          "source-table": `card__${id}`,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              "CREATED_AT",
              { "temporal-unit": "month", "base-type": "type/DateTime" },
            ],
          ],
        },
        display: "line",
      };

      H.createQuestionAndDashboard({
        questionDetails: nestedQuestionDetails,
      }).then(({ body: card }) => {
        const { card_id, dashboard_id } = card;

        H.editDashboardCard(card, {
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "dashboard",
              targetId: ORDERS_DASHBOARD_ID,
              parameterMapping: {},
            },
          },
        });

        cy.wrap(card_id).as("nestedQuestionId");
        cy.wrap(dashboard_id).as("dashboardId");
      });
    });
  });

  it("drill-through should work (metabase#29517-1)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.visitQuestion("@nestedQuestionId");

    // We can click on any circle; this index was chosen randomly
    H.cartesianChartCircle().eq(25).click({ force: true });
    H.popover()
      .findByText(/^See these/)
      .click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").findByText(
      "Created At is May 1–31, 2024",
    );

    H.assertQueryBuilderRowCount(520);
  });

  it("click behavior to custom destination should work (metabase#29517-2)", () => {
    cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    H.visitDashboard("@dashboardId");

    cy.intercept("GET", `/api/dashboard/${ORDERS_DASHBOARD_ID}*`).as(
      "loadTargetDashboard",
    );
    H.cartesianChartCircle().eq(25).click({ force: true });
    cy.wait("@loadTargetDashboard");

    cy.location("pathname").should("eq", `/dashboard/${ORDERS_DASHBOARD_ID}`);

    cy.wait("@dashcardQuery");

    cy.get("[data-testid=cell-data]").contains("37.65");
  });
});

describe("issue 53556 - nested question based on native model with remapped values", () => {
  const questionDetails = {
    name: "53556",
    type: "model",
    native: {
      query:
        "Select " +
        'Orders."ID" AS "ID", ' +
        'Orders."CREATED_AT" AS "CREATED_AT_ALIAS", ' +
        'Orders."TOTAL" AS "TOTAL_ALIAS" ' +
        "From Orders",
      "template-tags": {},
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.intercept(
        "GET",
        `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC?can-query=true`,
      ).as("schema");
      cy.visit(`/model/${id}/columns`);
      cy.wait("@schema");

      mapModelColumnToDatabase({ table: "Orders", field: "ID" });
      selectModelColumn("CREATED_AT_ALIAS");
      mapModelColumnToDatabase({ table: "Orders", field: "Created At" });
      selectModelColumn("TOTAL_ALIAS");
      mapModelColumnToDatabase({ table: "Orders", field: "Total" });

      cy.intercept("PUT", "/api/card/*").as("updateModel");
      cy.button("Save changes").click();
      cy.wait("@updateModel");

      const nestedQuestionDetails = {
        query: {
          "source-table": `card__${id}`,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              "CREATED_AT_ALIAS",
              { "temporal-unit": "month", "base-type": "type/DateTime" },
            ],
            [
              "field",
              "TOTAL_ALIAS",
              { binning: { strategy: "default" }, "base-type": "type/Float" },
            ],
          ],
        },
        display: "line",
      };

      H.createQuestion(nestedQuestionDetails, {
        wrapId: true,
        idAlias: "nestedQuestionId",
      });
    });
  });

  it("Underlying records drill-through should work (metabase#53556)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.visitQuestion("@nestedQuestionId");

    // We can click on any circle; this index was chosen randomly
    H.cartesianChartCircle().eq(25).click({ force: true });
    H.popover()
      .findByText(/^See these/)
      .click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").findByText(
      "Created At is May 1–31, 2024",
    );

    cy.findByTestId("qb-filters-panel").findByText(
      "Total is greater than or equal to 40",
    );

    cy.findByTestId("qb-filters-panel").findByText("Total is less than 60");

    H.assertQueryBuilderRowCount(110);
  });

  it("Zoom in binning drill-through should work (metabase#53556)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.visitQuestion("@nestedQuestionId");

    // We can click on any circle; this index was chosen randomly
    H.cartesianChartCircle().eq(25).click({ force: true });
    H.popover()
      .findByText(/^Zoom in/)
      .click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").findByText(
      "Total: 8 bins is greater than or equal to 40",
    );

    cy.findByTestId("qb-filters-panel").findByText(
      "Total: 8 bins is less than 60",
    );

    H.assertQueryBuilderRowCount(375);
  });

  it("Zoom in timeseries drill-through should work (metabase#53556)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.visitQuestion("@nestedQuestionId");

    // We can click on any circle; this index was chosen randomly
    H.cartesianChartCircle().eq(25).click({ force: true });
    H.popover()
      .findByText(/^See this month by week/)
      .click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").findByText(
      "Created At is May 1–31, 2024",
    );

    H.assertQueryBuilderRowCount(36);
  });

  it("Sort drill-through should work (metabase#53556)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.visitQuestion("@nestedQuestionId");

    cy.findByLabelText("Switch to data").click();
    H.assertQueryBuilderRowCount(312);

    cy.log("Sort by Total in descending order");
    H.tableHeaderClick("Total: 8 bins");
    H.popover()
      .findAllByTestId("click-actions-sort-control-sort.descending")
      .click();
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(312);
    H.assertTableData({
      columns: ["Created At: Month", "Total: 8 bins", "Count"],
      firstRows: [
        ["January 2024", "140  –  160", "18"],
        ["February 2024", "140  –  160", "17"],
      ],
    });

    cy.log("Sort by Total in ascending order");
    H.tableHeaderClick("Total: 8 bins");
    H.popover()
      .findAllByTestId("click-actions-sort-control-sort.ascending")
      .click();
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(312);
    H.assertTableData({
      columns: ["Created At: Month", "Total: 8 bins", "Count"],
      firstRows: [
        ["December 2023", "-60  –  -40", "1"],
        ["September 2022", "0  –  20", "2"],
      ],
    });

    cy.log("Sort by Created At in descending order");
    H.tableHeaderClick("Created At: Month");
    H.popover()
      .findAllByTestId("click-actions-sort-control-sort.descending")
      .click();
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(312);
    H.assertTableData({
      columns: ["Created At: Month", "Total: 8 bins", "Count"],
      firstRows: [
        ["April 2026", "20  –  40", "27"],
        ["April 2026", "40  –  60", "57"],
      ],
    });

    cy.log("Sort by Created At in ascending order");
    H.tableHeaderClick("Created At: Month");
    H.popover()
      .findAllByTestId("click-actions-sort-control-sort.ascending")
      .click();
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(312);
    H.assertTableData({
      columns: ["Created At: Month", "Total: 8 bins", "Count"],
      firstRows: [
        ["April 2022", "40  –  60", "1"],
        ["May 2022", "20  –  40", "1"],
      ],
    });
  });
});

describe("issue 52465 - model with linked columns can still be aggregated", () => {
  const questionDetails = {
    name: "52465",
    type: "model",
    native: {
      query: `
SELECT
  "ID" AS "id orders",
  "SOURCE" AS "source orders"
FROM
  "PEOPLE"
`,
      "template-tags": {},
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("Create model, set metadata, distinct", () => {
    H.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.intercept(
        "GET",
        `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC?can-query=true`,
      ).as("schema");
      cy.visit(`/model/${id}/columns`);
      cy.wait("@schema");

      selectModelColumn("source orders");
      mapModelColumnToDatabase({ table: "People", field: "Source" });

      cy.intercept("PUT", "/api/card/*").as("updateModel");
      cy.button("Save changes").click();
      cy.wait("@updateModel");

      const nestedQuestionDetails = {
        query: {
          "source-table": `card__${id}`,
        },
      };

      H.createQuestion(nestedQuestionDetails, {
        wrapId: true,
        idAlias: "nestedQuestionId",
      });

      H.visitQuestion("@nestedQuestionId");
      cy.findByText("Source").click();
      cy.findByText("Distinct values").click();

      H.assertQueryBuilderRowCount(1);
    });
  });
});

describe("issue 31309", () => {
  const TEST_QUERY = {
    "order-by": [["asc", ["field", "sum", { "base-type": "type/Float" }]]],
    limit: 10,
    filter: ["<", ["field", "sum", { "base-type": "type/Float" }], 100],
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      breakout: [
        [
          "field",
          PEOPLE.NAME,
          { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
        ],
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should duplicate a model with its original aggregation and breakout", () => {
    H.createQuestion(
      {
        name: "model",
        query: TEST_QUERY,
        database: SAMPLE_DB_ID,
        type: "model",
      },
      {
        visitQuestion: true,
      },
    );

    H.openQuestionActions();
    H.popover().findByText("Duplicate").click();

    H.modal().within(() => {
      cy.findByText("Duplicate").click();
    });

    H.openQuestionActions();
    H.popover().within(() => {
      cy.findByText("Edit query definition").click();
    });

    cy.findByTestId("data-step-cell").findByText("Orders").should("exist");

    cy.findByTestId("aggregate-step")
      .findByText("Sum of Total")
      .should("exist");

    cy.findByTestId("breakout-step").findByText("User → Name").should("exist");

    H.getNotebookStep("filter", { stage: 1, index: 0 })
      .findByText("Sum of Total is less than 100")
      .should("exist");

    H.getNotebookStep("sort", { stage: 1, index: 0 })
      .findByText("Sum of Total")
      .should("exist");

    H.getNotebookStep("limit", { stage: 1, index: 0 })
      .findByDisplayValue("10")
      .should("exist");
  });
});

describe("issue 32483", () => {
  const createTextFilterMapping = ({ card_id, fieldRef }) => {
    return {
      card_id,
      parameter_id: DASHBOARD_FILTER_TEXT.id,
      target: ["dimension", fieldRef],
    };
  };
  const DASHBOARD_FILTER_TEXT = createMockActionParameter({
    id: "1",
    name: "Text filter",
    slug: "filter-text",
    type: "string/=",
    sectionId: "string",
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("dashboard filter should be applied to the saved model with source containing custom column (metabase#32483)", () => {
    const questionDetails = {
      query: {
        "source-table": PEOPLE_ID,
        expressions: {
          "source state": [
            "concat",
            [
              "field",
              PEOPLE.SOURCE,
              {
                "base-type": "type/Text",
              },
            ],
            " ",
            [
              "field",
              PEOPLE.STATE,
              {
                "base-type": "type/Text",
              },
            ],
          ],
        },
      },
    };

    H.createQuestion(questionDetails, { wrapId: true });

    cy.get("@questionId").then((questionId) => {
      const modelDetails = {
        type: "model",
        name: "Orders + People Question Model",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              alias: "People - User",
              condition: [
                "=",
                [
                  "field",
                  ORDERS.USER_ID,
                  {
                    "base-type": "type/Integer",
                  },
                ],
                [
                  "field",
                  "ID",
                  {
                    "base-type": "type/BigInteger",
                    "join-alias": "People - User",
                  },
                ],
              ],
              "source-table": `card__${questionId}`,
            },
          ],
        },
      };

      H.createQuestion(modelDetails).then(({ body: { id: modelId } }) => {
        const dashboardDetails = {
          name: "32483 Dashboard",
          parameters: [DASHBOARD_FILTER_TEXT],
          dashcards: [
            createMockDashboardCard({
              id: 1,
              size_x: 8,
              size_y: 8,
              card_id: questionId,
              parameter_mappings: [
                createTextFilterMapping({
                  card_id: questionId,
                  fieldRef: [
                    "expression",
                    "source state",
                    {
                      "base-type": "type/Text",
                    },
                  ],
                }),
              ],
            }),
            createMockDashboardCard({
              id: 2,
              size_x: 8,
              size_y: 8,
              card_id: modelId,
              parameter_mappings: [
                createTextFilterMapping({
                  card_id: modelId,
                  fieldRef: [
                    "field",
                    "source state",
                    {
                      "base-type": "type/Text",
                      "join-alias": "People - User",
                    },
                  ],
                }),
              ],
            }),
          ],
        };

        H.createDashboard(dashboardDetails).then(
          ({ body: { id: dashboardId } }) => {
            H.visitDashboard(dashboardId);
          },
        );
      });
    });

    H.filterWidget().click();
    addWidgetStringFilter("Facebook MN");

    H.getDashboardCard(1).should("contain", "Orders + People Question Model");
  });
});

describe("issue 40252", () => {
  const modelA = {
    name: "Model A",
    native: { query: "select 1 as a1, 2 as a2" },
    type: "model",
  };

  const modelB = {
    name: "Model B",
    native: { query: "select 1 as b1, 2 as b2" },
    type: "model",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shouldn't crash during save of metadata (metabase#40252)", () => {
    H.createNativeQuestion(modelA, { wrapId: true, idAlias: "modelA" });
    H.createNativeQuestion(modelB, { wrapId: true, idAlias: "modelB" });

    cy.get("@modelA").then((modelAId) => {
      cy.get("@modelB").then((modelBId) => {
        const questionDetails = {
          name: "40252",
          type: "model",
          query: {
            joins: [
              {
                fields: "all",
                alias: "Model B - A1",
                strategy: "inner-join",
                condition: [
                  "=",
                  [
                    "field",
                    "A1",
                    {
                      "base-type": "type/Integer",
                    },
                  ],
                  [
                    "field",
                    "B1",
                    {
                      "base-type": "type/Integer",
                      "join-alias": "Model B - A1",
                    },
                  ],
                ],
                "source-table": `card__${modelBId}`,
              },
            ],
            "source-table": `card__${modelAId}`,
          },
        };

        H.createQuestion(questionDetails, { visitQuestion: true });
      });
    });

    H.openQuestionActions();

    H.popover().findByText("Edit metadata").click();

    cy.findAllByTestId("header-cell").contains("Model B - A1 → B1").click();
    cy.findByLabelText("Display name").type("Upd");

    //Because the field is debounced, we wait to see it in the metadata editor table before saving
    cy.findAllByTestId("header-cell").contains("Model B - A1 → B1Upd");
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.findByTestId("dataset-edit-bar")
      .findByRole("button", { name: "Save changes" })
      .should("be.enabled")
      .click();

    cy.url().should("not.contain", "/columns");

    cy.wait("@dataset");

    cy.findAllByTestId("header-cell").contains("Model B - A1 → B1Upd");
  });
});

describe("issue 42355", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow overriding database fields for models with manually ordered columns (metabase#42355)", () => {
    H.createNativeQuestion({
      type: "model",
      native: { query: "SELECT ID, PRODUCT_ID FROM ORDERS" },
      visualization_settings: {
        "table.columns": [
          {
            name: "PRODUCT_ID",
            key: '["name","PRODUCT_ID"]',
            enabled: true,
            fieldRef: ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
          },
          {
            name: "ID",
            key: '["name","ID"]',
            enabled: true,
            fieldRef: ["field", "ID", { "base-type": "type/BigInteger" }],
          },
        ],
        "table.cell_column": "ID",
      },
    }).then(({ body: card }) => H.visitModel(card.id));

    cy.log("update metadata");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.rightSidebar()
      .findByText("Database column this maps to")
      .next()
      .findByText("None")
      .click();
    H.popover().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("ID").click();
    });
    cy.button("Save changes").click();

    cy.log("check metadata changes are visible");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.rightSidebar()
      .findByText("Database column this maps to")
      .next()
      .findByText("Orders → ID")
      .should("be.visible");
  });
});

describe("cumulative count - issue 33330", () => {
  const questionDetails = {
    name: "33330",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["cum-count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestion(questionDetails, { visitQuestion: true });
    cy.findAllByTestId("header-cell")
      .should("contain", "Created At: Month")
      .and("contain", "Cumulative count");
    cy.findAllByTestId("cell-data").should("contain", "June 2022");
  });

  it("should still work after turning a question into model (metabase#33330-1)", () => {
    turnIntoModel();
    cy.findAllByTestId("header-cell")
      .should("contain", "Created At: Month")
      .and("contain", "Cumulative count");
    cy.findAllByTestId("cell-data").should("contain", "June 2022");
  });

  it("should still work after applying a post-aggregation filter (metabase#33330-2)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.filter();
    H.popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Today").click();
    });
    cy.wait("@dataset");

    cy.findByTestId("filter-pill").should("have.text", "Created At is today");
    cy.findAllByTestId("header-cell")
      .should("contain", "Created At: Month")
      .and("contain", "Cumulative count");
    cy.findAllByTestId("cell-data")
      .should("have.length", "4")
      .and("not.be.empty");
    cy.findByTestId("question-row-count").should("have.text", "Showing 1 row");
  });
});
