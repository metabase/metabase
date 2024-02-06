import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { addOrUpdateDashboardCard } from "e2e/support/helpers";

const { PEOPLE_ID, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const markdownCard = {
  virtual_card: {
    name: null,
    display: "text",
    visualization_settings: {},
    dataset_query: {},
    archived: false,
  },
  text: "# Our Awesome Analytics",
  "text.align_vertical": "middle",
  "text.align_horizontal": "center",
};

const nativeQuestionDetails = {
  name: "Native Question",
  native: {
    query: "select count(*) from orders limit 5",
  },
  display: "scalar",
  // Put native question inside admin's personal collection
  collection_id: 1,
};

const questionDetails = {
  name: "GUI Question",
  query: { "source-table": PEOPLE_ID },
};

const modelDetails = {
  name: "GUI Model",
  query: { "source-table": PRODUCTS_ID },
  type: "model",
};

const pivotTable = {
  name: "Pivot Table",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [
      ["datetime-field", ["field-id", PRODUCTS.CREATED_AT], "year"],
      ["field-id", PRODUCTS.CATEGORY],
    ],
  },
  display: "pivot",
};

export function setup() {
  addEmptyDashboard("Empty", "emptyDashboard");

  addMarkdownDashboard("Dashboard with markdown text card", "markdownOnly");

  addModelDashboard("Dashboard with a model", "modelDashboard");

  addGuiDashboard("Dashboard with GUI question", "guiDashboard");

  addNativeDashboard("Dashboard with native question", "nativeDashboard");

  addMultiDashboard(
    "Dashboard with multiple cards, including markdown",
    "multiDashboard",
  );
}

function addEmptyDashboard(name, alias) {
  return cy.createDashboard(name).then(({ body: { id } }) => {
    cy.wrap(id).as(alias);
  });
}

function addMarkdownDashboard(name, alias) {
  return cy.createDashboard(name).then(({ body: { id: dashboard_id } }) => {
    addOrUpdateDashboardCard({
      card_id: null,
      dashboard_id,
      card: {
        row: 0,
        col: 0,
        // Full width markdown title
        size_x: 24,
        size_y: 2,
        visualization_settings: markdownCard,
      },
    });

    cy.wrap(dashboard_id).as(alias);
  });
}

function addModelDashboard(name, alias) {
  return cy
    .createQuestionAndDashboard({
      questionDetails: modelDetails,
      dashboardDetails: { name },
    })
    .then(({ body: { dashboard_id } }) => {
      cy.wrap(dashboard_id).as(alias);
    });
}

function addGuiDashboard(name, alias) {
  return cy
    .createQuestionAndDashboard({
      questionDetails,
      dashboardDetails: { name },
    })
    .then(({ body: { dashboard_id } }) => {
      cy.wrap(dashboard_id).as(alias);
    });
}

function addNativeDashboard(name, alias) {
  cy.createNativeQuestionAndDashboard({
    questionDetails: nativeQuestionDetails,
    dashboardDetails: { name },
  }).then(({ body: { dashboard_id } }) => {
    cy.wrap(dashboard_id).as(alias);
  });
}

function addMultiDashboard(name, alias) {
  return cy.createDashboard(name).then(({ body: { id: dashboard_id } }) => {
    addOrUpdateDashboardCard({
      card_id: null,
      dashboard_id,
      card: {
        row: 0,
        col: 0,
        // Full width markdown title
        size_x: 24,
        size_y: 2,
        visualization_settings: markdownCard,
      },
    });

    cy.createNativeQuestion(nativeQuestionDetails).then(
      ({ body: { id: card_id } }) => {
        addOrUpdateDashboardCard({
          card_id,
          dashboard_id,
          card: { row: 2, col: 0, size_x: 12, size_y: 8 },
        });
      },
    );

    cy.createQuestion(modelDetails).then(({ body: { id: card_id } }) => {
      addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: { row: 2, col: 10, size_x: 12, size_y: 8 },
      });
    });

    cy.createQuestion(questionDetails).then(({ body: { id: card_id } }) => {
      addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: { row: 11, col: 0, size_x: 16, size_y: 8 },
      });
    });

    cy.createQuestion(pivotTable).then(({ body: { id: card_id } }) => {
      addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: { row: 11, col: 12, size_x: 8, size_y: 8 },
      });
    });

    cy.wrap(dashboard_id).as(alias);
  });
}
