const { H } = cy;

import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_MODEL_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import { DataPermissionValue } from "metabase/admin/permissions/types";
import type {
  CardId,
  FieldReference,
  GroupPermissions,
  NativePermissions,
} from "metabase-types/api";

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

describe("issue 29943", () => {
  function reorderTotalAndCustomColumns() {
    getHeaderCell(1, "Total").should("exist");
    getHeaderCell(2, "Custom").should("exist");

    const tableHeaderAlias = "customHeader";
    H.tableHeaderColumn("Custom").as(tableHeaderAlias);
    H.moveDnDKitElementByAlias(`@${tableHeaderAlias}`, { horizontal: -100 });

    getHeaderCell(1, "Custom").should("exist");
    getHeaderCell(2, "Total").should("exist");
  }

  function assertColumnSelected(columnIndex: number, name: string) {
    getHeaderCell(columnIndex, name)
      .closest("[data-testid=model-column-header-content]")
      .should("have.css", "background-color")
      .and("eq", "rgb(80, 158, 226)");

    cy.findByLabelText("Display name").should("have.value", name);
  }

  function getHeaderCell(columnIndex: number, name: string) {
    // eslint-disable-next-line no-unsafe-element-filtering
    cy.findAllByTestId("header-cell").eq(columnIndex).should("have.text", name);
    return H.tableHeaderColumn(name);
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("selects the right column when clicking a column header (metabase#29943)", () => {
    H.createQuestion(
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

    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();

    reorderTotalAndCustomColumns();
    cy.button("Save changes").click();
    cy.wait("@dataset");

    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();

    assertColumnSelected(0, "ID");

    getHeaderCell(1, "Custom");
    H.tableHeaderClick("Custom");
    assertColumnSelected(1, "Custom");

    getHeaderCell(2, "Total");
    H.tableHeaderClick("Total");
    assertColumnSelected(2, "Total");

    getHeaderCell(0, "ID");
    H.tableHeaderClick("ID");
    assertColumnSelected(0, "ID");
  });
});

describe("issues with metadata editing on models with custom expressions", () => {
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
    H.tableHeaderColumn("Total").as("totalColumn");

    // drag & drop the Total column 80 px to the left to switch it with Tax column
    H.moveDnDKitElementByAlias("@totalColumn", { horizontal: -80 });

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
    H.restore();
    cy.signInAsAdmin();
  });

  it("can edit metadata of a model with a custom column (metabase#35711, metabase#39993)", () => {
    H.createQuestion(
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

    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();

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
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show empty description input for columns without description in metadata (metabase#25884, metabase#34349)", () => {
    H.createQuestion(
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

    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();

    cy.findByLabelText("Description").should("have.text", ID_DESCRIPTION);

    H.tableHeaderClick("Country");
    cy.findByLabelText("Description").should("have.text", "");

    H.tableHeaderClick("ID");
    cy.findByLabelText("Description").should("have.text", ID_DESCRIPTION);
  });
});

describe("issue 23103", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/card/*").as("updateModel");
  });

  it("shows correct number of distinct values (metabase#23103)", () => {
    H.createNativeQuestion(
      {
        type: "model",
        native: {
          query: "select * from products limit 5",
        },
      },
      { visitQuestion: true },
    );

    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();

    cy.findAllByTestId("header-cell").contains("CATEGORY").click();
    cy.findAllByTestId("select-button").contains("None").click();
    H.popover().within(() => {
      cy.findByText("Products").click();
      cy.findByText("Category").click();
    });

    cy.button("Save changes").click();
    cy.wait("@updateModel");
    cy.button("Saving…").should("not.exist");

    cy.findAllByTestId("header-cell").contains("Category").trigger("mouseover");

    H.hovercard().findByText("4 distinct values").should("exist");
  });
});

describe("issue 39150", { viewportWidth: 1600 }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("allows custom columns with the same name in nested models (metabase#39150-1)", () => {
    const ccName = "CC Rating";

    H.createQuestion({
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
      H.createQuestion(
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

    H.openNotebook();
    cy.findByTestId("action-buttons").findByText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "floor([Rating])",
      name: ccName,
      blur: true,
    });

    cy.button("Done").click();

    H.visualize();

    cy.findAllByTestId("header-cell")
      .filter(`:contains('${ccName}')`)
      .should("have.length", 2);
  });

  it("allows custom columns with the same name as the aggregation column from the souce model (metabase#39150-2)", () => {
    H.createQuestion({
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
      H.createQuestion(
        {
          type: "model",
          query: {
            "source-table": `card__${sourceModelId}`,
          },
        },
        { visitQuestion: true },
      );
    });

    H.openNotebook();
    cy.findByTestId("action-buttons").findByText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "[Count] + 1",
      name: "Count",
      blur: true,
    });

    cy.button("Done").click();

    H.visualize();

    cy.findAllByTestId("header-cell")
      .filter(":contains('Count')")
      .should("have.length", 2);

    H.saveQuestion("Nested Model", { wrapId: true, idAlias: "nestedModelId" });

    cy.log("Make sure this works for the deeply nested models as well");
    cy.get("@nestedModelId").then((nestedModelId) => {
      H.createQuestion(
        {
          type: "model",
          query: {
            "source-table": `card__${nestedModelId}`,
          },
        },
        { visitQuestion: true },
      );
    });

    H.openNotebook();
    cy.findByTestId("action-buttons").findByText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "[Count] + 5",
      name: "Count",
      blur: true,
    });

    cy.button("Done").click();

    H.visualize();

    cy.findAllByTestId("header-cell")
      .filter(":contains('Count')")
      .should("have.length", 3);
  });
});

describe("issue 41785, issue 46756", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", "/api/card/*").as("card");
  });

  it("does not break the question when removing column with the same mapping as another column (metabase#41785) (metabase#46756)", () => {
    // it's important to create the model through UI to reproduce this issue
    H.startNewModel();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Products").click();
    });
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Products").click();
    });
    H.popover().findByText("ID").click();
    H.popover().findByText("ID").click();

    cy.findByTestId("run-button").click();
    cy.wait("@dataset");

    cy.button("Save").click();
    H.modal().button("Save").click();

    cy.log(
      "verify that we redirected after saving the model and all card data is loaded",
    );
    cy.url().should("contain", "products-products");
    cy.wait("@card");
    cy.findByTestId("visualization-root").should(
      "contain",
      "Rustic Paper Wallet",
    );

    H.openVizSettingsSidebar();
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

    H.tableInteractive().should("contain", "Small Marble Shoes");
  });
});

describe("issue 40635", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("correctly displays question's and nested model's column names (metabase#40635)", () => {
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });

    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("Select all").click();

    H.join();

    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Products").click();
    });

    H.getNotebookStep("join", { stage: 0, index: 0 })
      .button("Pick columns")
      .click();
    H.popover().within(() => {
      cy.findByText("Select all").click();
      cy.findByText("ID").click();
    });

    H.join();

    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Products").click();
    });

    H.getNotebookStep("join", { stage: 0, index: 1 })
      .button("Pick columns")
      .click();
    H.popover().within(() => {
      cy.findByText("Select all").click();
      cy.findByText("ID").click();
    });

    H.getNotebookStep("join", { stage: 0, index: 1 })
      .findByText("Product ID")
      .click();
    H.popover().findByText("User ID").click();

    H.visualize();
    assertSettingsSidebar();
    assertVisualizationColumns();

    cy.button("Save").click();
    H.modal().button("Save").click();

    assertSettingsSidebar();
    assertVisualizationColumns();

    H.openQuestionActions();
    H.popover().findByTextEnsureVisible("Turn into a model").click();
    H.modal().button("Turn this into a model").click();
    H.undoToast()
      .should("contain", "This is a model now")
      .icon("close")
      .click();

    assertSettingsSidebarNestedQuery();
    assertVisualizationColumns();

    H.openNotebook();
    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().within(() => {
      cy.findAllByText("ID").should("have.length", 1);
      cy.findAllByText("Products → ID").should("have.length", 1);
      cy.findAllByText("Products - User → ID").should("have.length", 1);
    });
  });

  function assertVisualizationColumns() {
    assertTableHeader(0, "ID");
    assertTableHeader(1, "Products → ID");
    assertTableHeader(2, "Products - User → ID");
  }

  function assertTableHeader(index: number, name: string) {
    // eslint-disable-next-line no-unsafe-element-filtering
    cy.findAllByTestId("header-cell").eq(index).should("have.text", name);
  }

  function assertSettingsSidebar() {
    H.openVizSettingsSidebar();

    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findAllByText("ID").should("have.length", 1);
      cy.findAllByText("Products → ID").should("have.length", 1);
      cy.findAllByText("Products - User → ID").should("have.length", 1);

      cy.findByRole("button", { name: "Add or remove columns" }).click();
      cy.findAllByText("ID").should("have.length", 4);
      cy.findAllByText("Products").should("have.length", 1);
      cy.findAllByText("Products 2").should("have.length", 1);
    });

    cy.button("Done").click();
  }

  function assertSettingsSidebarNestedQuery() {
    H.openVizSettingsSidebar();

    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findAllByText("ID").should("have.length", 1);
      cy.findAllByText("Products → ID").should("have.length", 1);
      cy.findAllByText("Products - User → ID").should("have.length", 1);

      cy.findByRole("button", { name: "Add or remove columns" }).click();
      cy.findAllByText("ID").should("have.length", 1);
      cy.findAllByText("Products → ID").should("have.length", 1);
      cy.findAllByText("Products - User → ID").should("have.length", 1);
    });

    cy.button("Done").click();
  }
});

describe("issue 33427", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("does not confuse the names of various native model columns mapped to the same database field (metabase#33427)", () => {
    H.createNativeQuestion(
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

    cy.findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();

    H.openColumnOptions("CREATED_BY");
    H.mapColumnTo({ table: "Products", column: "Title" });
    H.renameColumn("Title", "CREATED_BY");

    H.openColumnOptions("UPDATED_BY");
    H.mapColumnTo({ table: "Products", column: "Title" });
    H.renameColumn("Title", "UPDATED_BY");

    assertColumnHeaders();
    H.saveMetadataChanges();

    assertColumnHeaders();

    H.openNotebook();
    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().within(() => {
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

describe("issue 25113", () => {
  const questionDetails: StructuredQuestionDetails = {
    name: "People Question",
    type: "question",
    query: {
      "source-table": PEOPLE_ID,
      fields: [["field", PEOPLE.ID, null]],
    },
  };

  const modelDetails: StructuredQuestionDetails = {
    ...questionDetails,
    name: "People Model",
    type: "model",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not mistakenly override model column metadata with raw field metadata (metabase#25113)", () => {
    H.createQuestion(modelDetails, { visitQuestion: true });
    H.openQuestionActions("Edit metadata");
    H.waitForLoaderToBeRemoved();
    H.openColumnOptions("ID");
    H.renameColumn("ID", "ID renamed");
    H.saveMetadataChanges();

    H.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("People Model").click();
    });
    H.popover().findByText("ID").click();
    H.popover().findByText("ID renamed").click();
    H.visualize();
    H.assertTableData({ columns: ["ID", "People Model → ID renamed"] });
  });
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
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateModel");
  });

  it("should not overwrite the description of one column with the description of another column (metabase#39749)", () => {
    H.createQuestion(modelDetails).then(({ body: card }) =>
      H.visitModel(card.id),
    );

    cy.log("edit metadata");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();
    H.tableHeaderClick("Count");
    cy.findByLabelText("Description").type("A");
    H.tableHeaderClick("Sum of Total");
    cy.findByLabelText("Description").should("have.text", "").type("B");
    H.tableHeaderClick("Count");
    cy.findByLabelText("Description").should("have.text", "A");
    H.tableHeaderClick("Sum of Total");
    cy.findByLabelText("Description").should("have.text", "B");
    cy.button("Save changes").click();
    cy.wait("@updateModel");

    cy.log("verify that the description was updated successfully");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();
    H.tableHeaderClick("Count");
    cy.findByLabelText("Description").should("have.text", "A");
    H.tableHeaderClick("Sum of Total");
    cy.findByLabelText("Description").should("have.text", "B");
  });
});

describe("issue 25885", () => {
  const mbqlModelDetails: StructuredQuestionDetails = {
    type: "model",
    query: {
      "source-table": ORDERS_ID,
      fields: [["field", ORDERS.ID, { "base-type": "type/BigInteger" }]],
      joins: [
        {
          fields: [
            [
              "field",
              ORDERS.ID,
              { "base-type": "type/BigInteger", "join-alias": "Orders" },
            ],
          ],
          strategy: "left-join",
          alias: "Orders",
          condition: [
            "=",
            ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
            [
              "field",
              ORDERS.ID,
              { "base-type": "type/BigInteger", "join-alias": "Orders" },
            ],
          ],
          "source-table": ORDERS_ID,
        },
        {
          fields: [
            [
              "field",
              ORDERS.ID,
              { "base-type": "type/BigInteger", "join-alias": "Orders_2" },
            ],
          ],
          strategy: "left-join",
          alias: "Orders_2",
          condition: [
            "=",
            ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
            [
              "field",
              ORDERS.ID,
              { "base-type": "type/BigInteger", "join-alias": "Orders_2" },
            ],
          ],
          "source-table": ORDERS_ID,
        },
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateModel");
  });

  function setColumnName(oldName: string, newName: string) {
    H.tableHeaderClick(oldName);
    cy.findByLabelText("Display name")
      .should("have.value", oldName)
      .clear()
      .type(newName)
      .blur();
    H.tableInteractive().findByTextEnsureVisible(newName);
  }

  function verifyColumnName(name: string) {
    H.tableHeaderClick(name);
    cy.findByLabelText("Display name").should("have.value", name);
  }

  it("should allow to edit metadata for mbql models with self joins columns (metabase#25885)", () => {
    H.createQuestion(mbqlModelDetails).then(({ body: card }) =>
      H.visitModel(card.id),
    );
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();
    setColumnName("ID", "ID1");
    setColumnName("Orders → ID", "ID2");
    setColumnName("Orders_2 → ID", "ID3");
    verifyColumnName("ID1");
    verifyColumnName("ID2");
    verifyColumnName("ID3");
  });
});

describe("issue 33844", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("createModel");
    cy.intercept("PUT", "/api/card/*").as("updateModel");
  });

  function testModelMetadata(isNew: boolean) {
    cy.log("make a column visible only in detail views");
    cy.findAllByTestId("detail-shortcut").should("not.exist");
    H.tableHeaderClick("ID");
    cy.findByLabelText("Detail views only").click();
    cy.button(isNew ? "Save" : "Save changes").click();
    if (isNew) {
      H.modal().button("Save").click();
      cy.wait("@createModel");
    } else {
      cy.wait("@updateModel");
      cy.wait("@dataset");
    }
    H.tableInteractive().findByText("User ID").should("be.visible");
    H.tableInteractive().findByText("ID").should("not.exist");
    H.openObjectDetail(0);
    H.modal().within(() => {
      cy.findByText("Quantity").should("be.visible");
      cy.findByRole("heading", { name: "1" }).should("be.visible");
      cy.findByLabelText("Close").click();
    });

    cy.log("make the column visible in table views");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();
    H.tableHeaderClick("ID");
    cy.findByLabelText("Detail views only").should("be.checked");
    cy.findByLabelText("Table and details views").click();
    cy.button("Save changes").click();
    cy.wait("@updateModel");
    cy.wait("@dataset");
    H.tableInteractive().findByText("ID").should("be.visible");
  }

  it("should show hidden PKs in model metadata editor and object details after creating a model (metabase#33844)", () => {
    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use the notebook editor")
      .click();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    cy.findByTestId("run-button").click();
    cy.wait("@dataset");
    cy.findByTestId("dataset-edit-bar").findByText("Columns").click();
    testModelMetadata(true);
  });

  it("should show hidden PKs in model metadata editor and object details after updating a model (metabase#33844,metabase#45924)", () => {
    H.visitModel(ORDERS_QUESTION_ID);
    cy.wait("@dataset");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();
    testModelMetadata(false);
  });
});

describe("issue 45924", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should preserve model metadata when re-running the query (metabase#45924)", () => {
    H.visitModel(ORDERS_QUESTION_ID);
    cy.wait("@dataset");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();
    H.tableHeaderClick("ID");
    cy.findByLabelText("Display name").clear().type("ID1");
    cy.findByTestId("dataset-edit-bar").findByText("Query").click();
    cy.findByTestId("action-buttons").button("Sort").click();
    H.popover().findByText("ID").click();
    cy.findByTestId("run-button").click();
    cy.wait("@dataset");
    cy.findByTestId("dataset-edit-bar").findByText("Columns").click();
    H.tableHeaderClick("ID1");
    cy.findByLabelText("Display name").should("have.value", "ID1");
    cy.findByTestId("dataset-edit-bar").button("Save changes").click();
    cy.wait("@updateCard");
    cy.wait("@dataset");
    H.tableInteractive().findByText("ID1").should("be.visible");
  });
});

describe("issue 43088", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to create ad-hoc questions based on instance analytics models (metabase#43088)", () => {
    cy.visit("/");
    H.navigationSidebar().findByText("Usage analytics").click();
    H.getPinnedSection().findByText("People").scrollIntoView().click();
    cy.wait("@dataset");
    H.summarize();
    H.rightSidebar().button("Done").click();
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(1);
  });
});

describe("issue 34574", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/card/*/query_metadata").as("metadata");
    cy.intercept("GET", "/api/card/*").as("card");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("GET", "/api/table/*/fks").as("fks");
    cy.intercept("GET", "/api/collection/root/items?**").as("rootCollection");
    cy.intercept("POST", "api/dataset").as("dataset");
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
    H.createQuestion(modelDetails).then(({ body: { id: modelId } }) =>
      H.visitModel(modelId),
    );
    cy.wait(["@card", "@metadata", "@dataset"]);

    cy.findByTestId("qb-header-action-panel").within(() => {
      // make sure the model fully loaded
      cy.findByTestId("run-button").should("exist");
      H.questionInfoButton().click();
    });

    H.sidesheet().within(() => {
      cy.log("Set the model description to a markdown text");
      cy.findByPlaceholderText("Add description").type(
        "# Hello{enter}## World{enter}This is an **important** description!",
      );
      cy.realPress("Tab");
      cy.wait(["@metadata", "@updateCard"]);

      cy.log("Make sure we immediately render the proper markdown");
      cy.findByTestId("editable-text").get("textarea").should("not.exist");
      cy.findByTestId("editable-text").within(assertMarkdownPreview);
      cy.findByLabelText("Close").click();
    });

    cy.log(
      "Make sure the description is present in the collection entry tooltip",
    );
    cy.findByTestId("app-bar").findByText("Our analytics").click();
    cy.wait(["@rootCollection", "@rootCollection"]);
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
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not change the url when reloading the page while editing a model (metabase#34517)", () => {
    H.startNewModel();
    cy.location("pathname").should("eq", "/model/query");

    // wait for the model editor to be fully loaded
    H.miniPicker().should("exist");
    cy.reload();

    // wait for the model editor to be fully loaded
    H.miniPicker().should("exist");
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
    H.restore();
    cy.signInAsNormalUser();
  });

  function checkColumnMapping(entityTab: string, entityName: string) {
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab(entityTab).click();
      cy.findByText(entityName).click();
    });
    H.modal().findByText("Pick a column…").click();
    H.popover().findAllByText("Category").eq(0).click();
    H.modal().within(() => {
      cy.findByText("Category").should("be.visible");
      cy.findByText("Category, Category").should("not.exist");
    });
  }

  it("should not confuse a model field with an expression that has the same name in dashboard parameter sources (metabase#35840)", () => {
    cy.log("Setup dashboard");
    H.createQuestion(modelDetails).then(({ body: model }) =>
      H.createQuestion(getQuestionDetails(model.id)),
    );
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.setDropdownFilterType();
    H.sidebar().findByText("Edit").click();

    cy.log("Use model for dropdown source");
    H.modal().within(() => {
      cy.findByText("From another model or question").click();
      cy.findByText("Pick a model or question…").click();
    });
    checkColumnMapping("Models", modelName);

    cy.log("Use model-based question for dropdown source");
    H.modal().findByText(modelName).click();
    checkColumnMapping("Questions", questionName);
  });
});

describe("issue 36161", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow to override metadata for custom columns (metabase#36161)", () => {
    cy.log("Go straight to model query definition");
    cy.visit(`/model/${ORDERS_MODEL_ID}/query`);
    H.tableInteractiveBody().should("be.visible").and("contain", "37.65");

    cy.log("Deselect all columns (except for ID)");
    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("Select all").click();

    cy.log("Add two custom columns based on the ID");
    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({ formula: "[ID]", name: "ID2" });
    H.popover().button("Done").click();
    H.getNotebookStep("expression").icon("add").click();
    H.enterCustomColumnDetails({ formula: "[ID]", name: "ID3" });
    H.popover().button("Done").click();
    H.runButtonOverlay().click();
    cy.wait("@dataset");

    cy.log("Rename custom columns");
    cy.findByTestId("editor-tabs-columns-name").click();
    H.openColumnOptions("ID2");
    H.renameColumn("ID2", "ID2 custom");
    H.openColumnOptions("ID3");
    H.renameColumn("ID3", "ID3 custom");
    H.saveMetadataChanges();

    cy.log("Assert that the renamed columns appear in filter options");
    H.openNotebook();
    H.getNotebookStep("data").button("Filter").click();
    H.popover().within(() => {
      cy.findByText("ID").should("be.visible");
      cy.findByText("ID2 custom").should("be.visible");
      cy.findByText("ID3 custom").should("be.visible");
    });
  });
});

describe("issue 34514", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", "/api/database/*").as("fetchDatabase");

    // It's important to navigate via UI so that there are
    // enough entries in the browser history to go back to.
    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use the notebook editor")
      .click();
  });

  it("should not make network request with invalid query (metabase#34514)", () => {
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });

    cy.findByTestId("run-button").click();
    cy.wait("@dataset");
    assertQueryTabState();

    cy.go("back");
    assertBackToEmptyState();
  });

  it("should allow browser history navigation between tabs (metabase#34514, metabase#45787)", () => {
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });

    cy.findByTestId("run-button").click();
    cy.wait("@dataset");
    assertQueryTabState();

    cy.findByTestId("editor-tabs-columns-name").click();
    assertMetadataTabState();
    cy.get("@dataset.all").should("have.length", 1);

    cy.go("back");
    assertQueryTabState();
    cy.get("@dataset.all").should("have.length", 1);

    cy.go("back");
    assertBackToEmptyState();
    cy.get("@dataset.all").should("have.length", 1);
  });

  function assertQueryTabState() {
    H.entityPickerModal().should("not.exist");
    cy.button("Save").should("be.enabled");
    H.getNotebookStep("data").findByText("Orders").should("be.visible");
    H.tableInteractive().findByText("39.72").should("be.visible");
  }

  function assertMetadataTabState() {
    cy.findByLabelText("Description")
      .should("be.visible")
      .and("include.value", "This is a unique ID for the product.");
    cy.button("Save").should("be.enabled");
  }

  function assertBackToEmptyState() {
    H.miniPicker().should("be.visible");

    cy.findByTestId("editor-tabs-columns").should("be.disabled");
    cy.button("Save").should("be.disabled");
    H.getNotebookStep("data")
      .findByPlaceholderText("Search for tables and more...")
      .should("be.visible");
    H.tableInteractive().should("not.exist");
    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("We're experiencing server issues").should("not.exist");
      cy.findByText("Here's where your results will appear").should(
        "be.visible",
      );
    });
  }
});

describe("issue 47988", () => {
  const model1Details: StructuredQuestionDetails = {
    name: "M1",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          "source-table": PRODUCTS_ID,
          alias: "Products",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          fields: "all",
        },
      ],
    },
  };

  const model2Details: StructuredQuestionDetails = {
    name: "M2",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          "source-table": PRODUCTS_ID,
          alias: "Products",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          fields: "all",
        },
        {
          "source-table": REVIEWS_ID,
          alias: "Reviews",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", REVIEWS.PRODUCT_ID, { "join-alias": "Reviews" }],
          ],
          fields: "all",
        },
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to execute a query with joins to the same table in base queries (metabase#47988)", () => {
    H.createQuestion(model1Details);
    H.createQuestion(model2Details);
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("M1").click();
    });
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("M2").click();
    });
    H.visualize();
    H.tableInteractive().should("be.visible");
  });
});

describe("issue 46221", () => {
  const modelDetails: NativeQuestionDetails = {
    name: "46221",
    native: { query: "select 42" },
    type: "model",
    collection_id: FIRST_COLLECTION_ID as number,
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(modelDetails, { visitQuestion: true });
  });

  it("should retain the same collection name between ad-hoc question based on a model and a model itself (metabase#46221)", () => {
    cy.location("pathname").should("match", /^\/model\/\d+/);
    cy.findByTestId("head-crumbs-container")
      .should("contain", "First collection")
      .and("contain", modelDetails.name);

    cy.log("Change the viz type");
    H.openVizTypeSidebar();
    cy.findByTestId("sidebar-left").within(() => {
      cy.findByTestId("Table-button").click();
    });

    cy.log("Make sure we're now in an ad-hoc question mode");
    cy.location("pathname").should("eq", "/question");

    cy.findByTestId("head-crumbs-container")
      .should("contain", "First collection")
      .and("contain", modelDetails.name);
  });
});

describe("issue 20624", () => {
  const questionDetails: StructuredQuestionDetails = {
    name: "Question",
    type: "question",
    query: {
      "source-table": PRODUCTS_ID,
    },
    visualization_settings: {
      column_settings: {
        '["name","VENDOR"]': { column_title: "Retailer" },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should reset the question's viz settings when converting to a model (metabase#20624)", () => {
    cy.log("check that a column is renamed via the viz settings");
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.tableInteractive().within(() => {
      cy.findByText("Retailer").should("be.visible");
      cy.findByText("Vendor").should("not.exist");
    });

    cy.log("check that the viz settings are reset when converting to a model");
    H.openQuestionActions();
    H.popover().findByText("Turn into a model").click();
    H.modal().findByText("Turn this into a model").click();
    cy.wait("@updateCard");
    H.tableInteractive().within(() => {
      cy.findByText("Vendor").should("be.visible");
      cy.findByText("Retailer").should("not.exist");
    });

    cy.log("rename the column using the model's metadata");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();
    H.tableHeaderClick("Vendor");
    cy.findByLabelText("Display name").clear().type("Retailer");
    cy.button("Save changes").should("be.enabled").click();
    cy.wait("@updateCard");
    H.tableInteractive().within(() => {
      cy.findByText("Retailer").should("be.visible");
      cy.findByText("Vendor").should("not.exist");
    });
  });
});

describe("issue 37300", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestion(
      {
        type: "model",
        query: {
          "source-table": PRODUCTS_ID,
          filter: ["=", ["field", PRODUCTS.ID, null], "999991"],
        },
      },
      { visitQuestion: true },
    );
  });

  it("should show the table headers even when there are no results (metabase/metabase#37300)", () => {
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.waitForLoaderToBeRemoved();

    H.main().within(() => {
      cy.findByText("ID").should("be.visible");
      cy.findByText("Ean").should("be.visible");

      cy.findByText("No results!").should("be.visible");
    });
  });
});

describe("issue 32037", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    cy.visit("/browse/models");
    cy.findByLabelText("Orders Model").click();
    H.tableInteractive().should("be.visible");
    cy.location("pathname").as("modelPathname");
  });

  it("should show unsaved changes modal and allow to discard changes when editing model's query (metabase#32037)", () => {
    H.openQuestionActions("Edit query definition");
    cy.button("Save changes").should("be.disabled");
    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("ID").click();
      cy.findByPlaceholderText("Enter an ID").type("1").blur();
      cy.button("Add filter").click();
    });
    cy.button("Save changes").should("be.enabled");
    cy.go("back");

    verifyDiscardingChanges();
  });

  it("should show unsaved changes modal and allow to discard changes when editing model's metadata (metabase#32037)", () => {
    H.openQuestionActions("Edit metadata");
    H.waitForLoaderToBeRemoved();
    cy.button("Save changes").should("be.disabled");
    cy.findByLabelText("Description").type("123").blur();
    cy.button("Save changes").should("be.enabled");
    cy.go("back");

    verifyDiscardingChanges();
  });

  function verifyDiscardingChanges() {
    H.modal().within(() => {
      cy.findByText("Discard your changes?").should("be.visible");
      cy.findByText("Discard changes").click();
    });

    H.tableInteractive().should("be.visible");
    cy.button("Save changes").should("not.exist");
    cy.get("@modelPathname").then((modelPathname) => {
      cy.location("pathname").should("eq", modelPathname);
    });
  }
});

describe("issue 51925", () => {
  function setLinkDisplayType() {
    cy.findByTestId("chart-settings-widget-view_as").findByText("Link").click();
  }

  function linkTextInput() {
    return cy
      .findByTestId("chart-settings-widget-link_text")
      .findByRole("combobox");
  }

  function linkUrlInput() {
    return cy
      .findByTestId("chart-settings-widget-link_url")
      .findByRole("combobox");
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it('should allow to set "Display as Link" options independently for each column (metabase#51925)', () => {
    H.visitModel(ORDERS_MODEL_ID);
    H.openQuestionActions("Edit metadata");
    H.waitForLoaderToBeRemoved();
    H.tableInteractive().findByText("User ID").click();
    H.rightSidebar().within(() => {
      setLinkDisplayType();
      linkTextInput().type("User {{USER_ID}}", {
        parseSpecialCharSequences: false,
      });
      linkUrlInput().type("https://example.com/{{USER_ID}}", {
        parseSpecialCharSequences: false,
      });
    });
    H.tableInteractive().findByText("Product ID").click();
    H.rightSidebar().within(() => {
      setLinkDisplayType();
      linkTextInput().type("Product {{PRODUCT_ID}}", {
        parseSpecialCharSequences: false,
      });
      linkUrlInput().type("https://example.com/{{PRODUCT_ID}}", {
        parseSpecialCharSequences: false,
      });
    });
    H.tableInteractive().findByText("User ID").click();
    H.rightSidebar().within(() => {
      linkTextInput().should("have.value", "User {{USER_ID}}");
      linkUrlInput().should("have.value", "https://example.com/{{USER_ID}}");
    });
    H.saveMetadataChanges();
    H.tableInteractive().within(() => {
      cy.findAllByRole("link", { name: "User 1" })
        .first()
        .should("have.attr", "href", "https://example.com/1");
      cy.findAllByRole("link", { name: "Product 6" })
        .first()
        .should("have.attr", "href", "https://example.com/6");
    });
  });
});

describe("issue 53649", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not get caught in an infinite loop when opening the native editor (metabase#53649)", () => {
    H.startNewNativeModel();

    // If the app freezes, this won't work
    H.NativeEditor.type("select 1");
    H.NativeEditor.get().should("contain", "select 1");
  });
});

describe("issue 56698", () => {
  beforeEach(() => {
    H.restore();
  });

  it("should create an editable ad-hoc query based on a read-only native model (metabase#56698)", () => {
    cy.log("create a native model");
    cy.signInAsNormalUser();
    H.createNativeQuestion(
      {
        name: "Native model",
        native: { query: "select 1 union all select 2" },
        type: "model",
      },
      { wrapId: true, idAlias: "modelId" },
    );

    cy.log("verify that we create an editable ad-hoc query");
    cy.signIn("readonlynosql");
    cy.get("@modelId").then((modelId) => H.visitModel(Number(modelId)));
    H.assertQueryBuilderRowCount(2);
    H.summarize();
    H.rightSidebar().button("Done").click();
    H.assertQueryBuilderRowCount(1);
  });
});

describe("issue 57557", () => {
  beforeEach(() => {
    H.restore();
  });

  it("should not allow to see the query definition for a user without data permissions (metabase#57557)", () => {
    cy.log("create a native model");
    cy.signInAsNormalUser();
    H.createNativeQuestion(
      {
        name: "Native model",
        native: { query: "select 1 union all select 2" },
        type: "model",
      },
      { wrapId: true, idAlias: "modelId" },
    );

    cy.log("verify that query editing functionality is hidden");
    cy.signIn("nodata");
    cy.get("@modelId").then((modelId) =>
      H.visitModel(Number(modelId), { hasDataAccess: false }),
    );
    H.openQuestionActions();
    H.popover().within(() => {
      cy.findByText("Edit metadata").should("be.visible");
      cy.findByText("Edit query definition").should("not.exist");
      cy.findByText("Edit metadata").click();
    });
    H.waitForLoaderToBeRemoved();
    cy.findByTestId("editor-tabs-query").should("be.disabled");
    cy.findByTestId("editor-tabs-columns").should("be.checked");
  });
});

describe("issue 56775", () => {
  const MODEL_NAME = "Model 56775";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
        type: "model",
        name: MODEL_NAME,
        query: {
          "source-table": PRODUCTS_ID,
        },
      },
      { visitQuestion: true },
    );
  });

  it("should render the correct query after using the back button in a model (metabase#56775)", () => {
    H.openNotebook();
    cy.button("Visualize").click();

    cy.go("back");
    H.openQuestionActions("Edit query definition");

    cy.log("verify that the model definition is visible");
    H.getNotebookStep("data").findByText(MODEL_NAME).should("not.exist");
    H.getNotebookStep("data").findByText("Products").should("be.visible");
  });
});

describe("issue 57359", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should not break the model when editing metadata (metabase#57359)", () => {
    cy.log("create a question with two joins without running the query");
    H.openOrdersTable({ mode: "notebook" });
    cy.wrap([1, 2]).each(() => {
      H.join();
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Products").click();
      });
    });
    H.saveQuestion("Q1");

    cy.log("turn the question into a model");
    H.openQuestionActions("Turn into a model");
    H.modal().button("Turn this into a model").click();
    cy.wait("@updateCard");

    cy.log("edit query metadata");
    H.openQuestionActions("Edit metadata");
    H.waitForLoaderToBeRemoved();
    H.openColumnOptions("Product ID");
    H.renameColumn("Product ID", "Product ID2");
    H.saveMetadataChanges();

    cy.log("make sure the query is run successfully");
    H.tableInteractive().should("be.visible");
  });
});

describe("issue 55486", () => {
  const MODEL_NAME = "Model 55486";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
        type: "model",
        name: MODEL_NAME,
        query: {
          "source-table": PRODUCTS_ID,
          limit: 5,
        },
      },
      { visitQuestion: true },
    );
  });

  function checkIsShowingMetadataEditorTab() {
    cy.findByTestId("editor-tabs-columns").should("be.checked");
    cy.findByTestId("visualization-root").should("be.visible");
  }

  function checkIsShowingQueryEditorTab() {
    cy.findByTestId("editor-tabs-query").should("be.checked");
    H.getNotebookStep("data").should("be.visible");
  }

  it("should render the correct query after using the back button in a model (metabase#56775)", () => {
    H.openQuestionActions("Edit query definition");

    H.datasetEditBar().findByText("Columns").click();
    checkIsShowingMetadataEditorTab();

    H.datasetEditBar().findByText("Query").click();
    checkIsShowingQueryEditorTab();

    cy.log("Back button should show the metadata editor");
    cy.go("back");
    checkIsShowingMetadataEditorTab();

    cy.log("Back button should show the query editor");
    cy.go("back");
    checkIsShowingQueryEditorTab();

    cy.log("Forward button should show the query editor");
    cy.go("forward");
    checkIsShowingMetadataEditorTab();

    cy.log("Forward button should show the query editor");
    cy.go("forward");
    checkIsShowingQueryEditorTab();
  });
});

describe("Issue 30712", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.startNewModel();

    H.miniPicker().findByText("Sample Database").click();
    H.miniPicker().findByText("Orders").click();
    H.join();
    H.joinTable("Products");

    H.join();
    H.joinTable("People");
  });

  it("should not crash the editor when ordering by columns on joined tables (metabase#30712)", () => {
    H.getNotebookStep("summarize").findByLabelText("Sort").click();
    H.popover().findByText("Total").click();

    cy.log("no error should be thrown");
    cy.get("main").findByText("Something's gone wrong").should("not.exist");
    cy.findByTestId("run-button").should("be.visible");
  });
});

describe("issue 60930", { tags: "@skip" }, () => {
  const modelDetails: StructuredQuestionDetails = {
    name: "Model",
    type: "model",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          "source-table": PRODUCTS_ID,
          alias: "Products",
          strategy: "left-join",
          fields: "all",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
            [
              "field",
              PRODUCTS.ID,
              { "base-type": "type/BigInteger", "join-alias": "Products" },
            ],
          ],
        },
        {
          "source-table": REVIEWS_ID,
          alias: "Reviews",
          strategy: "left-join",
          fields: "all",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
            [
              "field",
              REVIEWS.PRODUCT_ID,
              { "base-type": "type/Integer", "join-alias": "Reviews" },
            ],
          ],
        },
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not apply model metadata overrides to incorrect columns after changes in the query (metabase#60930)", () => {
    cy.log("create a model");
    H.createQuestion(modelDetails).then(({ body: card }) =>
      H.visitModel(card.id),
    );

    cy.log("override the column name");
    H.openQuestionActions("Edit metadata");
    H.waitForLoaderToBeRemoved();
    H.openColumnOptions("Products → ID");
    H.renameColumn("Products → ID", "ID2");
    H.saveMetadataChanges();
    H.tableInteractive().findByText("ID2").should("exist");

    cy.log("remove the ID2 column from the query");
    H.openQuestionActions("Edit query definition");
    H.getNotebookStep("join", { index: 0 })
      .findByLabelText("Pick columns")
      .click();
    H.popover().findByLabelText("Select all").click();
    H.saveMetadataChanges();
    H.tableInteractive().findByText("ID2").should("not.exist");
  });
});

describe("Issue 56913", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
        },
      },
      { visitQuestion: true },
    );

    H.openQuestionActions();
    H.popover().findByText("Turn into a model").click();
    H.modal().button("Turn this into a model").click();

    H.createNativeQuestion(
      {
        native: {
          query: "select {{ x }}",
          "template-tags": {
            x: {
              id: "d7f1fb15-c7b8-6051-443d-604b6ed5457b",
              name: "x",
              "display-name": "X",
              type: "text",
              default: null,
            },
          },
        },
      },
      { visitQuestion: true },
    );
  });

  it("should show the error modal when converting a native question with variables into a model, even when the 'turn into a model' modal was previously acknowledged (metabase#56913)", () => {
    H.openQuestionActions();
    H.popover().findByText("Turn into a model").click();
    H.modal()
      .findByText("Variables in models aren't supported yet")
      .should("be.visible");
  });
});

describe.skip("issue 45919", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow to query a model with a hidden column", () => {
    cy.log("create a new model with result_metadata");
    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use the notebook editor")
      .click();
    H.entityPickerModal().findByText("People").click();
    H.runButtonOverlay().click();
    H.tableInteractive().should("be.visible");
    cy.findByTestId("dataset-edit-bar").button("Save").click();
    cy.findByTestId("save-question-modal").button("Save").click();
    H.queryBuilderHeader().should("be.visible");
    H.tableInteractiveHeader().findByText("Password").should("be.visible");

    cy.log("hide the Password field");
    cy.request("PUT", `/api/field/${PEOPLE.PASSWORD}`, {
      visibility_type: "sensitive",
    });

    cy.log("the query should succeed, and the Password field should be hidden");
    H.queryBuilderHeader().button("Refresh").click();
    H.tableInteractive().should("be.visible");
    H.tableInteractiveHeader().findByText("Password").should("not.exist");
    H.tableInteractiveHeader().findByText("Email").should("be.visible");
  });
});

describe("issue 50915", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should use the model for the data source for drills after the model is created (metabase#50915)", () => {
    cy.log("create a model via the UI");
    cy.visit("/model/new");
    H.main().findByText("Use the notebook editor").click();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("People").click();
    });
    cy.findByTestId("dataset-edit-bar").button("Save").click();
    cy.findByTestId("save-question-modal").button("Save").click();
    H.queryBuilderHeader().should("be.visible");
    H.queryBuilderMain()
      .findByText("37.65", { timeout: 10000 })
      .should("be.visible");

    cy.log("immediately after saving, drill-thru");
    H.tableHeaderClick("Discount ($)");
    H.popover().findByText("Distinct values").click();
    H.queryBuilderMain()
      .findByText("1,115", { timeout: 10000 })
      .should("be.visible");
    H.assertTableData({ columns: ["Distinct values of Discount"] });

    cy.log("assert that the model is used for the data source");
    H.openNotebook();
    H.getNotebookStep("data")
      .findByText("Orders + People")
      .should("be.visible");
  });
});

describe("issue 38747", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow you to drill through with entity qualified ids", () => {
    cy.visit("/model/new");
    cy.findByRole("link", { name: /notebook editor/ }).click();

    H.miniPickerBrowseAll().click();
    H.entityPickerModalItem(0, "Databases").click();
    H.entityPickerModalItem(1, "Products").click();
    H.runButtonInOverlay().click();

    // Wait for the query to run so we can click the columns "button"
    // ... It's actually a list item, so we can't check to see if it's
    // actually disabled in any sane way
    H.tableInteractive().should("exist");

    H.datasetEditBar().findByText("Columns").click();
    cy.findAllByTestId("model-column-header-content")
      .contains("Vendor")
      .click();

    cy.findByPlaceholderText("Select a semantic type").click();
    H.popover().findByText("Entity Key").click();
    H.datasetEditBar().button("Save").click();

    H.modal().button("Save").click();

    cy.findByRole("gridcell", { name: "Nolan-Wolff" }).click();

    // Assert that we're at an adhoc question with aproprate filters
    cy.location("pathname").should("equal", "/question");
    cy.findByTestId("filter-pill").should(
      "contain.text",
      "Vendor is Nolan-Wolff",
    );
    H.tableInteractive().should("have.attr", "data-rows-count", "1");
  });
});

describe("issue 67680", () => {
  function setTablePermissions(createQueriesPermission: NativePermissions) {
    const permissions: GroupPermissions = {
      [SAMPLE_DB_ID]: {
        "view-data": {
          public: {
            [ORDERS_ID]: DataPermissionValue.BLOCKED,
            [PRODUCTS_ID]: DataPermissionValue.UNRESTRICTED,
          },
        },
        "create-queries": createQueriesPermission,
      },
    };
    cy.updatePermissionsGraph({
      [USER_GROUPS.ALL_USERS_GROUP]: permissions,
      [USER_GROUPS.DATA_GROUP]: permissions,
      [USER_GROUPS.COLLECTION_GROUP]: permissions,
    });
  }

  function setTablePermissionsWithCreateQueries() {
    setTablePermissions(DataPermissionValue.QUERY_BUILDER);
  }

  function setTablePermissionsWithoutCreateQueries() {
    setTablePermissions(DataPermissionValue.NO);
  }

  function updateModelSourceTableWithResultMetadata() {
    H.visitModel(ORDERS_MODEL_ID);
    H.openQuestionActions("Edit query definition");
    H.getNotebookStep("data").findByText("Orders").click();
    H.popover().findByText("Products").click();
    H.runButtonInOverlay().click();
    H.tableInteractiveHeader().findByText("Category").should("be.visible");
    H.saveMetadataChanges();
  }

  function updateModelSourceTableWithoutResultMetadata() {
    H.visitModel(ORDERS_MODEL_ID);
    H.openQuestionActions("Edit query definition");
    H.getNotebookStep("data").findByText("Orders").click();
    H.popover().findByText("Products").click();
    H.saveMetadataChanges();
  }

  function verifyNormalUserCanAccessModel() {
    cy.signInAsNormalUser();
    H.visitModel(ORDERS_MODEL_ID);
    H.assertQueryBuilderRowCount(200);
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  describe("when the user has create queries permission", () => {
    beforeEach(() => {
      setTablePermissionsWithCreateQueries();
    });

    it("should not override column ids for a mbql model when it is saved with result_metadata (metabase#67680)", () => {
      updateModelSourceTableWithResultMetadata();
      verifyNormalUserCanAccessModel();
    });

    it("should not override column ids for a mbql model when it is saved without result_metadata (metabase#67680)", () => {
      updateModelSourceTableWithoutResultMetadata();
      verifyNormalUserCanAccessModel();
    });
  });

  describe("when the user does not have create queries permission", () => {
    beforeEach(() => {
      setTablePermissionsWithoutCreateQueries();
    });

    it("should not override column ids for a mbql model when it is saved with result_metadata (metabase#67680)", () => {
      updateModelSourceTableWithResultMetadata();
      verifyNormalUserCanAccessModel();
    });

    it("should not override column ids for a mbql model when it is saved without result_metadata (metabase#67680)", () => {
      updateModelSourceTableWithoutResultMetadata();
      verifyNormalUserCanAccessModel();
    });
  });
});
