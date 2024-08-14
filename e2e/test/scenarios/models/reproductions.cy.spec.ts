import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  type StructuredQuestionDetails,
  createNativeQuestion,
  createQuestion,
  enterCustomColumnDetails,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  hovercard,
  join,
  mapColumnTo,
  modal,
  openColumnOptions,
  openNotebook,
  openQuestionActions,
  popover,
  renameColumn,
  restore,
  saveMetadataChanges,
  saveQuestion,
  startNewModel,
  startNewQuestion,
  undoToast,
  visitModel,
  visualize,
  tableHeaderClick,
  questionInfoButton,
  visitDashboard,
  editDashboard,
  setFilter,
  setDropdownFilterType,
  sidebar,
  describeEE,
  setTokenFeatures,
  getPinnedSection,
  summarize,
  rightSidebar,
  assertQueryBuilderRowCount,
  navigationSidebar,
  newButton,
  tableInteractive,
} from "e2e/support/helpers";
import type { CardId, FieldReference } from "metabase-types/api";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("issue 29943", () => {
  function reorderTotalAndCustomColumns() {
    getHeaderCell(1, "Total").should("exist");
    getHeaderCell(2, "Custom").should("exist");

    // drag & drop the Custom column 100 px to the left to switch it with Total column
    cy.findAllByTestId("header-cell")
      .contains("Custom")
      .then(customColumn => {
        const rect = customColumn[0].getBoundingClientRect();
        cy.wrap(customColumn)
          .trigger("mousedown")
          .trigger("mousemove", { clientX: rect.x - 100, clientY: rect.y })
          .trigger("mouseup");
      });

    getHeaderCell(1, "Custom").should("exist");
    getHeaderCell(2, "Total").should("exist");
  }

  function assertColumnSelected(columnIndex: number, name: string) {
    getHeaderCell(columnIndex, name)
      .find("div")
      .should("have.css", "background-color")
      .and("eq", "rgb(80, 158, 227)");

    cy.findByLabelText("Display name").should("have.value", name);
  }

  function getHeaderCell(columnIndex: number, name: string) {
    return cy
      .findAllByTestId("header-cell")
      .eq(columnIndex)
      .should("have.text", name);
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("selects the right column when clicking a column header (metabase#29943)", () => {
    createQuestion(
      {
        type: "model",
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            Custom: ["+", 1, 1],
          },
          fields: [
            ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
            ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
            ["expression", "Custom", { "base-type": "type/Integer" }],
          ],
          limit: 5, // optimization
        },
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    popover().findByText("Edit metadata").click();

    reorderTotalAndCustomColumns();
    cy.button("Save changes").click();
    cy.wait("@dataset");

    openQuestionActions();
    popover().findByText("Edit metadata").click();

    assertColumnSelected(0, "ID");

    getHeaderCell(1, "Custom").click();
    assertColumnSelected(1, "Custom");

    getHeaderCell(2, "Total").click();
    assertColumnSelected(2, "Total");

    getHeaderCell(0, "ID").click();
    assertColumnSelected(0, "ID");
  });
});

describe("issue 35711", () => {
  const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

  const DISCOUNT_FIELD_REF: FieldReference = [
    "field",
    ORDERS.DISCOUNT,
    {
      "base-type": "type/Float",
    },
  ];

  function reorderTaxAndTotalColumns() {
    cy.findAllByTestId("header-cell").eq(4).should("have.text", "Tax");
    cy.findAllByTestId("header-cell").eq(5).should("have.text", "Total");

    // drag & drop the Total column 100 px to the left to switch it with Tax column
    cy.findAllByTestId("header-cell")
      .contains("Total")
      .then(totalColumn => {
        const rect = totalColumn[0].getBoundingClientRect();
        cy.wrap(totalColumn)
          .trigger("mousedown")
          .trigger("mousemove", { clientX: rect.x - 100, clientY: rect.y })
          .trigger("mouseup");
      });

    cy.findAllByTestId("header-cell").eq(4).should("have.text", "Total");
    cy.findAllByTestId("header-cell").eq(5).should("have.text", "Tax");
  }

  function assertNoError() {
    cy.button("Get Answer").should("not.exist");
    cy.get("main")
      .findByText("There was a problem with your question")
      .should("not.exist");
    cy.get("[data-testid=cell-data]").should("contain", "37.65");
  }
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("can edit metadata of a model with a custom column (metabase#35711)", () => {
    createQuestion(
      {
        type: "model",
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            "Custom column": ["-", DISCOUNT_FIELD_REF, 1],
          },
          limit: 5, // optimization
        },
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    popover().findByText("Edit metadata").click();
    reorderTaxAndTotalColumns();
    assertNoError();

    cy.findByTestId("editor-tabs-query-name").click();
    assertNoError();
  });
});

describe("issues 25884 and 34349", () => {
  const ID_DESCRIPTION =
    "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.";

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show empty description input for columns without description in metadata (metabase#25884, metabase#34349)", () => {
    createQuestion(
      {
        type: "model",
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            Country: ["substring", "United States", 1, 20],
          },
          fields: [
            ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
            ["expression", "Country", { "base-type": "type/Text" }],
          ],
          limit: 5, // optimization
        },
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    popover().findByText("Edit metadata").click();

    cy.findByLabelText("Description").should("have.text", ID_DESCRIPTION);

    cy.findAllByTestId("header-cell").contains("Country").click();
    cy.findByLabelText("Description").should("have.text", "");

    cy.findAllByTestId("header-cell").contains("ID").click();
    cy.findByLabelText("Description").should("have.text", ID_DESCRIPTION);
  });
});

describe("issue 23103", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/card/*").as("updateModel");
  });

  it("shows correct number of distinct values (metabase#23103)", () => {
    createNativeQuestion(
      {
        type: "model",
        native: {
          query: "select * from products limit 5",
        },
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    popover().findByText("Edit metadata").click();

    cy.findAllByTestId("header-cell").contains("CATEGORY").click();
    cy.findAllByTestId("select-button").contains("None").click();
    popover().within(() => {
      cy.findByText("Products").click();
      cy.findByText("Category").click();
    });

    cy.button("Save changes").click();
    cy.wait("@updateModel");
    cy.button("Saving…").should("not.exist");

    cy.findAllByTestId("header-cell").contains("Category").trigger("mouseover");

    hovercard().findByText("4 distinct values").should("exist");
  });
});

describe("issue 39150", { viewportWidth: 1600 }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("allows custom columns with the same name in nested models (metabase#39150-1)", () => {
    const ccName = "CC Rating";

    createQuestion({
      name: "Source Model",
      type: "model",
      query: {
        "source-table": PRODUCTS_ID,
        expressions: {
          [ccName]: [
            "ceil",
            [
              "field",
              PRODUCTS.RATING,
              {
                "base-type": "type/Float",
              },
            ],
          ],
        },
        limit: 2,
      },
    }).then(({ body: { id: sourceModelId } }) => {
      createQuestion(
        {
          name: "Nested Model",
          type: "model",
          query: {
            "source-table": `card__${sourceModelId}`,
          },
        },
        { visitQuestion: true },
      );
    });

    openNotebook();
    cy.findByTestId("action-buttons").findByText("Custom column").click();

    enterCustomColumnDetails({
      formula: "floor([Rating])",
      name: ccName,
      blur: true,
    });

    cy.button("Done").click();

    visualize();

    cy.findAllByTestId("header-cell")
      .filter(`:contains('${ccName}')`)
      .should("have.length", 2);
  });

  it("allows custom columns with the same name as the aggregation column from the souce model (metabase#39150-2)", () => {
    createQuestion({
      name: "Source Model",
      type: "model",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PRODUCTS.CATEGORY,
            {
              "base-type": "type/Text",
            },
          ],
        ],
        limit: 2,
      },
    }).then(({ body: { id: sourceModelId } }) => {
      createQuestion(
        {
          type: "model",
          query: {
            "source-table": `card__${sourceModelId}`,
          },
        },
        { visitQuestion: true },
      );
    });

    openNotebook();
    cy.findByTestId("action-buttons").findByText("Custom column").click();

    enterCustomColumnDetails({
      formula: "[Count] + 1",
      name: "Count",
      blur: true,
    });

    cy.button("Done").click();

    visualize();

    cy.findAllByTestId("header-cell")
      .filter(":contains('Count')")
      .should("have.length", 2);

    saveQuestion("Nested Model", { wrapId: true, idAlias: "nestedModelId" });

    cy.log("Make sure this works for the deeply nested models as well");
    cy.get("@nestedModelId").then(nestedModelId => {
      createQuestion(
        {
          type: "model",
          query: {
            "source-table": `card__${nestedModelId}`,
          },
        },
        { visitQuestion: true },
      );
    });

    openNotebook();
    cy.findByTestId("action-buttons").findByText("Custom column").click();

    enterCustomColumnDetails({
      formula: "[Count] + 5",
      name: "Count",
      blur: true,
    });

    cy.button("Done").click();

    visualize();

    cy.findAllByTestId("header-cell")
      .filter(":contains('Count')")
      .should("have.length", 3);
  });
});

describe.skip("issue 41785, issue 46756", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("does not break the question when removing column with the same mapping as another column (metabase#41785) (metabase#46756)", () => {
    // it's important to create the model through UI to reproduce this issue
    startNewModel();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });
    join();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });
    popover().findByText("ID").click();
    popover().findByText("ID").click();

    cy.findByTestId("run-button").click();
    cy.wait("@dataset");

    cy.button("Save").click();
    modal().button("Save").click();

    cy.findAllByTestId("cell-data").should("contain", "37.65");
    cy.findByTestId("loading-indicator").should("not.exist");

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findAllByText("Ean").should("have.length", 1);
      cy.findAllByText("Products → Ean").should("have.length", 1);

      cy.button("Add or remove columns").click();
      cy.findAllByText("Ean").should("have.length", 1);
      cy.findByLabelText("Ean").should("be.checked");

      cy.findByLabelText("Products → Ean").should("be.checked");
      cy.findAllByText("Products → Ean").should("have.length", 1).click();

      cy.wait("@dataset");

      cy.log("Only the clicked column should be removed (metabase#46756)");
      cy.findByLabelText("Products → Ean").should("not.be.checked");
      cy.findByLabelText("Ean").should("be.checked");
    });

    cy.log(
      "There should be no error in the table visualization (metabase#41785)",
    );
    cy.findAllByTestId("header-cell")
      .filter(":contains(Ean)")
      .should("be.visible");

    tableInteractive().should("contain", "Small Marble Shoes");
  });
});

describe.skip("issue 40635", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("correctly displays question's and nested model's column names (metabase#40635)", () => {
    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });

    getNotebookStep("data").button("Pick columns").click();
    popover().findByText("Select none").click();

    join();

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });

    getNotebookStep("join", { stage: 0, index: 0 })
      .button("Pick columns")
      .click();
    popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByText("ID").click();
    });

    join();

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });

    getNotebookStep("join", { stage: 0, index: 1 })
      .button("Pick columns")
      .click();
    popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByText("ID").click();
    });

    getNotebookStep("join", { stage: 0, index: 1 })
      .findByText("Product ID")
      .click();
    popover().findByText("User ID").click();

    visualize();
    assertSettingsSidebar();
    assertVisualizationColumns();

    cy.button("Save").click();
    modal().button("Save").click();
    modal().findByText("Not now").click();

    assertSettingsSidebar();
    assertVisualizationColumns();

    openQuestionActions();
    popover().findByTextEnsureVisible("Turn into a model").click();
    modal().button("Turn this into a model").click();
    undoToast().should("contain", "This is a model now").icon("close").click();

    assertSettingsSidebar();
    assertVisualizationColumns();

    openNotebook();
    getNotebookStep("data").button("Pick columns").click();
    popover().within(() => {
      cy.findAllByText("ID").should("have.length", 1);
      cy.findAllByText("Products → ID").should("have.length", 1);
      cy.findAllByText("Products_2 → ID").should("have.length", 1);
    });
  });

  function assertVisualizationColumns() {
    assertTableHeader(0, "ID");
    assertTableHeader(1, "Products → ID");
    assertTableHeader(2, "Products_2 → ID");
  }

  function assertTableHeader(index: number, name: string) {
    cy.findAllByTestId("header-cell").eq(index).should("have.text", name);
  }

  function assertSettingsSidebar() {
    cy.findByTestId("viz-settings-button").click();

    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findAllByText("ID").should("have.length", 1);
      cy.findAllByText("Products → ID").should("have.length", 1);
      cy.findAllByText("Products_2 → ID").should("have.length", 1);

      cy.findByRole("button", { name: "Add or remove columns" }).click();
      cy.findAllByText("ID").should("have.length", 4);
      cy.findAllByText("Products").should("have.length", 1);
      cy.findAllByText("Products 2").should("have.length", 1);
    });

    cy.button("Done").click();
  }
});

describe("issue 33427", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("does not confuse the names of various native model columns mapped to the same database field (metabase#33427)", () => {
    createNativeQuestion(
      {
        type: "model",
        native: {
          query: `
            select o.ID, p1.title as created_by, p2.title as updated_by
            from ORDERS o
            join PRODUCTS p1 on p1.ID = o.PRODUCT_ID
            join PRODUCTS p2 on p2.ID = o.USER_ID;
        `,
        },
      },
      { visitQuestion: true },
    );

    assertColumnHeaders();

    cy.findByLabelText("Move, archive, and more...").click();
    popover().findByText("Edit metadata").click();

    openColumnOptions("CREATED_BY");
    mapColumnTo({ table: "Products", column: "Title" });
    renameColumn("Title", "CREATED_BY");

    openColumnOptions("UPDATED_BY");
    mapColumnTo({ table: "Products", column: "Title" });
    renameColumn("Title", "UPDATED_BY");

    assertColumnHeaders();
    saveMetadataChanges();

    assertColumnHeaders();

    openNotebook();
    getNotebookStep("data").button("Pick columns").click();
    popover().within(() => {
      cy.findByText("CREATED_BY").should("be.visible");
      cy.findByText("UPDATED_BY").should("be.visible");
    });
  });

  function assertColumnHeaders() {
    cy.findAllByTestId("header-cell")
      .should("contain", "CREATED_BY")
      .and("contain", "UPDATED_BY");
  }
});

describe("issue 39749", () => {
  const modelDetails: StructuredQuestionDetails = {
    type: "model",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count"],
        ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
      ],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "year" },
        ],
      ],
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateModel");
  });

  it("should not overwrite the description of one column with the description of another column (metabase#39749)", () => {
    createQuestion(modelDetails).then(({ body: card }) => visitModel(card.id));

    cy.log("edit metadata");
    openQuestionActions();
    popover().findByText("Edit metadata").click();
    tableHeaderClick("Count");
    cy.findByLabelText("Description").type("A");
    tableHeaderClick("Sum of Total");
    cy.findByLabelText("Description").should("have.text", "").type("B");
    tableHeaderClick("Count");
    cy.findByLabelText("Description").should("have.text", "A");
    tableHeaderClick("Sum of Total");
    cy.findByLabelText("Description").should("have.text", "B");
    cy.button("Save changes").click();
    cy.wait("@updateModel");

    cy.log("verify that the description was updated successfully");
    openQuestionActions();
    popover().findByText("Edit metadata").click();
    tableHeaderClick("Count");
    cy.findByLabelText("Description").should("have.text", "A");
    tableHeaderClick("Sum of Total");
    cy.findByLabelText("Description").should("have.text", "B");
  });
});

describe("issue 33844", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("createModel");
    cy.intercept("PUT", "/api/card/*").as("updateModel");
  });

  function testModelMetadata(isNew: boolean) {
    cy.log("make a column visible only in detail views");
    cy.findByTestId("detail-shortcut").should("not.exist");
    tableHeaderClick("ID");
    cy.findByLabelText("Detail views only").click();
    cy.button(isNew ? "Save" : "Save changes").click();
    if (isNew) {
      modal().button("Save").click();
      cy.wait("@createModel");
    } else {
      cy.wait("@updateModel");
      cy.wait("@dataset");
    }
    tableInteractive().findByText("User ID").should("be.visible");
    tableInteractive().findByText("ID").should("not.exist");
    cy.findAllByTestId("detail-shortcut").first().click();
    modal().within(() => {
      cy.findByText("Order").should("be.visible");
      cy.findByText("ID").should("be.visible");
      cy.findByTestId("object-detail-close-button").click();
    });

    cy.log("make the column visible in table views");
    openQuestionActions();
    popover().findByText("Edit metadata").click();
    tableHeaderClick("ID");
    cy.findByLabelText("Detail views only").should("be.checked");
    cy.findByLabelText("Table and details views").click();
    cy.button("Save changes").click();
    cy.wait("@updateModel");
    cy.wait("@dataset");
    tableInteractive().findByText("ID").should("be.visible");
  }

  it("should show hidden PKs in model metadata editor and object details after creating a model (metabase#33844)", () => {
    cy.visit("/");
    newButton("Model").click();
    cy.findByTestId("new-model-options")
      .findByText("Use the notebook editor")
      .click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });
    cy.findByTestId("run-button").click();
    cy.wait("@dataset");
    cy.findByTestId("dataset-edit-bar").findByText("Metadata").click();
    testModelMetadata(true);
  });

  it("should show hidden PKs in model metadata editor and object details after updating a model (metabase#33844,metabase#45924)", () => {
    visitModel(ORDERS_QUESTION_ID);
    cy.wait("@dataset");
    openQuestionActions();
    popover().findByText("Edit metadata").click();
    testModelMetadata(false);
  });
});

describe("issue 45924", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should preserve model metadata when re-running the query (metabase#45924)", () => {
    visitModel(ORDERS_QUESTION_ID);
    cy.wait("@dataset");
    openQuestionActions();
    popover().findByText("Edit metadata").click();
    tableHeaderClick("ID");
    cy.findByLabelText("Display name").clear().type("ID1");
    cy.findByTestId("dataset-edit-bar").findByText("Query").click();
    cy.findByTestId("action-buttons").button("Sort").click();
    popover().findByText("ID").click();
    cy.findByTestId("run-button").click();
    cy.wait("@dataset");
    cy.findByTestId("dataset-edit-bar").findByText("Metadata").click();
    tableHeaderClick("ID1");
    cy.findByLabelText("Display name").should("have.value", "ID1");
    cy.findByTestId("dataset-edit-bar").button("Save changes").click();
    cy.wait("@updateCard");
    cy.wait("@dataset");
    tableInteractive().findByText("ID1").should("be.visible");
  });
});

describeEE("issue 43088", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to create ad-hoc questions based on instance analytics models (metabase#43088)", () => {
    cy.visit("/");
    navigationSidebar().findByText("Metabase analytics").click();
    getPinnedSection().findByText("People").scrollIntoView().click();
    cy.wait("@dataset");
    summarize();
    rightSidebar().button("Done").click();
    cy.wait("@dataset");
    assertQueryBuilderRowCount(1);
  });
});

describe("issue 39993", () => {
  const columnName = "Exp";

  const modelDetails: StructuredQuestionDetails = {
    type: "model",
    query: {
      "source-table": ORDERS_ID,
      fields: [
        ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
        ["expression", columnName, { "base-type": "type/Integer" }],
      ],
      expressions: { [columnName]: ["+", 1, 1] },
    },
  };

  function dragAndDrop(column: string, distance: number) {
    cy.findAllByTestId("header-cell")
      .contains(column)
      .then(element => {
        const rect = element[0].getBoundingClientRect();
        cy.wrap(element)
          .trigger("mousedown")
          .trigger("mousemove", { clientX: rect.x + distance, clientY: rect.y })
          .trigger("mouseup");
      });
  }

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateModel");
  });

  it("should preserve viz settings for models with custom expressions (metabase#39993)", () => {
    createQuestion(modelDetails).then(({ body: card }) => visitModel(card.id));
    openQuestionActions();
    popover().findByText("Edit metadata").click();
    cy.log("drag & drop the custom column 100 px to the left");
    dragAndDrop(columnName, -100);
    cy.button("Save changes").click();
    cy.wait("@updateModel");
    cy.findAllByTestId("header-cell").eq(0).should("have.text", "Exp");
    cy.findAllByTestId("header-cell").eq(1).should("have.text", "ID");
  });
});

describe("issue 34574", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should accept markdown for model description and render it properly (metabase#34574)", () => {
    const modelDetails: StructuredQuestionDetails = {
      name: "34574",
      type: "model",
      query: {
        "source-table": PRODUCTS_ID,
        limit: 2,
      },
    };
    createQuestion(modelDetails).then(({ body: { id: modelId } }) =>
      visitModel(modelId),
    );

    cy.findByTestId("qb-header-action-panel").within(() => {
      // make sure the model fully loaded
      cy.findByTestId("run-button").should("exist");
      questionInfoButton().click();
    });

    cy.findByTestId("sidebar-right").within(() => {
      cy.log("Set the model description to a markdown text");
      cy.intercept("GET", "/api/card/*/query_metadata").as("metadata");
      cy.findByPlaceholderText("Add description").type(
        "# Hello{enter}## World{enter}This is an **important** description!",
      );
      cy.realPress("Tab");
      cy.wait("@metadata");

      cy.log("Make sure we immediately render the proper markdown");
      cy.findByTestId("editable-text").within(assertMarkdownPreview);
    });

    cy.log(
      "Make sure the markdown is properly preserved in the model details page",
    );
    cy.findByRole("link", { name: "Model details" }).click();
    cy.findByLabelText("Description").within(assertMarkdownPreview);

    cy.log(
      "Make sure the description is present in the collection entry tooltip",
    );
    cy.findByTestId("app-bar").findByText("Our analytics").click();
    cy.location("pathname").should("eq", "/collection/root");
    cy.findAllByTestId("collection-entry-name")
      .filter(`:contains(${modelDetails.name})`)
      .icon("info")
      .realHover();
    cy.findByRole("tooltip")
      .should("contain", "Hello")
      .and("contain", "World")
      .and("contain", "This is an important description!");
  });

  function assertMarkdownPreview() {
    cy.findByRole("heading", { level: 1, name: "Hello" }).should("be.visible");
    cy.findByRole("heading", { level: 2, name: "World" }).should("be.visible");
    cy.get("strong").should("be.visible").and("have.text", "important");
  }
});

describe("issue 34517", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not change the url when reloading the page while editing a model (metabase#34517)", () => {
    startNewModel();
    cy.location("pathname").should("eq", "/model/query");

    // wait for the model editor to be fully loaded
    entityPickerModal().should("exist");
    cy.reload();

    // wait for the model editor to be fully loaded
    entityPickerModal().should("exist");
    cy.location("pathname").should("eq", "/model/query");
  });
});

describe("issue 35840", () => {
  const modelName = "M1";
  const questionName = "Q1";

  const modelDetails: StructuredQuestionDetails = {
    type: "model",
    name: modelName,
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        Category: ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
      },
    },
  };

  const getQuestionDetails = (modelId: CardId): StructuredQuestionDetails => ({
    type: "question",
    name: questionName,
    query: {
      "source-table": `card__${modelId}`,
    },
  });

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  function checkColumnMapping(entityTab: string, entityName: string) {
    entityPickerModal().within(() => {
      entityPickerModalTab(entityTab).click();
      cy.findByText(entityName).click();
    });
    modal().findByText("Pick a column…").click();
    popover().findAllByText("Category").eq(0).click();
    modal().within(() => {
      cy.findByText("Category").should("be.visible");
      cy.findByText("Category, Category").should("not.exist");
    });
  }

  it("should not confuse a model field with an expression that has the same name in dashboard parameter sources (metabase#35840)", () => {
    cy.log("Setup dashboard");
    createQuestion(modelDetails).then(({ body: model }) =>
      createQuestion(getQuestionDetails(model.id)),
    );
    visitDashboard(ORDERS_DASHBOARD_ID);
    editDashboard();
    setFilter("Text or Category", "Is");
    setDropdownFilterType();
    sidebar().findByText("Edit").click();

    cy.log("Use model for dropdown source");
    modal().within(() => {
      cy.findByText("From another model or question").click();
      cy.findByText("Pick a model or question…").click();
    });
    checkColumnMapping("Models", modelName);

    cy.log("Use model-based question for dropdown source");
    modal().findByText(modelName).click();
    checkColumnMapping("Questions", questionName);
  });
});

describe("issue 34514", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", "/api/database/*/schema/*").as("fetchTables");
    cy.intercept("GET", "/api/database/*").as("fetchDatabase");

    cy.visit("/");
    // It's important to navigate via UI so that there are
    // enough entries in the browser history to go back to.
    newButton("Model").click();
    cy.findByTestId("new-model-options")
      .findByText("Use the notebook editor")
      .click();
  });

  it("should not make network request with invalid query (metabase#34514)", () => {
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.wait("@fetchTables");
      cy.findByText("Orders").click();
    });

    cy.findByTestId("run-button").click();
    cy.wait("@dataset");
    assertQueryTabState();

    cy.go("back");
    assertBackToEmptyState();
  });

  it("should allow browser history navigation between tabs (metabase#34514)", () => {
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.wait("@fetchTables");
      cy.findByText("Orders").click();
    });

    cy.findByTestId("run-button").click();
    cy.wait("@dataset");
    assertQueryTabState();

    cy.findByTestId("editor-tabs-metadata-name").click();
    assertMetadataTabState();

    // Close the TabHinToast component.
    // This isn't a part of the test scenario but it helps with flakiness.
    cy.icon("close").click();

    cy.go("back");
    cy.wait(["@dataset", "@fetchDatabase"]); // This should be removed when (metabase#45787) is fixed
    assertQueryTabState();

    cy.go("back");
    assertBackToEmptyState();
  });

  function assertQueryTabState() {
    entityPickerModal().should("not.exist");
    cy.button("Save").should("be.enabled");
    getNotebookStep("data").findByText("Orders").should("be.visible");
    cy.findByTestId("TableInteractive-root")
      .findByText("39.72")
      .should("be.visible");
  }

  function assertMetadataTabState() {
    cy.findByLabelText("Description")
      .should("be.visible")
      .and("include.value", "This is a unique ID for the product.");
    cy.button("Save").should("be.enabled");
  }

  function assertBackToEmptyState() {
    entityPickerModal().should("be.visible");
    entityPickerModal().button("Close").click();

    cy.findByTestId("editor-tabs-metadata").should("be.disabled");
    cy.button("Save").should("be.disabled");
    getNotebookStep("data")
      .findByText("Pick your starting data")
      .should("be.visible");
    cy.findByTestId("TableInteractive-root").should("not.exist");
    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("We're experiencing server issues").should("not.exist");
      cy.findByText("Here's where your results will appear").should(
        "be.visible",
      );
    });
  }
});

describe.skip("issues 28270, 33708", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createQuestion(
      {
        type: "model",
        query: {
          "source-table": PRODUCTS_ID,
        },
      },
      { visitQuestion: true },
    );
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("shows object relationships when model-based ad-hoc question has a filter (metabase#28270)", () => {
    checkRelationships();
    modal().icon("close").click();

    tableHeaderClick("Title");
    popover().findByText("Filter by this column").click();
    popover().findByLabelText("Filter operator").click();
    popover().last().findByText("Contains").click();
    popover().findByLabelText("Filter value").type("a,");
    popover().button("Add filter").click();

    checkRelationships();
  });

  it("shows object relationships after navigating back from relationships question (metabase#33708)", () => {
    checkRelationships();

    modal().findByText("Orders").click();
    cy.wait("@dataset");
    cy.go("back");
    cy.go("back"); // TODO: remove this when (metabase#33709) is fixed

    checkRelationships();
  });

  function openObjectDetails() {
    cy.findAllByTestId("cell-data").eq(8).should("have.text", "1").click();
  }

  function checkRelationships() {
    openObjectDetails();

    cy.wait(["@dataset", "@dataset"]);

    modal().within(() => {
      cy.findByTestId("fk-relation-orders")
        .should("be.visible")
        .and("contain.text", "93")
        .and("contain.text", "Orders");

      cy.findByTestId("fk-relation-reviews")
        .should("be.visible")
        .and("contain.text", "8")
        .and("contain.text", "Reviews");
    });
  }
});
