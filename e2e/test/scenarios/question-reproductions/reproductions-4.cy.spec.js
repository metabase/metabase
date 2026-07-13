const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

describe("issue 44974", { tags: "@external" }, () => {
  const PG_DB_ID = 2;

  beforeEach(() => {
    cy.intercept("GET", "/api/collection/*/items*").as("getCollectionItems");
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("entity picker should not offer to join with a table or a question from a different database (metabase#44974)", () => {
    H.withDatabase(PG_DB_ID, ({ PEOPLE_ID }) => {
      const questionDetails = {
        name: "Question 44974 in Postgres DB",
        database: PG_DB_ID,
        query: {
          "source-table": PEOPLE_ID,
          limit: 1,
        },
      };

      H.createQuestion(questionDetails);

      H.openOrdersTable({ mode: "notebook" });
      H.join();
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("Orders Model").should("be.visible");
        cy.findByText(questionDetails.name).should("not.exist");
      });
      H.miniPickerHeader().click();
      H.miniPickerBrowseAll().click();

      cy.wait(["@getCollectionItems", "@getCollectionItems"]);

      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Our analytics").click();
        cy.findByText("Orders Model").should("be.visible");
        H.entityPickerModalItem(1, questionDetails.name).should(
          "have.attr",
          "data-disabled",
          "true",
        );
        cy.button("Close").click();
      });
    });
  });
});

describe("issue 38989", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be impossible to join with a table or question which is not in the same database (metabase#38989)", () => {
    H.createQuestion(
      {
        query: {
          "source-table": PEOPLE_ID,
          fields: [
            ["field", PEOPLE.ID, { "base-type": "type/Number" }],
            ["field", PEOPLE.EMAIL, { "base-type": "type/Text" }],
          ],
          joins: [
            {
              fields: "all",
              alias: "Orders",
              // This is not a valid table ID in the Sample Database
              "source-table": 123,
              strategy: "left-join",
              condition: [
                "=",
                ["field", PEOPLE.ID, null],
                ["field", ORDERS.USER_ID, { "join-alias": "Orders" }],
              ],
            },
          ],
        },
      },
      {
        visitQuestion: true,
      },
    );

    cy.findByTestId("query-builder-main")
      .findByText("Show error details")
      .click();

    cy.findByTestId("query-builder-main")
      .findByText(
        /either it does not exist, or it belongs to a different Database/,
      )
      .should("exist");
  });
});

describe("issue 39771", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show tooltip for ellipsified text (metabase#39771)", () => {
    H.createQuestion(
      {
        query: {
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              "CREATED_AT",
              {
                "base-type": "type/DateTime",
                "temporal-unit": "quarter-of-year",
              },
            ],
          ],
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                  "temporal-unit": "month",
                },
              ],
            ],
          },
        },
      },
      { visitQuestion: true },
    );

    H.openNotebook();
    H.getNotebookStep("summarize", { stage: 1 })
      .findByTestId("breakout-step")
      .findByText("Created At: Quarter of year")
      .click();

    H.popover().findByText("by quarter of year").realHover();

    H.popover().then(([$popover]) => {
      const popoverStyle = window.getComputedStyle($popover);
      const popoverZindex = parseInt(popoverStyle.zIndex, 10);

      cy.findByTestId("ellipsified-tooltip").within(([$tooltip]) => {
        cy.findByText("by quarter of year").should("be.visible");

        const tooltipStyle = window.getComputedStyle($tooltip);
        const tooltipZindex = parseInt(tooltipStyle.zIndex, 10);

        // resort to asserting zIndex because should("be.visible") passes unexpectedly
        expect(tooltipZindex).to.be.gte(popoverZindex);
      });
    });
  });
});

describe("issue 45063", () => {
  function createGuiQuestion({ sourceTableId }) {
    const questionDetails = {
      name: "Question",
      query: {
        "source-table": sourceTableId,
      },
    };
    H.createQuestion(questionDetails, { wrapId: true });
  }

  function createGuiModel({ sourceTableId }) {
    const mbqlModelDetails = {
      name: "Model",
      type: "model",
      query: {
        "source-table": sourceTableId,
      },
    };
    H.createQuestion(mbqlModelDetails, { wrapId: true, idAlias: "modelId" });
  }

  function createNativeModel({
    tableName,
    fieldId,
    fieldName,
    fieldSemanticType,
  }) {
    const nativeModelDetails = {
      name: "Native Model",
      type: "model",
      native: {
        query: `SELECT * FROM ${tableName}`,
      },
    };
    H.createNativeQuestion(nativeModelDetails, {
      wrapId: true,
      idAlias: "modelId",
    }).then(({ body: model }) => {
      cy.log("populate result_metadata");
      cy.request("POST", `/api/card/${model.id}/query`);
      cy.log("map columns to database fields");
      H.setModelMetadata(model.id, (field) => {
        if (field.name === fieldName) {
          return { ...field, id: fieldId, semantic_type: fieldSemanticType };
        }
        return field;
      });
    });
  }

  function setListValues({ fieldId }) {
    cy.request("PUT", `/api/field/${fieldId}`, {
      has_field_values: "list",
    });
  }

  function setSearchValues({ fieldId }) {
    cy.request("PUT", `/api/field/${fieldId}`, {
      has_field_values: "search",
    });
  }

  function setForeignKeyRemapping({
    sourceFieldId,
    targetFieldId,
    remappedDisplayName,
  }) {
    cy.request("POST", `/api/field/${sourceFieldId}/dimension`, {
      type: "external",
      name: remappedDisplayName,
      human_readable_field_id: targetFieldId,
    });
  }

  function verifyListFilter({
    fieldDisplayName,
    filterHeaderName,
    fieldValue,
    fieldValueLabel,
  }) {
    H.tableHeaderClick(fieldDisplayName);
    H.popover().findByText("Filter by this column").click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Search the list").type(fieldValueLabel);
      cy.findByText(fieldValueLabel).click();
      cy.button("Add filter").click();
    });
    cy.findByTestId("qb-filters-panel")
      .findByText(`${filterHeaderName || fieldDisplayName} is ${fieldValue}`)
      .click();
    H.popover().findByLabelText(fieldValueLabel).should("be.checked");
  }

  function verifySearchFilter({
    fieldDisplayName,
    filterHeaderName,
    fieldPlaceholder,
    fieldValue,
    fieldValueLabel,
  }) {
    H.tableHeaderClick(fieldDisplayName);
    H.popover().findByText("Filter by this column").click();
    H.popover().findByPlaceholderText(fieldPlaceholder).type(fieldValueLabel);
    H.selectDropdown().findByText(fieldValueLabel).click();
    cy.findByTestId("number-filter-picker")
      .click()
      .button("Add filter")
      .click();
    cy.findByTestId("qb-filters-panel")
      .findByText(`${filterHeaderName || fieldDisplayName} is ${fieldValue}`)
      .should("be.visible");
  }

  function verifyRemappedFilter({
    visitCard,
    fieldId,
    fieldDisplayName,
    filterHeaderName,
    fieldPlaceholder,
    fieldValue,
    fieldValueLabel,
    expectedRowCount,
  }) {
    cy.log("list values");
    cy.signInAsAdmin();
    setListValues({ fieldId });
    cy.signInAsNormalUser();
    visitCard();
    verifyListFilter({
      fieldDisplayName,
      filterHeaderName,
      fieldValue,
      fieldValueLabel,
    });
    H.assertQueryBuilderRowCount(expectedRowCount);

    cy.log("search values");
    cy.signInAsAdmin();
    setSearchValues({ fieldId });
    cy.signInAsNormalUser();
    visitCard();
    verifySearchFilter({
      fieldDisplayName,
      filterHeaderName,
      fieldPlaceholder,
      fieldValue,
      fieldValueLabel,
    });
    H.assertQueryBuilderRowCount(expectedRowCount);
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("type/PK -> type/Name remapping (metabase#45063)", () => {
    it("should work with questions", () => {
      createGuiQuestion({ sourceTableId: PEOPLE_ID });
      verifyRemappedFilter({
        visitCard: () => H.visitQuestion("@questionId"),
        fieldId: PEOPLE.ID,
        fieldDisplayName: "ID",
        fieldPlaceholder: "Search by Name or enter an ID",
        fieldValue: 1,
        fieldValueLabel: "Hudson Borer",
        expectedRowCount: 1,
      });
    });

    it("should work with models", () => {
      createGuiModel({ sourceTableId: PEOPLE_ID });
      verifyRemappedFilter({
        visitCard: () => cy.get("@modelId").then(H.visitModel),
        fieldId: PEOPLE.ID,
        fieldDisplayName: "ID",
        fieldPlaceholder: "Search by Name or enter an ID",
        fieldValue: 1,
        fieldValueLabel: "Hudson Borer",
        expectedRowCount: 1,
      });
    });

    it("should work with native models", () => {
      createNativeModel({
        tableName: "PEOPLE",
        fieldId: PEOPLE.ID,
        fieldName: "ID",
        fieldSemanticType: "type/PK",
      });
      verifyRemappedFilter({
        visitCard: () => cy.get("@modelId").then(H.visitModel),
        fieldId: PEOPLE.ID,
        fieldDisplayName: "ID",
        fieldPlaceholder: "Search by Name or enter an ID",
        fieldValue: 1,
        fieldValueLabel: "Hudson Borer",
        expectedRowCount: 1,
      });
    });
  });

  describe("type/FK -> column remapping (metabase#45063)", () => {
    beforeEach(() => {
      setForeignKeyRemapping({
        sourceFieldId: ORDERS.PRODUCT_ID,
        targetFieldId: PRODUCTS.TITLE,
        remappedDisplayName: "Product ID",
      });
    });

    it("should work with questions", () => {
      createGuiQuestion({ sourceTableId: ORDERS_ID });
      verifyRemappedFilter({
        visitCard: () => H.visitQuestion("@questionId"),
        fieldId: ORDERS.PRODUCT_ID,
        fieldDisplayName: "Product ID",
        fieldPlaceholder: "Search by Title or enter an ID",
        fieldValue: 1,
        fieldValueLabel: "Rustic Paper Wallet",
        expectedRowCount: 93,
      });
    });

    it("should work with models", () => {
      createGuiModel({ sourceTableId: ORDERS_ID });
      verifyRemappedFilter({
        visitCard: () => cy.get("@modelId").then(H.visitModel),
        fieldId: ORDERS.PRODUCT_ID,
        fieldDisplayName: "Product ID",
        fieldPlaceholder: "Search by Title or enter an ID",
        fieldValue: 1,
        fieldValueLabel: "Rustic Paper Wallet",
        expectedRowCount: 93,
      });
    });

    it("should work with native models", () => {
      createNativeModel({
        tableName: "ORDERS",
        fieldId: ORDERS.PRODUCT_ID,
        fieldName: "PRODUCT_ID",
        fieldSemanticType: "type/FK",
      });
      verifyRemappedFilter({
        visitCard: () => cy.get("@modelId").then(H.visitModel),
        fieldId: ORDERS.PRODUCT_ID,
        fieldDisplayName: "Product ID",
        filterHeaderName: "PRODUCT_ID", // the title case version doesn't get picked up in filters
        fieldPlaceholder: "Search by Title or enter an ID",
        fieldValue: 1,
        fieldValueLabel: "Rustic Paper Wallet",
        expectedRowCount: 93,
      });
    });
  });
});

describe("issue 45359", { tags: "@skip" }, () => {
  beforeEach(() => {
    H.restore();
    cy.intercept("/app/fonts/Lato/lato-v16-latin-regular.woff2").as(
      "font-regular",
    );
    cy.intercept("/app/fonts/Lato/lato-v16-latin-700.woff2").as("font-bold");
    cy.signInAsAdmin();
  });

  it("loads app fonts correctly (metabase#45359)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.getNotebookStep("data")
      .findByText("Orders")
      .should("have.css", "font-family", "Lato, Arial, sans-serif");

    cy.get("@font-regular.all").should("have.length", 1);
    cy.get("@font-regular").should(({ response }) => {
      expect(response).to.include({ statusCode: 200 });
    });

    cy.get("@font-bold.all").should("have.length", 1);
    cy.get("@font-bold").should(({ response }) => {
      expect(response).to.include({ statusCode: 200 });
    });

    cy.document()
      .then((document) => document.fonts.ready)
      .then((fonts) => {
        cy.wrap(fonts).invoke("check", "16px Lato").should("be.true");
      });
  });
});

describe("issue 45452", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should only have one scrollbar for the summarize sidebar (metabase#45452)", () => {
    H.openOrdersTable();
    H.summarize();

    cy.findByTestId("summarize-aggregation-item-list").then(($el) => {
      const element = $el[0];
      expectNoScrollbarContainer(element);
    });

    cy.findByTestId("summarize-breakout-column-list").then(($el) => {
      const element = $el[0];
      expectNoScrollbarContainer(element);
    });

    // the sidebar is the only element with a scrollbar
    cy.findByTestId("sidebar-content").then(($el) => {
      const element = $el[0];
      expect(element.scrollHeight > element.clientHeight).to.be.true;
      expect(element.offsetWidth > element.clientWidth).to.be.true;
    });
  });
});

describe("issue 41612", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("createQuestion");
  });

  it("should not ignore chart viz settings when viewing raw results as a table (metabase#41612)", () => {
    H.visitQuestionAdhoc(
      {
        display: "line",
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
            "source-table": ORDERS_ID,
          },
        },
      },
      { visitQuestion: true },
    );

    H.queryBuilderMain().findByLabelText("Switch to data").click();
    H.queryBuilderHeader().button("Save").click();
    H.modal().button("Save").click();

    cy.wait("@createQuestion").then((xhr) => {
      const card = xhr.request.body;
      expect(card.visualization_settings["graph.metrics"]).to.deep.equal([
        "count",
      ]);
      expect(card.visualization_settings["graph.dimensions"]).to.deep.equal([
        "CREATED_AT",
      ]);
    });
  });
});

describe("issue 36027", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    const CONCRETE_CREATED_AT_FIELD_REF = [
      "field",
      ORDERS.CREATED_AT,
      { "base-type": "type/DateTime", "temporal-unit": "month" },
    ];

    const CREATED_AT_FIELD_REF = [
      "field",
      "CREATED_AT",
      { "base-type": "type/DateTime", "temporal-unit": "month" },
    ];

    const BASE_QUERY = {
      aggregation: [["count"]],
      breakout: [CONCRETE_CREATED_AT_FIELD_REF],
      "source-table": ORDERS_ID,
    };

    H.createQuestion({ query: BASE_QUERY }, { wrapId: true }).then(
      (baseQuestionId) => {
        H.createQuestion(
          {
            display: "waterfall",
            query: {
              aggregation: [
                ["sum", ["field", "count", { "base-type": "type/Integer" }]],
              ],
              breakout: [CREATED_AT_FIELD_REF],
              joins: [
                {
                  alias: "Q1",
                  strategy: "left-join",
                  "source-table": `card__${baseQuestionId}`,
                  condition: [
                    "<=",
                    CREATED_AT_FIELD_REF,
                    CONCRETE_CREATED_AT_FIELD_REF,
                  ],
                },
              ],
              "source-query": BASE_QUERY,
            },
            visualization_settings: {
              "graph.dimensions": ["CREATED_AT"],
              "graph.metrics": ["sum"],
            },
          },
          { visitQuestion: true },
        );
      },
    );
  });

  it("should use default metrics/dimensions if they're missing after removing some query clauses (metabase#36027)", () => {
    H.openNotebook();
    H.getNotebookStep("summarize", { stage: 1 })
      .findByLabelText("Remove step")
      .click({ force: true });
    H.getNotebookStep("join", { stage: 1 })
      .findByLabelText("Remove step")
      .click({ force: true });
    H.visualize();

    H.echartsContainer().within(() => {
      cy.findByText("Created At: Month").should("be.visible"); // x-axis
      cy.findByText("Count").should("be.visible"); // y-axis

      // x-axis values
      ["January 2026", "January 2027", "January 2028", "January 2029"].forEach(
        (state) => {
          cy.findByText(state).should("be.visible");
        },
      );

      // y-axis values
      [
        "0",
        "3,000",
        "6,000",
        "9,000",
        "12,000",
        "15,000",
        "18,000",
        "21,000",
      ].forEach((state) => {
        cy.findByText(state).should("be.visible");
      });
    });
  });
});

function expectNoScrollbarContainer(element) {
  const hasScrollbarContainer =
    element.scrollHeight <= element.clientHeight &&
    element.offsetWidth > element.clientWidth;

  expect(hasScrollbarContainer).to.be.false;
}

describe("issue 50038", () => {
  const QUESTION = {
    name: "question with a very long name that will be too long to fit on one line which normally would result in some weird looking buttons with inconsistent heights",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const OTHER_QUESTION = {
    name: "question that also has a long name that is so long it will break in the button",
    query: {
      "source-table": ORDERS_ID,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestion(QUESTION, { wrapId: true, idAlias: "questionId" });
    H.createQuestion(OTHER_QUESTION, {
      wrapId: true,
      idAlias: "otherQuestionId",
    });

    cy.get("@questionId").then((questionId) => {
      cy.get("@otherQuestionId").then((otherQuestionId) => {
        H.createQuestion(
          {
            name: "Joined question",
            query: {
              "source-table": `card__${questionId}`,
              joins: [
                {
                  "source-table": `card__${otherQuestionId}`,
                  fields: "all",
                  strategy: "left-join",
                  condition: [
                    "=",
                    ["field", PRODUCTS.ID, null],
                    ["field", ORDERS.PRODUCT_ID, { "join-alias": "Orders" }],
                  ],
                },
              ],
            },
          },
          { visitQuestion: true },
        );
      });
    });
  });

  function assertEqualHeight(selector, otherSelector) {
    selector.invoke("outerHeight").then((height) => {
      otherSelector.invoke("outerHeight").should("eq", height);
    });
  }

  it("should not break data source and join source buttons when the source names are too long (metabase#50038)", () => {
    H.openNotebook();
    H.getNotebookStep("data").within(() => {
      assertEqualHeight(
        cy.findByText(QUESTION.name).parent().should("be.visible"),
        cy.findByTestId("fields-picker").should("be.visible"),
      );
    });
    H.getNotebookStep("join").within(() => {
      assertEqualHeight(
        cy
          .findAllByText(OTHER_QUESTION.name)
          .first()
          .parent()
          .should("be.visible"),
        cy.findByTestId("fields-picker").should("be.visible"),
      );
    });
  });
});

describe("issue 47940", () => {
  const questionDetails = {
    name: "Issue 47940",
    query: {
      "source-table": ORDERS_ID,
      limit: 5,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should be able to convert a question with date casting to a model", () => {
    cy.log("create a question without any column casting");
    H.createQuestion(questionDetails, { visitQuestion: true });
    cy.wait("@cardQuery");

    cy.log("add coercion");
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      semantic_type: "type/Category",
      coercion_strategy: "Coercion/UNIXMicroSeconds->DateTime",
    });

    cy.log("reload to get new query results with coercion applied");
    cy.reload();
    cy.wait("@cardQuery");

    cy.log("turn into a model");
    H.openQuestionActions();
    H.popover().findByText("Turn into a model").click();
    cy.findByRole("dialog").findByText("Turn this into a model").click();
    cy.wait("@updateCard");

    cy.log("verify there is a table displayed");
    cy.findByTestId("visualization-root").should(
      "contain",
      "December 31, 1969, 4:00 PM",
    );
  });
});

describe("issue 32499", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("Self-join columns can be edited independently", () => {
    H.createQuestion(
      {
        name: "Model",
        type: "model",
        query: {
          "source-table": ORDERS_ID,
          fields: [
            ["field", ORDERS.ID, null],
            ["field", ORDERS.USER_ID, null],
          ],
          joins: [
            {
              fields: [["field", ORDERS.USER_ID, { "join-alias": "Orders" }]],
              alias: "Orders",
              "source-table": ORDERS_ID,
              strategy: "left-join",
              condition: [
                "=",
                ["field", ORDERS.ID, null],
                ["field", ORDERS.ID, { "join-alias": "Orders" }],
              ],
            },
          ],
        },
      },
      { visitQuestion: true },
    );

    H.openQuestionActions("Edit metadata");

    const columns = [
      { original: "Orders → User ID", modified: "JOIN COLUMN" },
      { original: "User ID", modified: "ORIGINAL COLUMN" },
    ];

    // we can click the headers and modify their names
    for (const { original, modified } of columns) {
      H.tableHeaderClick(original);
      cy.findByLabelText("Display name")
        .should("have.value", original)
        .click()
        .clear()
        .type(modified);
    }

    // the modified names are now in the headers
    for (const { modified } of columns) {
      H.tableHeaderColumn(modified).should("exist");
    }
  });
});
describe("issue 12679", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("removing the first aggregation should not re-target the filter (metabase#12679)", () => {
    const questionDetails = {
      display: "table",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.SUBTOTAL, null]],
              ["sum", ["field", ORDERS.TAX, null]],
              ["sum", ["field", ORDERS.TOTAL, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }],
            ],
          },
          filter: [">", ["field", "sum_2", { "base-type": "type/Float" }], 100],
        },
      },
    };

    H.visitQuestionAdhoc(questionDetails, { mode: "notebook" });
    H.getNotebookStep("filter", { stage: 1 })
      .findByText("Sum of Tax is greater than 100")
      .should("exist");

    H.getNotebookStep("summarize").within(() => {
      cy.findByText("Sum of Subtotal").parent().icon("close").click();
      cy.findByText("Sum of Subtotal").should("not.exist");
    });
    H.getNotebookStep("filter", { stage: 1 })
      .findByText("Sum of Tax is greater than 100")
      .should("exist");

    H.visualize();

    cy.findByTestId("qb-filters-panel")
      .findByText("Sum of Tax is greater than 100")
      .should("exist");
    cy.findByTestId("table-header").within(() => {
      cy.findByText("Sum of Subtotal").should("not.exist");
      cy.findByText("Sum of Tax").should("exist");
      cy.findByText("Sum of Total").should("exist");
    });
    cy.findByTestId("question-row-count")
      .findByText("Showing 175 rows")
      .should("exist");
  });
});
