import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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
  dataset: true,
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

function addCardToDashboard({ card_id, dashboard_id, card } = {}) {
  const url = `/api/dashboard/${dashboard_id}/cards`;

  return cy
    .request("POST", url, {
      cardId: card_id,
    })
    .then(({ body: { id } }) => {
      cy.request("PUT", url, {
        cards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            sizeX: 8,
            sizeY: 8,
            visualization_settings: {},
            parameter_mappings: [],
            ...card,
          },
        ],
      });
    });
}

function addEmptyDashboard(name, alias) {
  return cy.createDashboard(name).then(({ body: { id } }) => {
    cy.wrap(id).as(alias);
  });
}

function addMarkdownDashboard(name, alias) {
  return cy.createDashboard(name).then(({ body: { id: dashboard_id } }) => {
    addCardToDashboard({
      card_id: null,
      dashboard_id,
      card: {
        row: 0,
        col: 0,
        // Full width markdown title
        sizeX: 18,
        sizeY: 2,
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
    addCardToDashboard({
      card_id: null,
      dashboard_id,
      card: {
        row: 0,
        col: 0,
        // Full width markdown title
        sizeX: 18,
        sizeY: 2,
        visualization_settings: markdownCard,
      },
    });

    cy.createNativeQuestion(nativeQuestionDetails).then(
      ({ body: { id: card_id } }) => {
        addCardToDashboard({
          card_id,
          dashboard_id,
          card: { row: 2, col: 0, sizeX: 9, sizeY: 8 },
        });
      },
    );

    cy.createQuestion(modelDetails).then(({ body: { id: card_id } }) => {
      addCardToDashboard({
        card_id,
        dashboard_id,
        card: { row: 2, col: 10, sizeX: 9, sizeY: 8 },
      });
    });

    cy.createQuestion(questionDetails).then(({ body: { id: card_id } }) => {
      addCardToDashboard({
        card_id,
        dashboard_id,
        card: { row: 11, col: 0, sizeX: 12, sizeY: 8 },
      });
    });

    cy.createQuestion(pivotTable).then(({ body: { id: card_id } }) => {
      addCardToDashboard({
        card_id,
        dashboard_id,
        card: { row: 11, col: 12, sizeX: 6, sizeY: 8 },
      });
    });

    cy.wrap(dashboard_id).as(alias);
  });
}
