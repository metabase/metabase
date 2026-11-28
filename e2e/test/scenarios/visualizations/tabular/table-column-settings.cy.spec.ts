import _ from "underscore";

const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { Card } from "metabase-types/api";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const tableQuestion: StructuredQuestionDetails = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
  },
};

const tableQuestionWithJoinAndFields: StructuredQuestionDetails = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    joins: [
      {
        "source-table": PRODUCTS_ID,
        fields: [["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }]],
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, { "join-alias": "Products" }],
        ],
        alias: "Products",
      },
    ],
  },
};

const nativeQuestion: NativeQuestionDetails = {
  display: "table",
  native: {
    query: "SELECT * FROM ORDERS",
  },
};

const nestedQuestion = (card: Card): StructuredQuestionDetails => ({
  display: "table",
  query: {
    "source-table": `card__${card.id}`,
  },
});

type ColumnDetails = {
  /** The label in the column picker */
  column: string;
  /** The name in the table and in the column list */
  columnName: string;
  /** The column picker group */
  table: string;
  /** Another column that stays enabled */
  sanityCheck?: string;
  needsScroll?: boolean;
  scrollTimes?: number;
};

describe("scenarios > visualizations > table column settings", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  const _hideColumn = ({
    column,
    columnName,
    table,
    sanityCheck,
    needsScroll = true,
    scrollTimes = 1,
  }: ColumnDetails) => {
    const scroll = () => {
      if (needsScroll) {
        _.times(scrollTimes, () => {
          scrollVisualization();
          cy.wait(200);
        });
      }
    };

    cy.log("hide the column");
    scroll();
    visualization().findByText(columnName).should("exist");
    visibleColumns().within(() => hideColumn(columnName));
    assertColumnHidden(getColumn(columnName));
    if (sanityCheck) {
      assertColumnEnabled(getColumn(sanityCheck));
    }
    scroll();
    visualization().findByText(columnName).should("not.exist");

    cy.findByRole("button", { name: /Add or remove columns/ }).click();
    cy.findByTestId(`${table}-table-columns`)
      .findByLabelText(column)
      .should("be.checked");
    cy.findByRole("button", { name: /Done picking columns/ }).click();
  };

  const _showColumn = ({
    columnName,
    sanityCheck,
    needsScroll = true,
    scrollTimes = 1,
  }: ColumnDetails) => {
    visibleColumns().within(() => showColumn(columnName));
    assertColumnEnabled(getColumn(columnName));
    if (sanityCheck) {
      assertColumnEnabled(getColumn(sanityCheck));
    }
    if (needsScroll) {
      _.times(scrollTimes, () => {
        scrollVisualization();
        cy.wait(200);
      });
    }
    visualization().findByText(columnName).should("exist");
  };

  const _removeColumn = ({
    column,
    columnName,
    table,
    sanityCheck,
    needsScroll = true,
    scrollTimes = 1,
  }: ColumnDetails) => {
    cy.log("remove the column");
    cy.findByRole("button", { name: /Add or remove columns/ }).click();
    cy.findByTestId(`${table}-table-columns`)
      .findByLabelText(column)
      .should("be.checked")
      .click();
    cy.wait("@dataset");
    cy.findByText("Doing science...").should("not.exist");
    if (needsScroll) {
      _.times(scrollTimes, () => {
        scrollVisualization();
        cy.wait(200);
      });
    }
    visualization().findByText(columnName).should("not.exist");
    cy.findByRole("button", { name: /Done picking columns/ }).click();
    getColumn(columnName).should("not.exist");
    if (sanityCheck) {
      assertColumnEnabled(getColumn(sanityCheck));
    }
  };

  const _addColumn = ({
    column,
    columnName,
    table,
    sanityCheck,
    needsScroll = true,
    scrollTimes = 1,
  }: ColumnDetails) => {
    cy.log("add the column");
    cy.findByRole("button", { name: /Add or remove columns/ }).click();
    cy.findByTestId(`${table}-table-columns`)
      .findByLabelText(column)
      .should("not.be.checked")
      .click();
    cy.wait("@dataset");
    cy.findByText("Doing science...").should("not.exist");
    if (needsScroll) {
      _.times(scrollTimes, () => {
        scrollVisualization();
        cy.wait(200);
      });
    }
    visualization().findByText(columnName).should("exist");
    cy.findByRole("button", { name: /Done picking columns/ }).click();
    assertColumnEnabled(getColumn(columnName));
    if (sanityCheck) {
      assertColumnEnabled(getColumn(sanityCheck));
    }
  };

  describe("tables", () => {
    it("should be able to show and hide table fields with a join with fields", () => {
      H.createQuestion(tableQuestionWithJoinAndFields, {
        visitQuestion: true,
      });
      openSettings();

      const firstColumn = {
        column: "Category",
        columnName: "Products → Category",
        table: "products",
      };

      const secondColumn = {
        column: "Ean",
        columnName: "Products → Ean",
        table: "products",
      };

      _hideColumn(firstColumn);
      _removeColumn(firstColumn);

      _addColumn(secondColumn);
    });

    it("should allow enabling text wrapping", () => {
      H.openReviewsTable();
      H.openColumnOptions("Body");

      H.assertRowHeight(0, 36);

      H.popover().within(() => {
        cy.icon("gear").click();
        cy.findByText("Wrap text").click();
      });

      H.assertRowHeight(0, 53);

      H.popover().within(() => {
        cy.findByText("Wrap text").click();
      });

      H.assertRowHeight(0, 36);
    });
  });

  describe("nested structured questions", () => {
    it("should be able to show a column from a nested query when it was hidden in the notebook editor", () => {
      H.createQuestion(tableQuestion).then(({ body: card }) => {
        H.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });

      H.openNotebook();
      cy.findByTestId("fields-picker").click();
      H.popover().findByText("Tax").click();
      H.visualize();

      openSettings();

      const taxColumn = {
        column: "Tax",
        columnName: "Tax",
        table: "test question",
      };

      _addColumn(taxColumn);
    });
  });

  describe("nested native questions", () => {
    it("should be able to show and hide fields from a nested native query", () => {
      H.createNativeQuestion(nativeQuestion).then(({ body: card }) => {
        H.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      const taxColumn = {
        column: "TAX",
        columnName: "TAX",
        table: "test question",
      };

      _hideColumn(taxColumn);
      _showColumn(taxColumn);
      _removeColumn(taxColumn);
      _addColumn(taxColumn);
    });

    const oldSourceQuestionDetails: NativeQuestionDetails = {
      native: {
        query: "SELECT 1 AS C1, 2 AS C2, 3 AS C3",
      },
    };

    const newSourceQuestionDetails: NativeQuestionDetails = {
      native: {
        query: "SELECT 1 AS C1, 3 AS C3",
      },
    };

    const getNestedQuestionDetails = (
      sourceQuestionId: Card["id"],
    ): StructuredQuestionDetails => ({
      query: {
        "source-table": `card__${sourceQuestionId}`,
      },
      display: "table",
      visualization_settings: {
        "table.columns": [
          { name: "C3", enabled: true },
          { name: "C1", enabled: true },
          { name: "C2", enabled: true },
        ],
      },
    });

    it("should not reset the column order after one of the columns is removed from data source (metabase#7884)", () => {
      H.createNativeQuestion(oldSourceQuestionDetails).then(
        ({ body: sourceQuestion }) =>
          H.createQuestion(getNestedQuestionDetails(sourceQuestion.id)).then(
            ({ body: nestedQuestion }) => {
              cy.request("PUT", `/api/card/${sourceQuestion.id}`, {
                ...sourceQuestion,
                dataset_query: {
                  type: "native",
                  database: SAMPLE_DB_ID,
                  native: newSourceQuestionDetails.native,
                },
              });
              H.visitQuestion(nestedQuestion.id);
            },
          ),
      );

      cy.log("verify column order in the table");
      cy.findAllByTestId("header-cell").eq(0).should("contain.text", "C3");
      cy.findAllByTestId("header-cell").eq(1).should("contain.text", "C1");

      cy.log("verify column order in viz settings");
      H.openVizSettingsSidebar();
      H.getDraggableElements().eq(0).should("contain.text", "C3");
      H.getDraggableElements().eq(1).should("contain.text", "C1");
    });
  });

  describe("column pinning", () => {
    describe("column resizing with pinning limits", () => {
      it("should unpin/re-pin the last pinned column when resizing exceeds/fits 90% of container width", () => {
        H.createQuestion(
          {
            query: { "source-table": ORDERS_ID },
            visualization_settings: {
              "table.freeze_columns": true,
              "table.freeze_columns_count": 4,
            },
          },
          { visitQuestion: true },
        );

        cy.findByTestId("header-pinned-quadrant")
          .findAllByTestId("header-cell")
          .should("have.length", 4);

        cy.findByTestId("table-scroll-container")
          .invoke("width")
          .then((containerWidth = 0) => {
            const moveX = containerWidth * 0.7;
            H.resizeTableColumn("ID", moveX);

            cy.findByTestId("header-pinned-quadrant")
              .findAllByTestId("header-cell")
              .should("have.length", 2);

            H.resizeTableColumn("ID", -moveX);

            cy.findByTestId("header-pinned-quadrant")
              .findAllByTestId("header-cell")
              .should("have.length", 4);

            // allow resizing columns in the pinned section without affecting pinning when within limits
            H.resizeTableColumn("ID", 30);
            cy.findByTestId("header-pinned-quadrant")
              .findAllByTestId("header-cell")
              .should("have.length", 4);
          });
      });
    });
  });

  it("should respect date_style column setting for week temporal unit", () => {
    const questionWithWeekBreakout: StructuredQuestionDetails = {
      display: "table",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        limit: 5,
      },
    };

    H.createQuestion(questionWithWeekBreakout, { visitQuestion: true });

    // Open visualization settings
    H.openVizSettingsSidebar();

    // Click on the "Created At: Week" column to open its settings
    H.leftSidebar().findByTestId("Created At: Week-settings-button").click();

    // Change date style to M/D/YYYY
    H.popover().findByText("Date style").click();
    H.popover()
      .findByText(/^1\/31\/2018/)
      .click();

    // Verify the formatting changed to numeric style
    H.tableInteractiveBody().within(() => {
      cy.findAllByTestId("cell-data")
        .first()
        .invoke("text")
        .should("match", /\d+\/\d+\/\d{4} – \d+\/\d+\/\d{4}/); // Format like "1/1/2025 - 1/7/2025"
    });

    // Change date style to YYYY/M/D
    H.popover().findByText("Date style").click();
    H.popover()
      .findByText(/^2018\/1\/31/)
      .click();

    // Verify the formatting changed to day-first numeric style
    H.tableInteractiveBody().within(() => {
      cy.findAllByTestId("cell-data")
        .first()
        .invoke("text")
        .should("match", /\d{4}\/\d+\/\d+ – \d{4}\/\d+\/\d+/); // Format like "2025/1/1 - 2025/1/7"
    });

    H.popover().findByText("YYYY.M.D").click();
    // Verify separator formatting changed
    H.tableInteractiveBody().within(() => {
      cy.findAllByTestId("cell-data")
        .first()
        .invoke("text")
        .should("match", /\d{4}\.\d+\.\d+ – \d{4}\.\d+\.\d+/); // Format like "2025.1.1 - 2025.1.7"
    });
  });
});

const showColumn = (column: string) => {
  cy.findByTestId(`${column}-show-button`).click();
};

const hideColumn = (column: string) => {
  cy.findByTestId(`${column}-hide-button`).click();
};

const openSettings = () => {
  H.openVizSettingsSidebar();
};

const visualization = () => {
  return H.tableInteractive();
};

const scrollVisualization = (position: Cypress.PositionType = "right") => {
  H.tableInteractiveScrollContainer().scrollTo(position, {
    force: true,
  });
};

const visibleColumns = () => {
  return cy.findByTestId("visible-columns");
};

const getColumn = (columnName: string) => {
  return visibleColumns().contains("[role=listitem]", columnName);
};

const assertColumnEnabled = (
  column: Cypress.Chainable<JQuery<HTMLElement>>,
) => {
  column.should("have.attr", "data-enabled", "true");
};

const assertColumnHidden = (column: Cypress.Chainable<JQuery<HTMLElement>>) => {
  column.should("have.attr", "data-enabled", "false");
};
