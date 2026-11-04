import Color from "color";
import type { Interception } from "cypress/types/net-stubbing";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import type {
  CardId,
  DatasetData,
  DocumentContent,
  GoalForeignColumnRef,
  MeasureId,
  ReferencedEntityType,
  RowValue,
} from "metabase-types/api";

const { H } = cy;

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const SINGLE_COLUMN_SOURCE = {
  name: "Goal source - single column",
  native: { query: "SELECT 400 AS TARGET" },
};

const MULTI_COLUMN_SOURCE = {
  name: "Goal source - multiple columns",
  native: { query: "SELECT 300 AS LOW, 600 AS HIGH, 'text' AS NOTE" },
};

const MULTI_ROW_SOURCE = {
  name: "Goal source - multiple rows",
  native: { query: "SELECT 1 AS LOW, 2 AS HIGH UNION ALL SELECT 3, 4" },
};

const NULL_SOURCE = {
  name: "Goal source - null",
  native: { query: "SELECT CAST(NULL AS INTEGER) AS TARGET" },
};

const TEXT_SOURCE = {
  name: "Goal source - text",
  native: { query: "SELECT 'not a number' AS TARGET" },
};

const METRIC_SOURCE = {
  name: "Goal source - metric",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
};

const MODEL_SOURCE = {
  name: "Goal source - model",
  type: "model" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

const MEASURE_SOURCE = {
  name: "Goal source - measure",
  definition: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
    },
  },
};

const EMBEDDABLE_CHART_NAME = "Embeddable chart with a dynamic goal";

type AnsweredReference = {
  type?: ReferencedEntityType;
  id: CardId | MeasureId;
  column: string;
  value: RowValue;
};

const PRODUCTS_COUNT_BY_MONTH = {
  name: "Products count by month",
  display: "line" as const,
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }]],
  },
};

const ORDERS_COUNT_QUERY = {
  "source-table": ORDERS_ID,
  aggregation: [["count"]],
};

const ORDERS_COUNT_BY_MONTH_QUERY = {
  ...ORDERS_COUNT_QUERY,
  breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
};

describe("scenarios > visualizations > dynamic goals", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    H.createNativeQuestion(SINGLE_COLUMN_SOURCE, {
      idAlias: "singleColumnSourceId",
      wrapId: true,
    });
    H.createNativeQuestion(MULTI_COLUMN_SOURCE, {
      idAlias: "multiColumnSourceId",
      wrapId: true,
    });
    H.createNativeQuestion(MULTI_ROW_SOURCE, {
      idAlias: "multiRowSourceId",
      wrapId: true,
    });
  });

  it("should draw a goal line from another question in every chart type, ad-hoc and saved", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: ORDERS_COUNT_BY_MONTH_QUERY,
      },
      display: "line",
    });

    cy.log("A question with a single numeric column is picked in one step");
    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByRole("tab", { name: "Display" }).click();
      cy.findByText("Goal line").click();
    });
    openGoalMenu("Goal value");
    pickGoalSource(SINGLE_COLUMN_SOURCE.name);

    H.vizSettingsSidebar()
      .findByRole("button", { name: "Change value source" })
      .should("contain.text", "400");
    assertGoalLineValue("400");
    cy.get<CardId>("@singleColumnSourceId").then((id) => {
      assertAnswered("@dataset", { id, column: "TARGET", value: 400 });
    });

    cy.log("The goal line follows the viz type");
    H.openVizTypeSidebar();
    H.vizTypeSidebar().findByText("More charts").click();
    ["Area", "Bar", "Combo", "Row", "Waterfall", "Scatter", "Box Plot"].forEach(
      (chartType) => {
        selectChartType("Table");
        H.echartsContainer().should("not.exist");
        selectChartType(chartType);
        H.goalLine().should("exist");
      },
    );
    H.vizTypeSidebar().findByTestId("Line-button").click();

    cy.log("A question with multiple numeric columns asks for the column");
    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByRole("tab", { name: "Display" }).click();
      cy.findByRole("button", { name: "Change value source" }).click();
    });
    pickGoalSource(MULTI_COLUMN_SOURCE.name);
    H.popover().within(() => {
      cy.findByRole("menuitem", { name: /LOW/ }).should("contain.text", "300");
      cy.findByRole("menuitem", { name: /NOTE/ }).should("not.exist");
      cy.findByRole("menuitem", { name: /HIGH/ })
        .should("contain.text", "600")
        .click();
    });
    assertGoalLineValue("600");

    cy.log("A saved question gets the goal value along with its results");
    H.saveQuestion(
      "Saved chart with a dynamic goal",
      { wrapId: true },
      { tab: "Browse", path: ["Our analytics"] },
    );
    cy.get<CardId>("@questionId").then((questionId) => {
      H.visitQuestion(questionId);
    });
    assertGoalLineValue("600");
    cy.get<CardId>("@multiColumnSourceId").then((id) => {
      assertAnswered("@cardQuery", { id, column: "HIGH", value: 600 });
    });

    cy.log("Goal-based alerts are offered for a dynamic goal");
    H.mockSlackConfigured();
    cy.findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Create an alert").click();
    H.modal().findByTestId("alert-goal-select").should("be.enabled").click();
    H.popover()
      .should("contain.text", "When results go above the goal")
      .and("contain.text", "When results go below the goal");
    cy.realPress("Escape");
    H.modal().button("Cancel").click();
    H.modal().should("not.exist");

    cy.log("A goal picked on a saved question resolves before it is saved");
    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByRole("tab", { name: "Display" }).click();
      cy.findByRole("button", { name: "Change value source" }).click();
    });
    H.popover().findByRole("menuitem", { name: /LOW/ }).click();
    assertGoalLineValue("300");
  });

  it("should resolve the goal of number, gauge and progress charts from a metric, a question and a measure", () => {
    H.createQuestion(METRIC_SOURCE, {
      idAlias: "metricSourceId",
      wrapId: true,
    });
    H.createQuestion(MODEL_SOURCE);
    H.createMeasure(MEASURE_SOURCE).then(({ body }) => {
      cy.wrap<MeasureId>(body.id).as("measureSourceId");
    });

    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: ORDERS_COUNT_QUERY,
      },
      display: "scalar",
    });

    cy.log("Number: a metric is resolved without its default breakout");
    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByRole("tab", { name: "Conditional colors" }).click();
      cy.findByRole("button", { name: /Add a range/ }).click();
      cy.findByLabelText("Range 1 maximum").clear().blur();
      cy.findAllByTestId("color-selector-button").first().click();
    });
    H.popover()
      .findAllByRole("button")
      .eq(4)
      .then(($button) => {
        cy.wrap($button.attr("aria-label")).as("rangeColor");
        cy.wrap($button).click();
      });
    openGoalMenu("Range 1 minimum");
    pickGoalSource(METRIC_SOURCE.name);
    cy.findByTestId("scalar-value").realHover();
    H.tooltip().should("contain.text", "≥ 18,760");
    H.queryBuilderHeader().realHover();
    // an unresolved minimum would leave the open-ended range without bounds
    cy.get<string>("@rangeColor").then((rangeColor) => {
      cy.findByTestId("scalar-value").should(
        "have.css",
        "color",
        Color(rangeColor).rgb().string(),
      );
    });
    cy.get<CardId>("@metricSourceId").then((id) => {
      assertAnswered("@dataset", { id, column: "count", value: 18760 });
    });

    cy.log(
      "Gauge: search skips questions, as measures and metrics exist (GDGT-3457)",
    );
    switchChartType("Gauge");
    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().findByRole("tab", { name: "Ranges" }).click();
    openGoalMenu("Range 1 maximum");
    H.popover().findByText("Value from another question").click();
    H.miniPicker().within(() => {
      cy.findByPlaceholderText("Search…").type(SINGLE_COLUMN_SOURCE.name);
      cy.findByText("No search results").should("be.visible");
    });

    cy.log("Browse all offers the question, and a model is not a goal source");
    H.miniPickerBrowseAll().click();
    H.pickEntity({ path: ["Our analytics"] });
    H.entityPickerModalLevel(1)
      .should("contain.text", SINGLE_COLUMN_SOURCE.name)
      .and("not.contain.text", MODEL_SOURCE.name);
    H.entityPickerModalItem(1, SINGLE_COLUMN_SOURCE.name).click();
    H.queryBuilderMain().findByTestId("gauge-arc-0").should("exist");
    H.queryBuilderMain().findByText("400").should("exist");

    cy.log("Progress: a measure is the goal");
    switchChartType("Progress");
    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().findByRole("tab", { name: "Display" }).click();
    openGoalMenu("Goal");
    pickGoalSource(MEASURE_SOURCE.name);
    H.queryBuilderMain().findByText("Goal 100").should("be.visible");
    cy.get<MeasureId>("@measureSourceId").then((id) => {
      assertAnswered("@dataset", {
        type: "measure",
        id,
        column: "max",
        value: 100,
      });
    });
  });

  it("should resolve the goals of a dashcard, its unsaved settings and a visualizer dashcard", () => {
    H.createQuestion(PRODUCTS_COUNT_BY_MONTH);

    cy.get<CardId>("@singleColumnSourceId").then((sourceId) => {
      H.createDashboardWithQuestions({
        dashboardName: "Dashboard with dynamic goals",
        questions: [
          {
            name: "Card with a goal",
            query: ORDERS_COUNT_BY_MONTH_QUERY,
            display: "line",
            visualization_settings: {
              "line.marker_enabled": true,
              "graph.metrics": ["count"],
              "graph.dimensions": ["CREATED_AT"],
              "graph.show_goal": true,
              "graph.goal_value": goalRef(sourceId, "TARGET"),
            },
          },
          {
            name: "Card without a goal",
            query: ORDERS_COUNT_QUERY,
            display: "progress",
          },
        ],
        cards: [
          { size_x: 12, size_y: 8, col: 0, row: 0 },
          { size_x: 12, size_y: 8, col: 12, row: 0 },
        ],
      }).then(({ dashboard }) => {
        H.visitDashboard(dashboard.id);
      });

      cy.log("A saved goal is resolved by the dashcard query");
      H.getDashboardCard(0).within(() => {
        H.goalLine().should("exist");
      });
      assertAnswered("@dashcardQuery", {
        id: sourceId,
        column: "TARGET",
        value: 400,
      });
    });

    cy.log("A goal set on the dashcard works before it is saved");
    H.editDashboard();
    H.showDashcardVisualizationSettings(1);
    openGoalMenu("Goal", H.modal);
    pickGoalSource(MULTI_COLUMN_SOURCE.name);
    H.popover().findByRole("menuitem", { name: /HIGH/ }).click();
    H.modal().within(() => {
      cy.findByText("Goal 600").should("be.visible");
      cy.button("Done").click();
    });
    H.getDashboardCard(1).findByText("Goal 600").should("be.visible");

    cy.log("A goal survives turning a dashcard into a visualizer dashcard");
    H.showDashcardVisualizerModal(0, { isVisualizerCard: false });
    H.modal().within(() => {
      H.goalLine().should("exist");
      H.toggleVisualizerSettingsSidebar();
      cy.findByTestId("chartsettings-sidebar").within(() => {
        cy.findByRole("tab", { name: "Display" }).click();
        cy.findByRole("button", { name: "Change value source" }).click();
      });
    });
    pickGoalSource(MULTI_COLUMN_SOURCE.name);
    H.popover().findByRole("menuitem", { name: /LOW/ }).click();
    H.modal()
      .findByRole("button", { name: "Change value source" })
      .should("contain.text", "300");
    cy.get<CardId>("@multiColumnSourceId").then((id) => {
      assertAnswered("@dataset", { id, column: "LOW", value: 300 });
    });
    H.modal().within(() => {
      H.goalLineMarker().trigger("mousemove");
    });
    H.tooltip().should("contain.text", "300");
    H.saveDashcardVisualizerModal();
    H.saveDashboard();

    cy.log("Saved dashcard and visualizer goals are resolved after a reload");
    H.getDashboardCard(0)
      .findByTestId("dashcard")
      .invoke("attr", "data-dashcard-key")
      .then((dashcardId) => {
        cy.intercept(
          "POST",
          `/api/dashboard/*/dashcard/${dashcardId}/card/*/query`,
        ).as("visualizerDashcardQuery");
      });
    cy.reload();
    H.getDashboardCard(0).within(() => {
      H.goalLineMarker().trigger("mousemove");
    });
    H.tooltip().should("contain.text", "300");
    H.getDashboardCard(1).findByText("Goal 600").should("be.visible");
    cy.get<CardId>("@multiColumnSourceId").then((id) => {
      assertAnswered("@visualizerDashcardQuery", {
        id,
        column: "LOW",
        value: 300,
      });
    });

    cy.log(
      "A visualizer card with several data sources still resolves its goal",
    );
    H.editDashboard();
    H.showDashcardVisualizerModal(0);
    H.modal().within(() => {
      cy.button("Add more data").click();
      H.selectDataset(PRODUCTS_COUNT_BY_MONTH.name);
      H.chartLegend().should("contain.text", PRODUCTS_COUNT_BY_MONTH.name);
      H.goalLine().should("exist");
    });
    H.saveDashcardVisualizerModal();
    H.saveDashboard();
    cy.reload();
    H.getDashboardCard(0).within(() => {
      H.chartLegend().should("contain.text", PRODUCTS_COUNT_BY_MONTH.name);
      H.goalLineMarker().trigger("mousemove");
    });
    H.tooltip().should("contain.text", "300");
  });

  it("should resolve goals in public and static embeds and documents", () => {
    cy.intercept("GET", "/api/public/card/*/query*").as("publicCardQuery");
    cy.intercept("GET", "/api/public/dashboard/*/dashcard/*/card/*").as(
      "publicDashcardQuery",
    );
    cy.intercept("GET", "/api/public/document/*/card/*").as(
      "publicDocumentCardQuery",
    );
    cy.intercept("PUT", "/api/document/*").as("updateDocument");
    cy.intercept("GET", "/api/embed/card/*/query*").as("embedCardQuery");
    cy.intercept("GET", "/api/embed/dashboard/*/dashcard/*/card/*").as(
      "embedDashcardQuery",
    );

    H.updateSetting("enable-embedding-static", true);

    cy.get<CardId>("@singleColumnSourceId").then((sourceId) => {
      H.createQuestionAndDashboard({
        questionDetails: {
          name: EMBEDDABLE_CHART_NAME,
          query: ORDERS_COUNT_BY_MONTH_QUERY,
          display: "line",
          enable_embedding: true,
          visualization_settings: {
            // visible data points leave the goal marker as the only hover target
            "line.marker_enabled": true,
            "graph.metrics": ["count"],
            "graph.dimensions": ["CREATED_AT"],
            "graph.show_goal": true,
            "graph.goal_value": goalRef(sourceId, "TARGET"),
          },
        },
        dashboardDetails: {
          name: "Embeddable dashboard",
          enable_embedding: true,
        },
      }).then(
        ({ body: { card_id: questionId, dashboard_id: dashboardId } }) => {
          H.createDocument({
            name: "Document with a dynamic goal",
            document: createDocumentWithCard(questionId),
            collection_id: null,
            idAlias: "documentId",
          });

          cy.log("Document");
          H.visitDocument("@documentId");
          H.documentContent().within(() => {
            H.goalLine().should("exist");
          });
          assertAnswered("@cardQuery", {
            id: sourceId,
            column: "TARGET",
            value: 400,
          });

          cy.log("A goal picked in a document resolves before it is saved");
          H.openDocumentCardMenu(EMBEDDABLE_CHART_NAME);
          H.popover().findByText("Edit Visualization").click();
          H.getDocumentSidebar().within(() => {
            cy.findByRole("tab", { name: "Display" }).click();
            cy.findByRole("button", { name: "Change value source" }).click();
          });
          pickGoalSource(MULTI_COLUMN_SOURCE.name);
          H.popover().findByRole("menuitem", { name: /HIGH/ }).click();
          H.getDocumentSidebar()
            .findByRole("button", { name: "Change value source" })
            .should("contain.text", "600");
          H.documentContent().within(() => {
            H.goalLineMarker().trigger("mousemove");
          });
          H.tooltip().should("contain.text", "600");
          cy.get<CardId>("@multiColumnSourceId").then((id) => {
            assertAnswered("@dataset", { id, column: "HIGH", value: 600 });
          });
          H.documentSaveButton().click();
          cy.wait("@updateDocument")
            .its("response.statusCode")
            .should("eq", 200);

          cy.log("Public document");
          H.visitPublicDocument("@documentId");
          H.goalLine().should("exist");
          cy.get<CardId>("@multiColumnSourceId").then((id) => {
            assertAnswered("@publicDocumentCardQuery", {
              id,
              column: "HIGH",
              value: 600,
            });
          });

          cy.log("Public question");
          cy.signInAsAdmin();
          H.visitPublicQuestion(questionId);
          H.goalLine().should("exist");
          assertAnswered("@publicCardQuery", {
            id: sourceId,
            column: "TARGET",
            value: 400,
          });

          cy.log("Public dashboard");
          cy.signInAsAdmin();
          H.visitPublicDashboard(dashboardId);
          H.goalLine().should("exist");
          assertAnswered("@publicDashcardQuery", {
            id: sourceId,
            column: "TARGET",
            value: 400,
          });

          cy.log("Static embed of a question");
          cy.signInAsAdmin();
          H.visitEmbeddedPage({
            resource: { question: questionId },
            params: {},
          });
          H.goalLine().should("exist");
          assertAnswered("@embedCardQuery", {
            id: sourceId,
            column: "TARGET",
            value: 400,
          });

          cy.log("Static embed of a dashboard");
          cy.signInAsAdmin();
          H.visitEmbeddedPage({
            resource: { dashboard: dashboardId },
            params: {},
          });
          H.goalLine().should("exist");
          assertAnswered("@embedDashcardQuery", {
            id: sourceId,
            column: "TARGET",
            value: 400,
          });
        },
      );
    });
  });

  it("should render charts with warnings when goal values can't be resolved", () => {
    H.createNativeQuestion(NULL_SOURCE, {
      idAlias: "nullSourceId",
      wrapId: true,
    });
    H.createNativeQuestion(TEXT_SOURCE, {
      idAlias: "textSourceId",
      wrapId: true,
    });
    H.createNativeQuestion(
      { ...SINGLE_COLUMN_SOURCE, name: "Goal source - deleted" },
      { idAlias: "deletedSourceId", wrapId: true },
    );
    H.createNativeQuestion(
      {
        ...SINGLE_COLUMN_SOURCE,
        name: "Goal source - no permissions",
        collection_id: ADMIN_PERSONAL_COLLECTION_ID,
      },
      { idAlias: "forbiddenSourceId", wrapId: true },
    );

    getCardIds([
      "@singleColumnSourceId",
      "@multiRowSourceId",
      "@nullSourceId",
      "@textSourceId",
      "@deletedSourceId",
      "@forbiddenSourceId",
    ]).then(
      ([
        singleColumnSourceId,
        multiRowSourceId,
        nullSourceId,
        textSourceId,
        deletedSourceId,
        forbiddenSourceId,
      ]) => {
        H.createNativeQuestion(
          {
            name: "Gauge with broken ranges",
            native: { query: "SELECT 50 AS VAL" },
            display: "gauge",
            visualization_settings: {
              "gauge.segments": [
                {
                  min: goalRef(multiRowSourceId, "LOW"),
                  max: goalRef(nullSourceId, "TARGET"),
                  color: "#ED6E6E",
                  label: "",
                },
                {
                  min: goalRef(textSourceId, "TARGET"),
                  max: goalRef(singleColumnSourceId, "MISSING"),
                  color: "#F9CF48",
                  label: "",
                },
                {
                  min: goalRef(deletedSourceId, "TARGET"),
                  max: goalRef(forbiddenSourceId, "TARGET"),
                  color: "#84BB4C",
                  label: "",
                },
                { min: 0, max: 100, color: "#509EE3", label: "" },
              ],
            },
          },
          { idAlias: "gaugeId", wrapId: true },
        );
        H.createQuestion(
          {
            name: "Line with a broken goal",
            query: ORDERS_COUNT_BY_MONTH_QUERY,
            display: "line",
            visualization_settings: {
              "graph.metrics": ["count"],
              "graph.dimensions": ["CREATED_AT"],
              "graph.show_goal": true,
              "graph.goal_value": goalRef(multiRowSourceId, "LOW"),
            },
          },
          { idAlias: "lineId", wrapId: true },
        );
        cy.request("DELETE", `/api/card/${deletedSourceId}`);
      },
    );

    cy.signInAsNormalUser();

    cy.log("Gauge: every kind of failure is explained next to its bound");
    cy.get<CardId>("@gaugeId").then((id) => H.visitQuestion(id));
    H.queryBuilderMain().within(() => {
      cy.findByTestId("gauge-arc-0").should("exist");
      cy.findAllByLabelText("Goal warning").first().click();
    });
    H.vizSettingsSidebar()
      .should(
        "contain.text",
        "The question's result must be a single value or row.",
      )
      .and("contain.text", "This value isn't a number")
      .and("contain.text", "This column no longer exists")
      .and("contain.text", "This source no longer exists")
      .and("contain.text", "You don't have permissions to do that.");

    cy.log("Line: the chart renders without the goal line, with a warning");
    cy.get<CardId>("@lineId").then((id) => H.visitQuestion(id));
    H.echartsContainer().should("contain.text", "Created At: Month");
    H.goalLine().should("not.exist");
    H.queryBuilderMain().findByRole("button", { name: "Warnings" }).click();
    H.vizSettingsSidebar()
      .findByRole("tab", { name: "Display" })
      .should("have.attr", "aria-selected", "true");
    H.vizSettingsSidebar().should(
      "contain.text",
      "The question's result must be a single value or row.",
    );
  });
});

function getCardIds(aliases: string[]): Cypress.Chainable<CardId[]> {
  const ids: CardId[] = [];

  aliases.forEach((alias) => {
    cy.get<CardId>(alias).then((id) => {
      ids.push(id);
    });
  });

  return cy.wrap(ids);
}

function goalRef(id: CardId, column: string): GoalForeignColumnRef {
  return { type: "card", id, column };
}

function openGoalMenu(
  label: string,
  getContainer: () => Cypress.Chainable<
    JQuery<HTMLElement>
  > = H.vizSettingsSidebar,
) {
  getContainer()
    .findByLabelText(label)
    .realHover()
    .parent()
    .findByLabelText("Pick a dynamic value")
    .click();
}

function pickGoalSource(name: string) {
  H.popover().findByText("Value from another question").click();
  H.miniPicker().within(() => {
    cy.findByPlaceholderText("Search…").type(name);
    cy.findByText(name).click();
  });
}

function switchChartType(chartType: string) {
  H.openVizTypeSidebar();
  selectChartType(chartType);
}

function selectChartType(chartType: string) {
  H.vizTypeSidebar().findByTestId(`${chartType}-button`).click();
  H.vizTypeSidebar()
    .findByTestId(`${chartType}-container`)
    .should("have.attr", "aria-selected", "true");
}

function assertGoalLineValue(value: string) {
  H.goalLine().should("exist");
  H.goalLineMarker().trigger("mousemove");
  H.tooltip().should("contain.text", value);
}

function assertAnswered(
  alias: string,
  { type = "card", id, column, value }: AnsweredReference,
) {
  cy.get<Interception[]>(`${alias}.all`).then((interceptions) => {
    const answers = interceptions.flatMap(
      ({ response }) =>
        response?.body.data.referenced_entities?.[type]?.[id] ?? [],
    );
    const isAnswered = answers.some(
      (answer) =>
        answer.status === "completed" &&
        getAnsweredValue(answer.data, column) === value,
    );

    expect(isAnswered, `${type} ${id} answered ${column} = ${value}`).to.equal(
      true,
    );
  });
}

function getAnsweredValue(
  { cols, rows }: Pick<DatasetData, "cols" | "rows">,
  column: string,
) {
  const index = cols.findIndex((col) => col.name === column);
  return index === -1 ? undefined : rows[0]?.[index];
}

function createDocumentWithCard(cardId: CardId): DocumentContent {
  return {
    type: "doc",
    content: [
      {
        type: "resizeNode",
        attrs: { height: 400, minHeight: 280 },
        content: [
          { type: "cardEmbed", attrs: { id: cardId, name: null, _id: "1" } },
        ],
      },
      { type: "paragraph", attrs: { _id: "2" } },
    ],
  };
}
