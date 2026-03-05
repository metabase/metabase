const { H } = cy;

import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATABASE;

describe("issue 44288", () => {
  const questionDetails = {
    name: "SQL question",
    type: "question",
    query: { "source-table": PRODUCTS_ID, limit: 10 },
  };

  const modelDetails = {
    name: "SQL model",
    type: "model",
    native: { query: "SELECT * FROM PRODUCTS LIMIT 10" },
  };

  const parameterDetails = {
    name: "Text",
    slug: "text",
    id: "27454068",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  function getDashcardDetails(dashboard, question, model) {
    return {
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: question.id,
          parameter_mappings: [
            {
              card_id: question.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
          ],
        },
        {
          card_id: model.id,
          parameter_mappings: [
            {
              card_id: model.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                ["field", "CATEGORY", { "base-type": "type/Text" }],
              ],
            },
          ],
        },
      ],
    };
  }

  function verifyMapping() {
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText(parameterDetails.name)
      .click();
    H.getDashboardCard(0).within(() => {
      cy.findByText(/Category/i).should("be.visible");
    });
    H.getDashboardCard(1).within(() => {
      cy.findByText(/Category/i).should("not.exist");
      cy.findByText(/Models are data sources/).should("be.visible");
    });
  }

  function verifyFilter() {
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard(0).within(() => {
      cy.findAllByText("Gadget").should("have.length.gte", 1);
      cy.findByText("Doohickey").should("not.exist");
    });
    H.getDashboardCard(1).within(() => {
      cy.findAllByText("Gadget").should("have.length.gte", 1);
      cy.findAllByText("Doohickey").should("have.length.gte", 1);
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.createQuestion(questionDetails).then(({ body: question }) => {
      H.createNativeQuestion(modelDetails).then(({ body: model }) => {
        H.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
          H.updateDashboardCards(
            getDashcardDetails(dashboard, question, model),
          );
          cy.wrap(dashboard.id).as("dashboardId");
        });
      });
    });
    cy.signOut();
  });

  it("should ignore parameter mappings to a native model in a dashboard (metabase#44288)", () => {
    cy.log("regular dashboards");
    cy.signInAsNormalUser();
    H.visitDashboard("@dashboardId");
    H.editDashboard();
    verifyMapping();
    H.saveDashboard({ awaitRequest: false });
    verifyFilter();
    cy.signOut();

    cy.log("public dashboards");
    cy.signInAsAdmin();
    cy.get("@dashboardId").then((dashboardId) =>
      H.visitPublicDashboard(dashboardId),
    );
    verifyFilter();

    cy.log("embedded dashboards");
    cy.get("@dashboardId").then((dashboardId) =>
      H.visitEmbeddedPage({
        resource: { dashboard: dashboardId },
        params: {},
      }),
    );
    verifyFilter();
  });
});

describe("issue 27579", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to remove the last exclude hour option (metabase#27579)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.setFilter("Date picker", "All Options");
    H.selectDashboardFilter(H.getDashboardCard(), "Created At");
    H.saveDashboard();
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Exclude…").click();
      cy.findByText("Hours of the day…").click();
      cy.findByText("Select all").click();
      cy.findByLabelText("12 AM").should("be.checked");

      cy.findByText("Select all").click();
      cy.findByLabelText("12 AM").should("not.be.checked");
    });
  });
});

describe("issue 32804", () => {
  const question1Details = {
    name: "Q1",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const parameterDetails = {
    name: "Number",
    slug: "number",
    id: "27454068",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  const getQuestion2Details = (card) => ({
    name: "Q2",
    query: {
      "source-table": `card__${card.id}`,
      filter: [
        "=",
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        "Gadget",
      ],
    },
  });

  const getParameterMapping = (card) => ({
    card_id: card.id,
    parameter_id: parameterDetails.id,
    target: [
      "dimension",
      ["field", PRODUCTS.RATING, { "base-type": "type/Integer" }],
    ],
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should retain source query filters when drilling-thru from a dashboard (metabase#32804)", () => {
    H.createQuestion(question1Details).then(({ body: card1 }) => {
      H.createDashboardWithQuestions({
        dashboardDetails,
        questions: [getQuestion2Details(card1)],
      }).then(({ dashboard, questions: [card2] }) => {
        H.updateDashboardCards({
          dashboard_id: dashboard.id,
          cards: [
            {
              card_id: card2.id,
              parameter_mappings: [getParameterMapping(card2)],
            },
          ],
        });
        H.visitDashboard(dashboard.id, {
          params: { [parameterDetails.slug]: "4" },
        });
      });
    });
    H.filterWidget().findByText("4").should("be.visible");
    H.getDashboardCard(0).findByText("Q2").click();
    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Category is Gadget").should("be.visible");
      cy.findByText("Rating is equal to 4").should("be.visible");
    });
  });
});

describe("issue 44231", () => {
  const parameterDetails = {
    id: "92eb69ea",
    name: "ID",
    sectionId: "id",
    slug: "id",
    type: "id",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  function getPkCardDetails(type) {
    return {
      name: "Products",
      type,
      query: { "source-table": PRODUCTS_ID },
    };
  }

  function getFkCardDetails(type) {
    return {
      name: "Orders",
      type: "model",
      query: { "source-table": ORDERS_ID },
    };
  }

  function getDashcardDetails(type, dashboard, pkCard, fkCard) {
    return {
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: pkCard.id,
          parameter_mappings: [
            {
              card_id: pkCard.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                [
                  "field",
                  type === "model" ? "ID" : PRODUCTS.ID,
                  { "base-type": "type/BigInteger" },
                ],
              ],
            },
          ],
        },
        {
          card_id: fkCard.id,
          parameter_mappings: [
            {
              card_id: fkCard.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                [
                  "field",
                  type === "model" ? "PRODUCT_ID" : ORDERS.PRODUCT_ID,
                  { "base-type": "type/BigInteger" },
                ],
              ],
            },
          ],
        },
      ],
    };
  }

  function verifyFilterByRemappedValue() {
    const productId = 144;
    const productName = "Aerodynamic Bronze Hat";

    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText(productName).click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard(0).findByText(productName).should("be.visible");
    H.getDashboardCard(1)
      .findAllByText(String(productId))
      .should("have.length.above", 0);
  }

  function verifyFieldMapping(type) {
    H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [getPkCardDetails(type), getFkCardDetails(type)],
    }).then(({ dashboard, questions: [pkCard, fkCard] }) => {
      H.updateDashboardCards(
        getDashcardDetails(type, dashboard, pkCard, fkCard),
      );

      H.visitDashboard(dashboard.id);
      verifyFilterByRemappedValue();

      H.visitPublicDashboard(dashboard.id);
      verifyFilterByRemappedValue();

      H.visitEmbeddedPage({
        resource: { dashboard: dashboard.id },
        params: {},
      });
      verifyFilterByRemappedValue();
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${PRODUCTS.ID}`, {
      has_field_values: "list",
    });
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });
    cy.request("PUT", `/api/field/${PRODUCTS.TITLE}`, {
      semantic_type: "type/Name",
    });
  });

  it("should allow filtering by remapped values with questions (metabase#44231)", () => {
    verifyFieldMapping("question");
  });

  it("should allow filtering by remapped values with models (metabase#44231)", () => {
    verifyFieldMapping("model");
  });
});

describe("44047", () => {
  const questionDetails = {
    name: "Question",
    type: "question",
    query: {
      "source-table": REVIEWS_ID,
      limit: 100,
    },
  };

  const modelDetails = {
    name: "Model",
    type: "model",
    query: {
      "source-table": REVIEWS_ID,
      limit: 100,
    },
  };

  const sourceQuestionDetails = {
    name: "Source question",
    type: "question",
    query: {
      "source-table": REVIEWS_ID,
      fields: [
        ["field", REVIEWS.ID, { "base-type": "type/BigInteger" }],
        ["field", REVIEWS.RATING, { "base-type": "type/Integer" }],
      ],
    },
  };

  const parameterDetails = {
    name: "Text",
    slug: "text",
    id: "5a425670",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  function getQuestionDashcardDetails(dashboard, card) {
    return {
      dashboard_id: dashboard.id,
      card_id: card.id,
      parameter_mappings: [
        {
          card_id: card.id,
          parameter_id: parameterDetails.id,
          target: [
            "dimension",
            ["field", REVIEWS.RATING, { "base-type": "type/Integer" }],
          ],
        },
      ],
    };
  }

  function getModelDashcardDetails(dashboard, card) {
    return {
      dashboard_id: dashboard.id,
      card_id: card.id,
      parameter_mappings: [
        {
          card_id: card.id,
          parameter_id: parameterDetails.id,
          target: [
            "dimension",
            ["field", "RATING", { "base-type": "type/Integer" }],
          ],
        },
      ],
    };
  }

  function verifyFilterWithRemapping() {
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Search the list").type("Remapped");
      cy.findByText("Remapped").click();
      cy.button("Add filter").click();
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${REVIEWS.RATING}`, {
      semantic_type: "type/Category",
    });
    cy.request("POST", `/api/field/${REVIEWS.RATING}/dimension`, {
      type: "internal",
      name: "Rating",
    });
    cy.request("POST", `/api/field/${REVIEWS.RATING}/values`, {
      values: [[1, "Remapped"]],
    });
  });

  it("should be able to use remapped values from an integer field with an overridden semantic type used for a custom dropdown source in public dashboards (metabase#44047)", () => {
    H.createQuestion(sourceQuestionDetails);
    H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails, modelDetails],
    }).then(({ dashboard, questions: cards }) => {
      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          getQuestionDashcardDetails(dashboard, cards[0]),
          getModelDashcardDetails(dashboard, cards[1]),
        ],
      });
      cy.wrap(dashboard.id).as("dashboardId");
    });

    cy.log("verify filtering works in a regular dashboard");
    H.visitDashboard("@dashboardId");
    verifyFilterWithRemapping();

    cy.log("verify filtering works in a public dashboard");
    cy.get("@dashboardId").then(H.visitPublicDashboard);
    verifyFilterWithRemapping();
  });
});

describe("issue 45659", () => {
  const parameterDetails = {
    name: "ID",
    slug: "id",
    id: "f8ec7c71",
    type: "id",
    sectionId: "id",
    default: [10],
  };

  const questionDetails = {
    name: "People",
    query: { "source-table": PEOPLE_ID },
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  function createDashboard() {
    return H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails],
    }).then(({ dashboard, questions: [card] }) => {
      H.addOrUpdateDashboardCard({
        dashboard_id: dashboard.id,
        card_id: card.id,
        card: {
          parameter_mappings: [
            {
              card_id: card.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                ["field", PEOPLE.ID, { "base-type": "type/BigInteger" }],
              ],
            },
          ],
        },
      }).then(() => ({ dashboard }));
    });
  }

  function verifyFilterWithRemapping() {
    H.filterWidget().findByText("Tressa White").should("be.visible");
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${PEOPLE.ID}`, {
      has_field_values: "list",
    });
  });

  it("should remap initial parameter values in public dashboards (metabase#45659)", () => {
    createDashboard().then(({ dashboard }) =>
      H.visitPublicDashboard(dashboard.id),
    );
    verifyFilterWithRemapping();
  });

  it("should remap initial parameter values in embedded dashboards (metabase#45659)", () => {
    createDashboard().then(({ dashboard }) =>
      H.visitEmbeddedPage({
        resource: { dashboard: dashboard.id },
        params: {},
      }),
    );
    verifyFilterWithRemapping();
  });
});

describe("44266", () => {
  const filterDetails = {
    name: "Equal to",
    slug: "equal_to",
    id: "10c0d4ba",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails = {
    name: "44266",
    parameters: [filterDetails],
  };

  const regularQuestion = {
    name: "regular",
    query: { "source-table": PRODUCTS_ID, limit: 2 },
  };

  const nativeQuestion = {
    name: "native",
    native: {
      query:
        "SELECT * from products where true [[ and price > {{price}}]] limit 5;",
      "template-tags": {
        price: {
          type: "number",
          name: "price",
          id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
          "display-name": "Price",
        },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow mapping when native and regular questions can be mapped (metabase#44266)", () => {
    H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [regularQuestion, nativeQuestion],
    }).then(({ dashboard }) => {
      H.visitDashboard(dashboard.id);
      H.editDashboard();
      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Equal to")
        .click();

      H.getDashboardCard(1).findByText("Select…").click();

      H.popover().findByText("Price").click();

      H.getDashboardCard(1).findByText("Price").should("be.visible");
    });
  });
});

describe("issue 44790", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should handle string values passed to number and id filters (metabase#44790)", () => {
    const idFilter = {
      id: "92eb69ea",
      name: "ID",
      sectionId: "id",
      slug: "id",
      type: "id",
    };

    const numberFilter = {
      id: "10c0d4ba",
      name: "Equal to",
      slug: "equal_to",
      type: "number/=",
      sectionId: "number",
    };

    const peopleQuestionDetails = {
      query: { "source-table": PEOPLE_ID, limit: 5 },
    };

    H.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [idFilter, numberFilter],
      },
      questions: [peopleQuestionDetails],
    }).then(({ dashboard, questions: cards }) => {
      const [peopleCard] = cards;

      cy.wrap(dashboard.id).as("dashboardId");

      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: peopleCard.id,
            parameter_mappings: [
              {
                parameter_id: idFilter.id,
                card_id: peopleCard.id,
                target: ["dimension", ["field", PEOPLE.ID, null]],
              },
              {
                parameter_id: numberFilter.id,
                card_id: peopleCard.id,
                target: ["dimension", ["field", PEOPLE.LATITUDE, null]],
              },
            ],
          },
        ],
      });
    });

    cy.log("wrong value for id filter should be ignored");
    H.visitDashboard("@dashboardId", {
      params: {
        [idFilter.slug]: "{{test}}",
      },
    });
    H.getDashboardCard().should("contain", "borer-hudson@yahoo.com");

    cy.log("wrong value for number filter should be ignored");
    H.visitDashboard("@dashboardId", {
      params: {
        [numberFilter.slug]: "{{test}}",
        [idFilter.slug]: "1",
      },
    });
    H.getDashboardCard().should("contain", "borer-hudson@yahoo.com");
  });
});

describe("issue 34955", () => {
  function checkAppliedFilter(name, value) {
    cy.contains('[data-testid="parameter-widget"]', name, {
      exact: false,
    }).contains(value);
  }

  const ccName = "Custom Created At";

  const questionDetails = {
    name: "34955",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        [ccName]: [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime" },
        ],
      },
      fields: [
        [
          "field",
          ORDERS.ID,
          {
            "base-type": "type/BigInteger",
          },
        ],
        [
          "field",
          ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
          },
        ],
        [
          "expression",
          ccName,
          {
            "base-type": "type/DateTime",
          },
        ],
      ],
      limit: 2,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({
      questionDetails,
      cardDetails: {
        size_x: 16,
        size_y: 8,
      },
    }).then(({ body: { dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId");

      H.visitDashboard(dashboard_id);
      H.editDashboard();

      H.setFilter("Date picker", "Single Date", "On");
      connectFilterToColumn(ccName);

      H.setFilter("Date picker", "Date Range", "Between");
      connectFilterToColumn(ccName);

      H.saveDashboard();

      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByRole("columnheader").eq(-2).should("have.text", "Created At");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByRole("columnheader").eq(-1).should("have.text", ccName);
      H.tableInteractiveBody()
        .findAllByRole("gridcell")
        .filter(":contains(May 15, 2024, 8:04 AM)")
        .should("have.length", 2);
    });
  });

  it("should connect specific date filter (`Between`) to the temporal custom column (metabase#34955)", () => {
    cy.get("@dashboardId").then((dashboard_id) => {
      // Apply filter through URL to prevent the typing flakes
      cy.visit(`/dashboard/${dashboard_id}?on=&between=2024-01-01~2024-03-01`);
      checkAppliedFilter("Between", "January 1, 2024 - March 1, 2024");

      cy.findAllByTestId("cell-data")
        .filter(":contains(January 1, 2024, 7:26 AM)")
        .should("have.length", 2);
    });

    cy.get("@dashboardId").then((dashboard_id) => {
      // Apply filter through URL to prevent the typing flakes
      cy.visit(`/dashboard/${dashboard_id}?on=2024-01-01&between=`);
      checkAppliedFilter("On", "January 1, 2024");

      cy.findAllByTestId("cell-data")
        .filter(":contains(January 1, 2024, 7:26 AM)")
        .should("have.length", 2);
    });
  });

  function connectFilterToColumn(column) {
    H.getDashboardCard().within(() => {
      cy.findByText("Column to filter on");
      cy.findByText("Select…").click();
    });

    H.popover().within(() => {
      cy.findByText(column).click();
    });
  }
});

describe("issue 35852", () => {
  const model = {
    name: "35852 - sql",
    type: "model",
    native: {
      query: "SELECT * FROM PRODUCTS LIMIT 10",
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show filter values for a model based on sql query (metabase#35852)", () => {
    H.createNativeQuestion(model).then(({ body: { id: modelId } }) => {
      H.setModelMetadata(modelId, (field) => {
        if (field.display_name === "CATEGORY") {
          return {
            ...field,
            id: PRODUCTS.CATEGORY,
            display_name: "Category",
            semantic_type: "type/Category",
            fk_target_field_id: null,
          };
        }

        return field;
      });

      createDashboardWithFilterAndQuestionMapped(modelId);
      H.visitModel(modelId);
    });

    H.tableHeaderClick("Category");
    H.popover().findByText("Filter by this column").click();

    cy.log("Verify filter values are available");

    H.popover()
      .should("contain", "Gizmo")
      .should("contain", "Doohickey")
      .should("contain", "Gadget")
      .should("contain", "Widget");

    H.popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });

    cy.log("Verify filter is applied");

    cy.findAllByTestId("cell-data")
      .filter(":contains(Gizmo)")
      .should("have.length", 2);

    H.visitDashboard("@dashboardId");

    H.filterWidget().click();

    H.popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });

    H.getDashboardCard().findAllByText("Gizmo").should("have.length", 2);
  });

  function createDashboardWithFilterAndQuestionMapped(modelId) {
    const parameterDetails = {
      name: "Category",
      slug: "category",
      id: "2a12e66c",
      type: "string/=",
      sectionId: "string",
    };

    const dashboardDetails = {
      parameters: [parameterDetails],
    };

    const questionDetails = {
      name: "Q1",
      query: { "source-table": `card__${modelId}`, limit: 10 },
    };

    H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails],
    }).then(({ dashboard, questions: [card] }) => {
      cy.wrap(dashboard.id).as("dashboardId");

      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: card.id,
            parameter_mappings: [
              {
                card_id: card.id,
                parameter_id: parameterDetails.id,
                target: [
                  "dimension",
                  ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
                ],
              },
            ],
          },
        ],
      });
    });
  }
});

describe("issue 47097", () => {
  const questionDetails = {
    name: "Products",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const parameterDetails = {
    id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
    type: "string/=",
    name: "Category",
    slug: "category",
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it('should be able to use filters without "create-queries" permissions when coming from a dashboard (metabase#47097)', () => {
    cy.log("create a dashboard with a parameter mapped to a field with values");
    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        H.updateDashboardCards({
          dashboard_id,
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 12,
              size_y: 12,
              parameter_mappings: [
                {
                  parameter_id: parameterDetails.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                },
              ],
            },
          ],
        });
        cy.wrap(dashboard_id).as("dashboardId");
      },
    );

    cy.log("verify the field values in a dashboard");
    cy.signIn("nodata");
    H.visitDashboard("@dashboardId");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").should("be.visible");
      cy.findByPlaceholderText("Search the list").type("{esc}");
    });

    cy.log("drill-thru without filter values and check the dropdown");
    H.getDashboardCard().findByText("Products").click();
    H.queryBuilderHeader().should("be.visible");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").should("be.visible");
      cy.findByPlaceholderText("Search the list").type("{esc}");
    });
    H.queryBuilderHeader().findByLabelText("Back to Dashboard").click();
    H.getDashboardCard().should("be.visible");

    cy.log("add a filter value, drill-thru, and check the dropdown");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard().findByText("Products").click();
    H.queryBuilderHeader().should("be.visible");
    H.filterWidget().click();
    H.popover().findByText("Widget").should("be.visible");
  });
});

describe("issue 48524", () => {
  const questionDetails = {
    name: "15119",
    query: { "source-table": REVIEWS_ID },
  };

  const ratingFilter = {
    id: "5dfco74e",
    slug: "rating",
    name: "Rating",
    type: "string/=",
    sectionId: "string",
  };

  const reviewerFilter = {
    id: "ad1c877e",
    name: "Reviewer",
    slug: "reviewer",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = { parameters: [reviewerFilter, ratingFilter] };

  function createDashboard() {
    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        H.updateDashboardCards({
          dashboard_id,
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 12,
              size_y: 8,
              parameter_mappings: [
                {
                  parameter_id: ratingFilter.id,
                  card_id,
                  target: ["dimension", ["field", REVIEWS.RATING, null]],
                },
                {
                  parameter_id: reviewerFilter.id,
                  card_id,
                  target: ["dimension", ["field", REVIEWS.REVIEWER, null]],
                },
              ],
            },
          ],
        });
        cy.wrap(dashboard_id).as("dashboardId");
      },
    );
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not apply last used parameter values when some parameters have values set in the URL (metabase#48524)", () => {
    createDashboard();

    cy.log(
      "open the dashboard with 2 parameters to populate their last used values",
    );
    H.visitDashboard("@dashboardId", {
      params: {
        [reviewerFilter.slug]: ["abbey-heidenreich"],
        [ratingFilter.slug]: 4,
      },
    });
    H.assertTableRowsCount(1);

    cy.log(
      "open the dashboard again and verify that the last used values are applied",
    );
    H.visitDashboard("@dashboardId");
    H.assertTableRowsCount(1);

    cy.log(
      "open the dashboard with only 1 parameter value and verify that the last used values are not applied in this case",
    );
    H.visitDashboard("@dashboardId", {
      params: {
        [ratingFilter.slug]: 4,
      },
    });
    H.assertTableRowsCount(535);
  });
});

describe("issue 32573", () => {
  const modelDetails = {
    name: "M1",
    type: "model",
    query: {
      "source-table": ORDERS_ID,
      fields: [["field", ORDERS.TAX, null]],
    },
  };

  const parameterDetails = {
    id: "92eb69ea",
    name: "ID",
    sectionId: "id",
    slug: "id",
    type: "id",
    default: 1,
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  function getQuestionDetails(modelId) {
    return {
      name: "Q1",
      type: "question",
      query: {
        "source-table": `card__${modelId}`,
      },
    };
  }

  function getParameterMapping(questionId) {
    return {
      card_id: questionId,
      parameter_id: parameterDetails.id,
      target: [
        "dimension",
        ["field", "ID", { "base-type": "type/BigInteger" }],
      ],
    };
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not crash a dashboard when there is a missing parameter column (metabase#32573)", () => {
    H.createQuestion(modelDetails).then(({ body: model }) => {
      H.createQuestion(getQuestionDetails(model.id)).then(
        ({ body: question }) => {
          H.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
            return cy
              .request("PUT", `/api/dashboard/${dashboard.id}`, {
                dashcards: [
                  createMockDashboardCard({
                    card_id: question.id,
                    parameter_mappings: [getParameterMapping(question.id)],
                    size_x: 6,
                    size_y: 6,
                  }),
                ],
              })
              .then(() => H.visitDashboard(dashboard.id));
          });
        },
      );
    });
    H.getDashboardCard()
      .findByText("There was a problem displaying this chart.")
      .should("be.visible");

    H.editDashboard();
    cy.findByTestId("fixed-width-filters").findByText("ID").click();
    H.getDashboardCard().within(() => {
      cy.findByText("Unknown Field").should("be.visible");
      cy.findByLabelText("Disconnect").click();
    });
    H.saveDashboard();
    H.getDashboardCard().within(() => {
      cy.findByText("Q1").should("be.visible");
      cy.findByText("Tax").should("be.visible");
    });
  });
});

describe("issue 45670", { tags: ["@external"] }, () => {
  const dialect = "postgres";
  const tableName = "many_data_types";

  const parameterDetails = {
    id: "92eb69ea",
    name: "boolean",
    type: "string/=",
    slug: "boolean",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  function getField() {
    return cy.request("GET", "/api/table").then(({ body: tables }) => {
      const table = tables.find((table) => table.name === tableName);
      return cy
        .request("GET", `/api/table/${table.id}/query_metadata`)
        .then(({ body: metadata }) => {
          const { fields } = metadata;
          return fields.find((field) => field.name === "boolean");
        });
    });
  }

  function getQuestionDetails(fieldId) {
    return {
      database: WRITABLE_DB_ID,
      native: {
        query: "SELECT id, boolean FROM many_data_types WHERE {{boolean}}",
        "template-tags": {
          boolean: {
            id: "4b77cc1f-ea70-4ef6-84db-58432fce6928",
            name: "boolean",
            type: "dimension",
            "display-name": "Boolean",
            dimension: ["field", fieldId, null],
            "widget-type": "string/=",
          },
        },
      },
    };
  }

  function getParameterMapping(cardId) {
    return {
      card_id: cardId,
      parameter_id: parameterDetails.id,
      target: ["dimension", ["template-tag", parameterDetails.name]],
    };
  }

  beforeEach(() => {
    H.restore(`${dialect}-writable`);
    H.resetTestTable({ type: dialect, table: tableName });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName });
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should be able to pass query string parameters for boolean parameters in dashboards (metabase#45670)", () => {
    getField().then((field) => {
      H.createNativeQuestion(getQuestionDetails(field.id)).then(
        ({ body: card }) => {
          H.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
            cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
              dashcards: [
                createMockDashboardCard({
                  card_id: card.id,
                  parameter_mappings: [getParameterMapping(card.id, field.id)],
                  size_x: 8,
                  size_y: 8,
                }),
              ],
            });
            H.visitDashboard(dashboard.id, {
              params: {
                [parameterDetails.slug]: "true",
              },
            });
          });
        },
      );
    });
    H.filterWidget().should("contain.text", "true");
    H.getDashboardCard().within(() => {
      cy.findByText("true").should("be.visible");
      cy.findByText("false").should("not.exist");
    });
  });
});

describe("issue 48351", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should navigate to the specified tab with click behaviors (metabase#48351)", () => {
    H.createDashboardWithTabs({
      name: "Dashboard 1",
      tabs: [
        { id: 1, name: "Tab 1" },
        { id: 2, name: "Tab 2" },
      ],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: 1,
          size_x: 8,
          size_y: 8,
        }),
        createMockDashboardCard({
          id: -2,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: 2,
          col: 8,
          size_x: 8,
          size_y: 8,
        }),
      ],
    }).then((dashboard1) => {
      H.createDashboardWithTabs({
        name: "Dashboard 2",
        tabs: [
          { id: 3, name: "Tab 3" },
          { id: 4, name: "Tab 4" },
        ],
        dashcards: [
          createMockDashboardCard({
            id: -1,
            card_id: ORDERS_QUESTION_ID,
            dashboard_tab_id: 3,
            size_x: 8,
            size_y: 8,
          }),
          createMockDashboardCard({
            id: -2,
            card_id: ORDERS_QUESTION_ID,
            dashboard_tab_id: 4,
            visualization_settings: {
              column_settings: {
                '["name","ID"]': {
                  click_behavior: {
                    type: "link",
                    linkType: "dashboard",
                    targetId: dashboard1.id,
                    tabId: dashboard1.tabs[1].id,
                    parameterMapping: {},
                  },
                },
              },
            },
            col: 8,
            size_x: 8,
            size_y: 8,
          }),
        ],
      }).then((dashboard2) => H.visitDashboard(dashboard2.id));
    });
    H.goToTab("Tab 4");
    H.getDashboardCard().within(() =>
      cy.findAllByRole("gridcell").eq(0).click(),
    );
    cy.findByTestId("dashboard-name-heading").should(
      "have.value",
      "Dashboard 1",
    );
    H.assertTabSelected("Tab 2");
  });
});

describe("issue 52484", () => {
  const questionDetails = {
    native: {
      query: "SELECT ID, RATING FROM PRODUCTS [[WHERE RATING = {{rating}}]]",
      "template-tags": {
        rating: {
          id: "56708d23-6f01-42b7-98ed-f930295d31b9",
          name: "rating",
          type: "number",
          "display-name": "Rating",
        },
      },
    },
    parameters: [
      {
        id: "56708d23-6f01-42b7-98ed-f930295d31b9",
        name: "Rating",
        slug: "rating",
        type: "number/=",
        target: ["dimension", ["template-tag", "rating"]],
      },
    ],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow to use click behaviors with numeric columns that are not database fields (metabase#52484)", () => {
    H.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      },
    );

    cy.log("setup a dashboard with a click behavior");
    H.editDashboard();
    H.setFilter("Number", "Equal to");
    H.selectDashboardFilter(H.getDashboardCard(), "Rating");
    H.dashboardParametersDoneButton().click();
    H.showDashboardCardActions();
    cy.findByLabelText("Click behavior").click();
    H.sidebar().within(() => {
      cy.findByText("ID").click();
      cy.findByText("Update a dashboard filter").click();
      cy.findByText("Number").click();
    });
    H.popover().findByText("ID").click();
    H.saveDashboard();

    cy.log("update a dashboard filter by clicking on a ID column value");
    H.getDashboardCard().findByText("2").click();
    H.filterWidget().findByDisplayValue("2").should("be.visible");

    cy.log("verify query results for the new filter");
    H.getDashboardCard().within(() => {
      cy.findByText("27").should("be.visible");
      cy.findByText("123").should("be.visible");
    });
  });
});

describe("issue 40396", { tags: "@external " }, () => {
  const tableName = "many_data_types";

  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: tableName });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should be possible to use dashboard filters with native enum fields (metabase#40396)", () => {
    cy.log("create a dashboard with a question with a type/Enum field");
    cy.request("GET", "/api/table").then(({ body: tables }) => {
      const table = tables.find((table) => table.name === tableName);
      cy.request("GET", `/api/table/${table.id}/query_metadata`).then(
        ({ body: metadata }) => {
          const field = metadata.fields.find((field) => field.name === "enum");
          cy.request("PUT", `/api/field/${field.id}`, {
            semantic_type: "type/Enum",
          });

          H.createQuestionAndDashboard({
            questionDetails: {
              database: table.db_id,
              query: { "source-table": table.id },
            },
          }).then(({ body: { dashboard_id } }) => {
            H.visitDashboard(dashboard_id);
            cy.wait("@dashcardQuery");
          });
        },
      );
    });

    cy.log("verify that a enum field can be mapped to a parameter");
    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.selectDashboardFilter(H.getDashboardCard(), "Enum");
    H.saveDashboard();

    cy.log("verify that filtering on a enum field works");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("beta").click();
      cy.button("Add filter").click();
    });
    cy.wait("@dashcardQuery");
    H.tableInteractiveScrollContainer().scrollTo("right");
    H.getDashboardCard().findAllByText("beta").should("have.length.gte", 1);
  });
});

describe("issue 52627", () => {
  const questionDetails = {
    display: "bar",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["avg", ["field", ORDERS.TOTAL, null]],
        ["avg", ["field", ORDERS.DISCOUNT, null]],
      ],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  };

  const parameterDetails = {
    name: "Category",
    slug: "category",
    id: "b6ed2d71",
    type: "string/=",
    sectionId: "string",
    default: ["Gadget"],
  };

  const parameterTarget = [
    "dimension",
    ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
    { "stage-number": 0 },
  ];

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should remove an empty query stage after a dashboard drill-thru (metabase#52627)", () => {
    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        H.addOrUpdateDashboardCard({
          dashboard_id,
          card_id,
          card: {
            id,
            parameter_mappings: [
              {
                card_id: card_id,
                parameter_id: parameterDetails.id,
                target: parameterTarget,
              },
            ],
          },
        });
        H.visitDashboard(dashboard_id);
      },
    );
    H.chartPathWithFillColor("#A989C5").first().click();
    H.popover().findByText("See this month by week").click();
    cy.wait("@dataset");
    cy.findByTestId("qb-filters-panel").findByText(
      "Product → Category is Gadget",
    );
    H.summarize();
    H.rightSidebar().findByText("Average of Total").should("be.visible");
  });
});

describe("issue 52918", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should re-position the parameter dropdown when its size changes (metabase#52918)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.setFilter("Date picker", "All Options");
    H.sidebar().findByLabelText("No default").click();
    H.popover().within(() => {
      cy.findByText("Fixed date range…").click();
      cy.findByText("Between").should("be.visible");
    });
    cy.log("check that there is no overflow in the popover");
    H.popover().should(([element]) => {
      expect(element.offsetWidth).to.gte(element.scrollWidth);
    });
  });
});

describe("issue 54236", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.clock(new Date("2025-02-26"));
  });

  it("should show correct date range in the date picker (metabase#54236)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.setFilter("Date picker", "All Options");
    H.sidebar().findByLabelText("No default").click();
    H.popover().within(() => {
      cy.findByText("Relative date range…").click();
      cy.findByText("Next").click();
      cy.findByDisplayValue("30").clear().type("1");
      cy.findAllByDisplayValue("day").filter(":visible").click();
    });
    H.popover().should("have.length", 2).last().findByText("quarter").click();
    H.popover().within(() => {
      cy.icon("arrow_left_to_line").click();
      cy.findByDisplayValue("4").clear().type("1");
      cy.findByText("Jul 1 – Sep 30, 2025").should("be.visible");
      cy.findByText("Apr 1 – Jun 30, 2025").should("not.exist");
    });
  });
});

describe("issue 17061", () => {
  const questionDetails = {
    query: {
      "source-table": PEOPLE_ID,
      "order-by": [["asc", ["field", PEOPLE.ID, null]]],
      limit: 1,
    },
  };

  const parameterDetails = {
    name: "State",
    slug: "state",
    id: "5aefc725",
    type: "string/=",
    sectionId: "location",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  const getParameterMapping = (cardId) => ({
    parameter_id: parameterDetails.id,
    card_id: cardId,
    target: ["dimension", ["field", "STATE", { "base-type": "type/Text" }]],
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/public/dashboard/*/dashcard/*/card/*").as(
      "publicDashcardData",
    );
  });

  it("should not send multiple query requests for the same dashcards when opening a public dashboard with parameters (metabase#17061)", () => {
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: dashcard, questionId }) => {
      H.updateDashboardCards({
        dashboard_id: dashcard.dashboard_id,
        cards: [
          {
            card_id: questionId,
            parameter_mappings: [getParameterMapping(questionId)],
          },
        ],
      });
      H.visitPublicDashboard(dashcard.dashboard_id);
    });

    H.getDashboardCard().findByText("1").should("be.visible");
    cy.get("@publicDashcardData.all").should("have.length", 1);
  });
});

// TODO ranquild unskip after v54 release
describe("issue 48824", { tags: "@skip" }, () => {
  const dateParameter = {
    id: "abc",
    name: "Date filter",
    slug: "filter-date",
    type: "date/all-options",
    default: "past30days-from-7days",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should correctly translate relative filters in dashboards (metabase#48824)", () => {
    cy.log("set locale");
    cy.request("GET", "/api/user/current").then(({ body: user }) => {
      cy.request("PUT", `/api/user/${user.id}`, { locale: "de" });
    });

    cy.log("add a date parameter with a relative default value to a dashboard");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [dateParameter],
    });
    H.updateDashboardCards({
      dashboard_id: ORDERS_DASHBOARD_ID,
      cards: [
        {
          card_id: ORDERS_QUESTION_ID,
          parameter_mappings: [
            {
              card_id: ORDERS_QUESTION_ID,
              parameter_id: dateParameter.id,
              target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
            },
          ],
        },
      ],
    });

    cy.log("check translations");
    H.visitDashboard(ORDERS_DASHBOARD_ID, {
      params: { [dateParameter.slug]: "past30days" },
    });

    cy.log("Previous 30 days");
    H.filterWidget().findByText("Vorheriger 30 Tage").should("be.visible");
    H.filterWidget().icon("revert").click();

    cy.log("Previous 30 days, starting 7 days ago");
    H.filterWidget()
      .findByText("Vorheriger 30 Tage, ab vor 7 tage")
      .should("be.visible");
  });
});

describe("issue 62627", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  function toggleLinkedFilter(parameterName) {
    cy.button(parameterName)
      .parent()
      .findByRole("switch")
      .click({ force: true });
  }

  it("should properly link inline parameters (metabase#62627)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    cy.log("add a top-level filter");
    H.setFilter("Text or Category", "Is");
    H.selectDashboardFilter(H.getDashboardCard(), "Vendor");
    H.setDashboardParameterName("Vendor");
    H.dashboardParameterSidebar().button("Done").click();

    cy.log("add an inline card filter");
    H.showDashboardCardActions();
    H.getDashboardCard()
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Add a filter")
      .click();
    H.popover().findByText("Text or Category").click();
    H.selectDashboardFilter(H.getDashboardCard(), "Category");
    H.setDashboardParameterName("Category");
    H.dashboardParameterSidebar().within(() => {
      cy.findByText("Linked filters").click();
      toggleLinkedFilter("Vendor");
    });
    H.saveDashboard();

    cy.log(
      "verify that the inline parameter is linked to the top-level parameter",
    );
    H.dashboardParametersContainer().within(() => H.filterWidget().click());
    H.popover().within(() => {
      cy.findByText("Balistreri-Muller").click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard().within(() => H.filterWidget().click());
    H.popover().within(() => {
      cy.findByText("Widget").should("be.visible");
      cy.findByText("Gadget").should("not.exist");
    });

    cy.log("make the top-level parameter be linked to the inline parameter");
    H.editDashboard();
    H.getDashboardCard().findByTestId("editing-parameter-widget").click();
    H.dashboardParameterSidebar().within(() => {
      cy.findByText("Linked filters").click();
      toggleLinkedFilter("Vendor");
    });
    H.editingDashboardParametersContainer()
      .findByTestId("editing-parameter-widget")
      .click();
    H.dashboardParameterSidebar().within(() => {
      cy.findByText("Linked filters").click();
      toggleLinkedFilter("Category");
    });
    H.saveDashboard();

    cy.log(
      "verify that the top-level parameter is linked to the inline parameter",
    );
    H.dashboardParametersContainer().within(() =>
      H.filterWidget().icon("close").click(),
    );
    H.getDashboardCard().within(() => H.filterWidget().click());
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.dashboardParametersContainer().within(() => H.filterWidget().click());
    H.popover().within(() => {
      cy.findByText("Barrows-Johns").should("be.visible");
      cy.findByText("Americo Sipes and Sons").should("not.exist");
    });
  });
});

describe("issue 55678", () => {
  const parameterDetails = {
    name: "date",
    slug: "date",
    id: "f8ec7c71",
    type: "date/all-options",
    sectionId: "date",
    default: "2020-01-01~2024-12-31",
  };

  const questionDetails = {
    name: "Orders",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
      ],
    },
    display: "line",
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  function setupDashboard() {
    return H.createQuestion(questionDetails).then(
      ({ body: { id: card_id } }) => {
        H.createDashboard(dashboardDetails).then(
          ({ body: { id: dashboard_id } }) => {
            H.addOrUpdateDashboardCard({
              dashboard_id,
              card_id,
              card: {
                parameter_mappings: [
                  {
                    card_id,
                    parameter_id: parameterDetails.id,
                    target: [
                      "dimension",
                      ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
                      { "stage-number": 1 },
                    ],
                  },
                ],
              },
            });
            H.visitDashboard(dashboard_id);
          },
        );
      },
    );
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should ignore parameters mapped to post-aggregation stages when doing query drills (metabase#55678)", () => {
    setupDashboard();
    H.getDashboardCard().within(() => {
      H.cartesianChartCircle().first().click();
    });
    H.popover().findByText("See this Order").click();
    H.queryBuilderFiltersPanel()
      .findByText("Created At: Month is Apr 1–30, 2022")
      .should("be.visible");
    H.assertQueryBuilderRowCount(1);
  });
});

describe("issue 14595", () => {
  const dialect = "postgres";
  const tableName = "many_data_types";

  function createDashboard() {
    return H.getTableId({ name: tableName }).then((tableId) => {
      return H.createDashboardWithQuestions({
        dashboardDetails: {
          parameters: [
            createMockParameter({
              id: "p1",
              slug: "p1",
              name: "p1",
              type: "string/=",
              sectionId: "string",
            }),
            createMockParameter({
              id: "p2",
              slug: "p2",
              name: "p2",
              type: "string/=",
              sectionId: "string",
            }),
            createMockParameter({
              id: "p3",
              slug: "p3",
              name: "p3",
              type: "string/=",
              sectionId: "string",
            }),
          ],
        },
        questions: [
          {
            name: "Orders",
            query: { "source-table": ORDERS_ID },
          },
          {
            name: "Products",
            query: { "source-table": PRODUCTS_ID },
          },
          {
            name: "Many data types",
            database: WRITABLE_DB_ID,
            query: { "source-table": tableId },
          },
        ],
      }).then(({ dashboard }) => {
        return dashboard.id;
      });
    });
  }

  function mapParameters() {
    cy.findByTestId("fixed-width-filters").findByText("p1").click();
    H.selectDashboardFilter(H.getDashboardCard(0), "Source");
    cy.findByTestId("fixed-width-filters").findByText("p2").click();
    H.selectDashboardFilter(H.getDashboardCard(1), "Category");
    cy.findByTestId("fixed-width-filters").findByText("p3").click();
    H.selectDashboardFilter(H.getDashboardCard(2), "String");
  }

  function assertLinkedFilterSettings({
    parameterName,
    compatibleParameterNames,
    incompatibleParameterNames,
  }) {
    cy.findByTestId("fixed-width-filters").findByText(parameterName).click();
    H.sidebar().within(() => {
      cy.findByText("Linked filters").click();
      compatibleParameterNames.forEach((compatibleParameterName) => {
        cy.findByTestId("compatible-parameters")
          .findByText(compatibleParameterName)
          .should("be.visible");
      });
      incompatibleParameterNames.forEach((incompatibleParameterName) => {
        cy.findByTestId("incompatible-parameters")
          .findByText(incompatibleParameterName)
          .should("be.visible");
      });
    });
  }

  function assertParameterSettings() {
    assertLinkedFilterSettings({
      parameterName: "p1",
      compatibleParameterNames: ["p2"],
      incompatibleParameterNames: ["p3"],
    });
    assertLinkedFilterSettings({
      parameterName: "p2",
      compatibleParameterNames: ["p1"],
      incompatibleParameterNames: ["p3"],
    });
    assertLinkedFilterSettings({
      parameterName: "p3",
      compatibleParameterNames: [],
      incompatibleParameterNames: ["p1", "p2"],
    });
  }

  beforeEach(() => {
    H.restore(`${dialect}-writable`);
    H.resetTestTable({ type: dialect, table: tableName });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName });
  });

  it("should not see parameters that cannot be linked to the current parameter in parameter settings (metabase#14595)", () => {
    createDashboard().then((dashboardId) => H.visitDashboard(dashboardId));
    H.editDashboard();
    mapParameters();
    assertParameterSettings();
  });
});

describe("issue 44090", () => {
  const parameterDetails = {
    name: "p1",
    slug: "string",
    id: "f8ec7c71",
    type: "string/=",
  };

  const questionDetails = {
    name: "Orders",
    query: {
      "source-table": REVIEWS_ID,
    },
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestion(questionDetails).then(({ body: { id: card_id } }) => {
      H.createDashboard(dashboardDetails).then(
        ({ body: { id: dashboard_id } }) => {
          H.addOrUpdateDashboardCard({
            dashboard_id,
            card_id,
            card: {
              parameter_mappings: [
                {
                  card_id,
                  parameter_id: parameterDetails.id,
                  target: ["dimension", ["field", REVIEWS.BODY, {}]],
                },
              ],
            },
          });
          H.visitDashboard(dashboard_id);
        },
      );
    });
  });

  it("should not overflow the dashboard header when a filter contains a long value that contains spaces (metabase#44090)", () => {
    const LONG_VALUE =
      "Minima non hic doloribus ipsa dolore ratione in numquam. Minima eos vel harum velit. Consequatur consequuntur culpa sed eum";

    H.filterWidget().click();
    H.popover()
      .first()
      .within(() => {
        cy.findByPlaceholderText("Search the list").type(LONG_VALUE);
        cy.button("Add filter").click();
      });

    H.filterWidget().then(($el) => {
      const { width } = $el[0].getBoundingClientRect();
      cy.wrap(width).should("be.lt", 300);
    });
  });

  it("should not overflow the dashboard header when a filter contains a long value that does not contain spaces (metabase#44090)", () => {
    const LONG_VALUE =
      "MinimanonhicdoloribusipsadolorerationeinnumquamMinimaeosvelharumvelitConsequaturconsequunturculpasedeum";

    H.filterWidget().click();
    H.popover()
      .first()
      .within(() => {
        cy.findByPlaceholderText("Search the list").type(LONG_VALUE);
        cy.button("Add filter").click();
      });

    H.filterWidget().then(($el) => {
      const { width } = $el[0].getBoundingClientRect();
      cy.wrap(width).should("be.lt", 300);
    });
  });
});

describe("issue 47951", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should do X (metabase#47951)", () => {
    cy.log("set up permissions");
    cy.updatePermissionsGraph({
      [USER_GROUPS.ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "no",
        },
      },
      [USER_GROUPS.DATA_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "no",
        },
      },
    });

    cy.log("set up remapping");
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });
    cy.request("PUT", `/api/field/${REVIEWS.PRODUCT_ID}`, {
      has_field_values: "list",
    });
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });
    cy.request("POST", `/api/field/${REVIEWS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    cy.log("create a dashboard");
    const parameter = createMockParameter({
      id: "p1",
      slug: "p1",
      type: "id",
      sectionId: "id",
      default: 1,
    });
    H.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [parameter],
      },
      questions: [
        { name: "q1", query: { "source-table": ORDERS_ID } },
        { name: "q2", query: { "source-table": REVIEWS_ID } },
      ],
    }).then(({ dashboard: dashboard, questions: [card1, card2] }) => {
      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: card1.id,
            parameter_mappings: [
              {
                card_id: card1.id,
                parameter_id: parameter.id,
                target: ["dimension", ["field", ORDERS.PRODUCT_ID, null]],
              },
            ],
          },
          {
            card_id: card2.id,
            parameter_mappings: [
              {
                card_id: card2.id,
                parameter_id: parameter.id,
                target: ["dimension", ["field", REVIEWS.PRODUCT_ID, null]],
              },
            ],
          },
        ],
      });
      cy.wrap(dashboard.id).as("dashboardId");
    });

    cy.log("log in as a normal user and open the dashboard");
    cy.signInAsNormalUser();
    H.visitDashboard("@dashboardId");

    cy.log("check remapping for default values");
    H.filterWidget().findByText("Rustic Paper Wallet").should("be.visible");

    cy.log("check remapping for dropdown values");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Rustic Paper Wallet").should("be.visible");
      cy.findByText("Aerodynamic Bronze Hat").should("be.visible");
    });
  });
});

describe("issue 59306", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    const parameter = createMockParameter({
      id: "p1",
      slug: "p1",
      type: "string/=",
      sectionId: "string",
      default: undefined,
      values_query_type: "none",
    });

    H.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [parameter],
      },
      questions: [{ name: "q1", query: { "source-table": PRODUCTS_ID } }],
    }).then(({ dashboard, questions: [card] }) => {
      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: card.id,
            parameter_mappings: [
              {
                card_id: card.id,
                parameter_id: parameter.id,
                target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                has_field_values: "input",
              },
            ],
          },
        ],
      }).then(() => {
        H.visitDashboard(dashboard.id);
      });
    });
  });

  it("should not overflow the filter box (metabase#59306)", () => {
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter some text")
        .type("asdf".repeat(20))
        .invoke("outerWidth")
        .should("be.lt", 400);
    });
  });
});

describe("Issue 60987", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({
      questionDetails: {
        type: "question",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              "source-table": PRODUCTS_ID,
              fields: "all",
              strategy: "left-join",
              alias: "Products",
              condition: [
                "=",
                [
                  "field",
                  ORDERS.PRODUCT_ID,
                  {
                    "base-type": "type/Integer",
                  },
                ],
                [
                  "field",
                  PRODUCTS.ID,
                  {
                    "base-type": "type/BigInteger",
                    "join-alias": "Products",
                  },
                ],
              ],
            },
          ],
        },
      },
    }).then((response) => {
      H.visitDashboard(response.body.dashboard_id);
    });
  });

  it("should show the empty state for parameters when searching the in the parameter target picker popover (metabase#60987)", () => {
    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.getDashboardCard().findByText("Select…").click();
    H.popover().findByPlaceholderText("Find...").type("aa");
    H.popover().findByText("Didn't find any results").should("be.visible");
  });
});

describe("Issue 60987", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({
      questionDetails: {
        type: "question",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              "source-table": PRODUCTS_ID,
              fields: "all",
              strategy: "left-join",
              alias: "Products",
              condition: [
                "=",
                [
                  "field",
                  ORDERS.PRODUCT_ID,
                  {
                    "base-type": "type/Integer",
                  },
                ],
                [
                  "field",
                  PRODUCTS.ID,
                  {
                    "base-type": "type/BigInteger",
                    "join-alias": "Products",
                  },
                ],
              ],
            },
          ],
        },
      },
    }).then((response) => {
      H.visitDashboard(response.body.dashboard_id);
    });

    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.getDashboardCard().findByText("Select…").click();
  });

  it("should show the empty state for parameters when searching the in the parameter target picker popover (metabase#60987)", () => {
    H.popover().within(() => {
      cy.findByPlaceholderText("Find...").type("aa");
      cy.findByText("Didn't find any results")
        .should("be.visible")
        .should("have.css", "color", "rgba(7, 23, 34, 0.62)"); // the text "text-medium"
    });
  });
});

describe("Issue 46767", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({
      questionDetails: {
        type: "question",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              "source-table": PRODUCTS_ID,
              fields: "all",
              strategy: "left-join",
              alias: "Products",
              condition: [
                "=",
                [
                  "field",
                  ORDERS.PRODUCT_ID,
                  {
                    "base-type": "type/Integer",
                  },
                ],
                [
                  "field",
                  PRODUCTS.ID,
                  {
                    "base-type": "type/BigInteger",
                    "join-alias": "Products",
                  },
                ],
              ],
            },
          ],
        },
      },
    }).then((response) => {
      H.visitDashboard(response.body.dashboard_id);
    });

    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.getDashboardCard().findByText("Select…").click();
  });

  it("search results for parameter target picker should not show empty sections (metabase#46767)", () => {
    H.popover().within(() => {
      cy.findByPlaceholderText("Find...").type("Ean");
      cy.findByText("Products").should("be.visible");
      cy.findByText("User").should("not.exist");
    });
  });
});

describe("issue 46541", () => {
  const TARGET_FILTER = {
    name: "Target filter",
    slug: "target-filter",
    id: "ffa421da",
    type: "number/>=",
    sectionId: "number",
  };

  const OTHER_FILTER = {
    name: "Other filter",
    slug: "other-filter",
    id: "dfaa3356",
    type: "number/>=",
    sectionId: "number",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({
      questionDetails: {
        query: { "source-table": ORDERS_ID },
      },
      dashboardDetails: {
        name: "Dashboard A",
      },
    }).then(({ body }) => {
      cy.wrap(body.dashboard_id).as("dashboardA");

      H.createQuestionAndDashboard({
        questionDetails: {
          query: { "source-table": ORDERS_ID },
        },
        dashboardDetails: {
          name: "Dashboard B",
          parameters: [TARGET_FILTER, OTHER_FILTER],
        },
      }).then(({ body }) => {
        cy.wrap(body.dashboard_id).as("dashboardB");

        H.updateDashboardCards({
          dashboard_id: body.dashboard_id,
          cards: [
            {
              card_id: body.card_id,
              parameter_mappings: [
                {
                  parameter_id: TARGET_FILTER.id,
                  card_id: body.card_id,
                  target: ["dimension", ["field", ORDERS.TOTAL, null]],
                },
                {
                  parameter_id: OTHER_FILTER.id,
                  card_id: body.card_id,
                  target: ["dimension", ["field", ORDERS.SUBTOTAL, null]],
                },
              ],
            },
          ],
        });

        cy.log("Set parameter value on Dashboard B");
        H.visitDashboard("@dashboardB");
        H.filterWidget(OTHER_FILTER).click();
        H.popover().within(() => {
          cy.findByPlaceholderText("Enter a number").type("10");
          cy.button("Add filter").click();
        });

        cy.log("Set up click behaviour on Dashboard A");
        H.visitDashboard("@dashboardA");
        H.editDashboard();

        H.showDashboardCardActions();
        cy.findByLabelText("Click behavior").click();

        H.sidebar().within(() => {
          cy.findByText("Tax").click();
          cy.findByText("Go to a custom destination").click();
          cy.findByText("Dashboard").click();
        });

        H.entityPickerModal().within(() => {
          cy.findByText("Our analytics").click();
          cy.findByText("Dashboard B").click();
        });

        H.sidebar().findByText(TARGET_FILTER.name).click();
        H.popover().findByText("Tax").click();
        H.saveDashboard();
      });
    });
  });

  it("should reset other filters when coming to a dashboard from a click action with a filter (metabase#46541)", () => {
    cy.log("Navigate from Dashboard A to Dashboard B with a click action");
    H.tableInteractiveBody().findByText("2.07").click();

    H.filterWidget(TARGET_FILTER).should("contain", "2.07");
    H.filterWidget(OTHER_FILTER).should("not.contain", "10");
  });
});

describe("issue 46372", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not show a scrollbar when auto-connecting a dashcard filter (metabase#46372)", () => {
    H.createDashboardWithQuestions({
      questions: [
        { name: "Question A", query: { "source-table": PRODUCTS_ID } },
        { name: "Question B", query: { "source-table": PRODUCTS_ID } },
      ],
    }).then(({ dashboard }) => {
      H.visitDashboard(dashboard.id);
      H.editDashboard(dashboard.id);

      H.setFilter("Text or Category", "Is");
      H.selectDashboardFilter(cy.findAllByTestId("dashcard").first(), "Title");
      H.undoToast().findByRole("button", { name: "Auto-connect" }).click();

      H.main().findByText("Auto-connected").should("be.visible");
      H.main()
        .findByText("Auto-connected")
        .parent()
        .parent()
        .then(($body) => {
          cy.wrap($body[0].scrollHeight).should("eq", $body[0].offsetHeight);
        });
    });
  });
});

describe("issue 49319", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should ignore parameters that not exist in the saved dashboard in edit mode (metabase#49319)", () => {
    cy.log("open an existing dashboard");
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.log("add a parameter and save the dashboard");
    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.selectDashboardFilter(H.getDashboardCard(), "Vendor");
    H.saveDashboard();

    cy.log("add another parameter to the dashboard with a default value");
    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.selectDashboardFilter(H.getDashboardCard(), "Category");
    H.dashboardParameterSidebar().findByText("No default").click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.dashboardParameterSidebar().button("Done").click();

    cy.log("change the value for the saved parameter");
    cy.findByTestId("fixed-width-filters").findByText("Text").click();
    H.dashboardParameterSidebar().findByText("No default").click();
    H.popover().within(() => {
      cy.findByText("Americo Sipes and Sons").click();
      cy.findByText("Barrows-Johns").click();
      cy.button("Add filter").click();
    });
    H.dashboardParameterSidebar().button("Done").click();

    cy.log("the unsaved parameter should be ignored in edit mode");
    H.assertTableRowsCount(179);

    cy.log("both parameters should be applied when the dashboard is saved");
    H.saveDashboard();
    H.assertTableRowsCount(82);
  });
});

describe("issue #66670", () => {
  const questionA = {
    name: "Question A",
    query: {
      "source-table": PRODUCTS_ID,
      limit: 10,
    },
  };

  const questionB = {
    name: "Question B",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");
    cy.intercept("GET", "/api/revision*").as("revisionHistory");
  });

  it("should handle dashboard filter with permanently deleted question value source (metabase#66670)", () => {
    cy.log("Step 1: Create a new dashboard");
    H.createDashboard({ name: "Test Dashboard UXW-2494" }).then(
      ({ body: { id: dashboardId } }) => {
        cy.log("Step 2: Add Question A to the dashboard");
        H.createQuestion(questionA).then(({ body: { id: questionAId } }) => {
          H.updateDashboardCards({
            dashboard_id: dashboardId,
            cards: [
              {
                card_id: questionAId,
                row: 0,
                col: 0,
                size_x: 12,
                size_y: 8,
              },
            ],
          });

          cy.log("Step 3: Create Question B (not added to dashboard)");
          H.createQuestion(questionB).then(({ body: { id: questionBId } }) => {
            cy.log(
              "Step 4: Edit dashboard, add filter with Question B as value source",
            );
            H.visitDashboard(dashboardId);
            H.editDashboard();
            H.setFilter("Text or Category", "Is");

            // Map filter to Question A
            cy.findByText("Select…").click();
            H.popover().within(() => cy.findByText("Category").click());

            // Set filter value source to Question B
            H.setFilterQuestionSource({
              question: questionB.name,
              field: "Category",
            });

            cy.log("Step 5: Save the dashboard");
            H.saveDashboard();
            cy.wait("@updateDashboard");

            cy.log("Step 5b: Update the title and save again");
            H.editDashboard();
            cy.findByTestId("dashboard-header")
              .findByDisplayValue("Test Dashboard UXW-2494")
              .clear()
              .type("Updated Dashboard Title");
            H.saveDashboard();
            cy.wait("@updateDashboard");

            cy.log("Step 6: Move Question B to the trash");
            H.visitQuestion(questionBId);
            H.openQuestionActions();
            H.popover().findByText("Move to trash").click();
            H.modal().findByText("Move to trash").click();

            cy.log(
              "Step 8: Revert dashboard to earlier version where filter used Question B",
            );
            H.visitDashboard(dashboardId);
            H.openDashboardInfoSidebar();
            H.sidesheet().within(() => {
              cy.findByRole("tab", { name: "History" }).click();
              cy.wait("@revisionHistory");
              // Click revert on the version that added the filter with Question B source
              cy.findByTestId("dashboard-history-list")
                .findAllByLabelText(/revert to You edited this/i)
                .first()
                .click();
            });
            // Close sidesheet
            H.sidesheet().findByLabelText("Close").click();

            cy.log("Step 9: Permanently delete Question B from trash");
            cy.request("DELETE", `/api/card/${questionBId}`);

            cy.log("Step 10: Try to add another filter and save → Save fails");
            H.editDashboard();
            H.setFilter("Number");
            cy.findByText("Select…").click();
            H.popover().within(() => cy.findByText("Price").click());

            cy.intercept("PUT", `/api/dashboard/${dashboardId}`).as(
              "saveDashboard",
            );
            cy.findByTestId("edit-bar").button("Save").click();

            cy.wait("@saveDashboard").then((interception) => {
              expect(interception.response.statusCode).to.eq(200);
            });

            cy.log(
              "Step 11: Edit existing filter, click Edit → modal loads indefinitely",
            );
            H.visitDashboard(dashboardId);
            H.editDashboard();
            H.filterWidget({ isEditing: true }).first().click();
            H.dashboardParameterSidebar().findByText("Edit").click();

            H.modal().should("be.visible");
            H.modal().within(() => {
              cy.findByText("Where values should come from", {
                timeout: 10000,
              }).should("be.visible");
              cy.findByText("From connected fields").should("be.visible");
              cy.findByText("From another model or question").should(
                "be.visible",
              );
              cy.findByText("Custom list").should("be.visible");
            });
          });
        });
      },
    );
  });
});
