const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { CardId, Field, FieldId, TableId } from "metabase-types/api";

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
  function createGuiQuestion({ sourceTableId }: { sourceTableId: TableId }) {
    const questionDetails: StructuredQuestionDetails = {
      name: "Question",
      query: {
        "source-table": sourceTableId,
      },
    };
    H.createQuestion(questionDetails, { wrapId: true });
  }

  function createGuiModel({ sourceTableId }: { sourceTableId: TableId }) {
    const mbqlModelDetails: StructuredQuestionDetails = {
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
  }: {
    tableName: string;
    fieldId: FieldId;
    fieldName: string;
    fieldSemanticType: string;
  }) {
    const nativeModelDetails: NativeQuestionDetails = {
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
      H.setModelMetadata(model.id, (field: Field) => {
        if (field.name === fieldName) {
          return { ...field, id: fieldId, semantic_type: fieldSemanticType };
        }
        return field;
      });
    });
  }

  function setListValues({ fieldId }: { fieldId: FieldId }) {
    cy.request("PUT", `/api/field/${fieldId}`, {
      has_field_values: "list",
    });
  }

  function setSearchValues({ fieldId }: { fieldId: FieldId }) {
    cy.request("PUT", `/api/field/${fieldId}`, {
      has_field_values: "search",
    });
  }

  function setForeignKeyRemapping({
    sourceFieldId,
    targetFieldId,
    remappedDisplayName,
  }: {
    sourceFieldId: FieldId;
    targetFieldId: FieldId;
    remappedDisplayName: string;
  }) {
    cy.request("POST", `/api/field/${sourceFieldId}/dimension`, {
      type: "external",
      name: remappedDisplayName,
      human_readable_field_id: targetFieldId,
    });
  }

  type RemappedFilterDetails = {
    visitCard: () => void;
    fieldId: FieldId;
    fieldDisplayName: string;
    filterHeaderName?: string;
    fieldPlaceholder: string;
    fieldValue: number;
    fieldValueLabel: string;
    expectedRowCount: number;
  };

  function verifyListFilter({
    fieldDisplayName,
    filterHeaderName,
    fieldValue,
    fieldValueLabel,
  }: Pick<
    RemappedFilterDetails,
    "fieldDisplayName" | "filterHeaderName" | "fieldValue" | "fieldValueLabel"
  >) {
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
  }: Pick<
    RemappedFilterDetails,
    | "fieldDisplayName"
    | "filterHeaderName"
    | "fieldPlaceholder"
    | "fieldValue"
    | "fieldValueLabel"
  >) {
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
  }: RemappedFilterDetails) {
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
        visitCard: () =>
          cy.get<CardId>("@modelId").then((id) => H.visitModel(id)),
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
        visitCard: () =>
          cy.get<CardId>("@modelId").then((id) => H.visitModel(id)),
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
        visitCard: () =>
          cy.get<CardId>("@modelId").then((id) => H.visitModel(id)),
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
        visitCard: () =>
          cy.get<CardId>("@modelId").then((id) => H.visitModel(id)),
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

  function assertEqualHeight(
    selector: Cypress.Chainable<JQuery<HTMLElement>>,
    otherSelector: Cypress.Chainable<JQuery<HTMLElement>>,
  ) {
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

describe("issue 53036", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  const questionDetails = {
    name: "Issue 53036",
    query: {
      "source-table": PRODUCTS_ID,
      limit: 5,
      joins: [
        {
          fields: "all",
          alias: "Orders",
          "source-table": ORDERS_ID,
          strategy: "left-join",
          condition: [
            "=",
            ["field", PRODUCTS.ID, null],
            ["field", ORDERS.PRODUCT_ID, { "join-alias": "Orders" }],
          ],
        },
      ],
    },
  };

  it("should keep buttons usable on mid size screen (metabase#53036)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();

    cy.viewport(650, 800);

    cy.log("try to click on add button - it fails is there is an overlap");

    H.getNotebookStep("join").within(() => {
      cy.icon("play").should("be.visible");
      cy.icon("add").click();
    });
  });
});
