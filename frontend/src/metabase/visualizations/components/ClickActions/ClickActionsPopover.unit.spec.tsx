import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersCreatedAtField,
  createOrdersDiscountDatasetColumn,
  createOrdersDiscountField,
  createOrdersIdDatasetColumn,
  createOrdersProductIdDatasetColumn,
  createOrdersProductIdField,
  createOrdersQuantityDatasetColumn,
  createOrdersQuantityField,
  createOrdersSubtotalDatasetColumn,
  createOrdersSubtotalField,
  createOrdersTable,
  createOrdersTableDatasetColumns,
  createOrdersTableDatasetColumnsMap,
  createOrdersTaxDatasetColumn,
  createOrdersTaxField,
  createOrdersTotalDatasetColumn,
  createOrdersTotalField,
  createOrdersUserIdDatasetColumn,
  createOrdersUserIdField,
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { ClickActionsPopover } from "metabase/visualizations/components/ClickActions/ClickActionsPopover";
import type { RegularClickAction } from "metabase/visualizations/types";
import { getMode } from "metabase/visualizations/click-actions/lib/modes";
import { checkNotNull } from "metabase/lib/types";
import type {
  DatasetColumn,
  DatasetQuery,
  Filter,
  RowValue,
  Series,
  Card,
} from "metabase-types/api";
import registerVisualizations from "metabase/visualizations/register";
import { POPOVER_TEST_ID } from "metabase/visualizations/click-actions/actions/ColumnFormattingAction/ColumnFormattingAction";
import { createMockSingleSeries } from "metabase-types/api/mocks";
import { ZOOM_IN_ROW } from "metabase/query_builder/actions";
import { createMockMetadata } from "__support__/metadata";
import type { ClickObject } from "metabase-lib/queries/drills/types";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type Dimension from "metabase-lib/Dimension";
import {
  ORDERS_COLUMNS,
  ORDERS_COLUMNS_LIST,
  ORDERS_DATASET_QUERY,
  ORDERS_ROW_VALUES,
} from "metabase-lib/tests/drills-common";

registerVisualizations();

const ORDERS_METADATA_WITH_MULTIPLE_PK = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable({
          fields: [
            createOrdersUserIdField({
              semantic_type: "type/PK",
            }),
            createOrdersProductIdField({
              semantic_type: "type/PK",
            }),
            createOrdersSubtotalField(),
            createOrdersTaxField(),
            createOrdersTotalField(),
            createOrdersDiscountField(),
            createOrdersCreatedAtField(),
            createOrdersQuantityField(),
          ],
        }),
      ],
    }),
  ],
});
const ORDERS_QUESTION_WITH_MULTIPLE_PK = Question.create({
  metadata: ORDERS_METADATA_WITH_MULTIPLE_PK,
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  },
});
const ORDERS_COLUMNS_WITH_MULTIPLE_PK = {
  USER_ID: createOrdersUserIdDatasetColumn({
    semantic_type: "type/PK",
  }),
  PRODUCT_ID: createOrdersProductIdDatasetColumn({
    semantic_type: "type/PK",
  }),
  SUBTOTAL: createOrdersSubtotalDatasetColumn(),
  TAX: createOrdersTaxDatasetColumn(),
  TOTAL: createOrdersTotalDatasetColumn(),
  DISCOUNT: createOrdersDiscountDatasetColumn(),
  CREATED_AT: createOrdersCreatedAtDatasetColumn(),
  QUANTITY: createOrdersQuantityDatasetColumn(),
};
const ORDERS_ROW_VALUES_WITH_MULTIPLE_PK: Record<
  keyof typeof ORDERS_COLUMNS_WITH_MULTIPLE_PK,
  RowValue
> = {
  USER_ID: "1",
  PRODUCT_ID: "105",
  SUBTOTAL: 52.723521442619514,
  TAX: 2.9,
  TOTAL: 49.206842233769756,
  DISCOUNT: null,
  CREATED_AT: "2025-12-06T22:22:48.544+02:00",
  QUANTITY: 2,
};

describe("ClickActionsPopover", function () {
  describe("apply click actions", () => {
    describe("ColumnFormattingAction", () => {
      it("should apply column formatting to default ORDERS question on header click", async () => {
        const { props } = await setup({
          clicked: {
            column: ORDERS_COLUMNS.ID,
            value: undefined,
          },
        });

        const gearIconButton = getIcon("gear");
        expect(gearIconButton).toBeInTheDocument();

        userEvent.click(gearIconButton);

        expect(screen.getByTestId(POPOVER_TEST_ID)).toBeInTheDocument();

        userEvent.type(screen.getByLabelText("Column title"), " NEW NAME");
        userEvent.tab(); // blur field

        expect(props.onUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
        expect(props.onUpdateVisualizationSettings).toHaveBeenLastCalledWith({
          column_settings: {
            [`["ref",["field",${ORDERS.ID},{"base-type":"type/Integer"}]]`]: {
              column_title: "ID NEW NAME",
            },
          },
        });
      });
    });

    describe("ColumnFilterDrill", () => {
      it("should apply ColumnFilterDrill to default ORDERS question on header click", async () => {
        const filterValue = 10;
        const { props } = await setup({
          clicked: {
            column: ORDERS_COLUMNS.ID,
            value: undefined,
          },
        });

        const filterDrill = screen.getByText("Filter by this column");
        expect(filterDrill).toBeInTheDocument();

        userEvent.click(filterDrill);

        const filterField = screen.getByPlaceholderText("Enter an ID");
        expect(filterField).toBeInTheDocument();

        userEvent.type(filterField, filterValue.toString());
        userEvent.click(screen.getByText("Add filter"));

        expect(props.onChangeCardAndRun).toHaveBeenCalledTimes(1);
        expect(props.onChangeCardAndRun).toHaveBeenLastCalledWith({
          nextCard: expect.objectContaining({
            dataset_query: {
              database: SAMPLE_DB_ID,
              query: {
                filter: [
                  "=",
                  ["field", ORDERS.ID, { "base-type": "type/Integer" }],
                  filterValue,
                ],
                "source-table": ORDERS_ID,
              },
              type: "query",
            },
            display: "table",
          }),
        });
      });
    });

    describe("SortDrill", () => {
      it("should display proper sorting controls", async () => {
        await setup({
          clicked: {
            column: ORDERS_COLUMNS.ID,
            value: undefined,
          },
        });

        const sortDesc = getIcon("arrow_down");
        expect(sortDesc).toBeInTheDocument();

        userEvent.hover(sortDesc);
        expect(screen.getByText("Sort descending")).toBeInTheDocument();

        const sortAsc = getIcon("arrow_up");
        expect(sortAsc).toBeInTheDocument();

        userEvent.hover(sortAsc);
        expect(screen.getByText("Sort ascending")).toBeInTheDocument();
      });

      it("should display specific sorting control when only one sorting direction is available", async () => {
        await setup({
          question: Question.create({
            metadata: SAMPLE_METADATA,
            dataset_query: {
              ...ORDERS_DATASET_QUERY,
              query: {
                ...ORDERS_DATASET_QUERY.query,
                "order-by": [
                  [
                    "asc",
                    ["field", ORDERS.ID, { "base-type": "type/Integer" }],
                  ],
                ],
              },
            },
          }),
          clicked: {
            column: ORDERS_COLUMNS.ID,
            value: undefined,
          },
          rowValues: undefined,
        });

        expect(queryIcon("arrow_up")).not.toBeInTheDocument();

        const sortDesc = getIcon("arrow_down");
        expect(sortDesc).toBeInTheDocument();
      });

      it("should apply SortDrill to default ORDERS question on ID column header click", async () => {
        const { props } = await setup({
          clicked: {
            column: ORDERS_COLUMNS.ID,
            value: undefined,
          },
        });

        const sortDesc = getIcon("arrow_down");
        userEvent.click(sortDesc);

        expect(props.onChangeCardAndRun).toHaveBeenCalledTimes(1);
        expect(props.onChangeCardAndRun).toHaveBeenLastCalledWith({
          nextCard: expect.objectContaining({
            dataset_query: {
              ...ORDERS_DATASET_QUERY,
              query: {
                ...ORDERS_DATASET_QUERY.query,
                "order-by": [
                  [
                    "desc",
                    [
                      "field",
                      ORDERS.ID,
                      {
                        "base-type": "type/BigInteger",
                      },
                    ],
                  ],
                ],
              },
            },
            display: "table",
          }),
        });
      });
    });

    describe("SummarizeColumnByTimeDrill", () => {
      it.each([
        {
          column: ORDERS_COLUMNS.TOTAL,
          columnName: ORDERS_COLUMNS.TOTAL.name,
          expectedCard: {
            dataset_query: getSummarizedOverTimeResultDatasetQuery(
              ORDERS.TOTAL,
              "type/Float",
            ),
            display: "table",
          },
        },
        {
          column: ORDERS_COLUMNS.QUANTITY,
          columnName: ORDERS_COLUMNS.QUANTITY.name,
          expectedCard: {
            dataset_query: getSummarizedOverTimeResultDatasetQuery(
              ORDERS.QUANTITY,
              "type/Integer",
            ),
            display: "table",
          },
        },
      ])(
        "should apply drill to default ORDERS question on $columnName header click",
        async ({ column, expectedCard }) => {
          const { props } = await setup({
            clicked: {
              column,
              value: undefined,
            },
          });

          const drill = screen.getByText("Sum over time");
          expect(drill).toBeInTheDocument();

          userEvent.click(drill);

          expect(props.onChangeCardAndRun).toHaveBeenCalledTimes(1);
          expect(props.onChangeCardAndRun).toHaveBeenLastCalledWith({
            nextCard: expect.objectContaining(expectedCard),
          });
        },
      );
    });

    describe("FKFilterDrill", () => {
      it.each([
        {
          column: ORDERS_COLUMNS.USER_ID,
          columnName: ORDERS_COLUMNS.USER_ID.name,
          cellValue: "1",
          drillTitle: "View this User's Orders",
          expectedCard: {
            dataset_query: getFKFilteredResultDatasetQuery(
              ORDERS.USER_ID,
              "type/Integer",
              "1",
            ),
            display: "table",
          },
        },
        {
          column: ORDERS_COLUMNS.PRODUCT_ID,
          columnName: ORDERS_COLUMNS.PRODUCT_ID.name,
          cellValue: "111",
          drillTitle: "View this Product's Orders",
          expectedCard: {
            dataset_query: getFKFilteredResultDatasetQuery(
              ORDERS.PRODUCT_ID,
              "type/Integer",
              "111",
            ),
            display: "table",
          },
        },
      ])(
        "should apply drill on $columnName cell click",
        async ({ column, cellValue, drillTitle, expectedCard }) => {
          const { props } = await setup({
            clicked: {
              column,
              value: cellValue,
            },
          });

          const drill = screen.getByText(drillTitle);
          expect(drill).toBeInTheDocument();

          userEvent.click(drill);

          expect(props.onChangeCardAndRun).toHaveBeenCalledTimes(1);
          expect(props.onChangeCardAndRun).toHaveBeenLastCalledWith({
            nextCard: expect.objectContaining(expectedCard),
          });
        },
      );
    });

    describe("QuickFilterDrill", () => {
      it.each([
        {
          column: ORDERS_COLUMNS.TOTAL,
          columnName: ORDERS_COLUMNS.TOTAL.name,
          cellValue: ORDERS_ROW_VALUES.TOTAL,
          drillTitle: ">",
          expectedCard: {
            dataset_query: getQuickFilterResultDatasetQuery({
              filteredColumnId: ORDERS.TOTAL,
              filterOperator: ">",
              filterColumnType: "type/Float",
              cellValue: ORDERS_ROW_VALUES.TOTAL,
            }),
            display: "table",
          },
        },

        {
          column: ORDERS_COLUMNS.CREATED_AT,
          columnName: ORDERS_COLUMNS.CREATED_AT.name,
          cellValue: ORDERS_ROW_VALUES.CREATED_AT,
          drillTitle: "Before",
          expectedCard: {
            dataset_query: getQuickFilterResultDatasetQuery({
              filteredColumnId: ORDERS.CREATED_AT,
              filterOperator: "<",
              filterColumnType: "type/DateTime",
              cellValue: ORDERS_ROW_VALUES.CREATED_AT,
            }),
            display: "table",
          },
        },

        {
          column: ORDERS_COLUMNS.DISCOUNT,
          columnName: ORDERS_COLUMNS.DISCOUNT.name,
          cellValue: null,
          drillTitle: "=",
          expectedCard: {
            dataset_query: getQuickFilterResultDatasetQuery({
              filteredColumnId: ORDERS.DISCOUNT,
              filterOperator: "is-null",
              filterColumnType: "type/Float",
              cellValue: null,
            }),
            display: "table",
          },
        },
      ])(
        "should apply drill on $columnName cell click",
        async ({ column, cellValue, drillTitle, expectedCard }) => {
          const { props } = await setup({
            clicked: {
              column,
              value: cellValue,
            },
          });

          const drill = screen.getByText(drillTitle);
          expect(drill).toBeInTheDocument();

          userEvent.click(drill);

          expect(props.onChangeCardAndRun).toHaveBeenCalledTimes(1);
          expect(props.onChangeCardAndRun).toHaveBeenLastCalledWith(
            expect.objectContaining({
              nextCard: expect.objectContaining(expectedCard),
            }),
          );
        },
      );
    });

    describe("ObjectDetailsZoomDrill", () => {
      it.each([
        {
          column: ORDERS_COLUMNS.ID,
          columnName: ORDERS_COLUMNS.ID.name,
          cellValue: ORDERS_ROW_VALUES.ID,
          expectedAction: {
            type: ZOOM_IN_ROW,
            payload: { objectId: ORDERS_ROW_VALUES.ID },
          },
        },
        {
          column: ORDERS_COLUMNS.TOTAL,
          columnName: ORDERS_COLUMNS.TOTAL.name,
          cellValue: ORDERS_ROW_VALUES.TOTAL,
          expectedAction: {
            type: ZOOM_IN_ROW,
            payload: { objectId: ORDERS_ROW_VALUES.ID },
          },
        },
      ])(
        "should apply drill on $columnName cell click",
        async ({ column, cellValue, expectedAction }) => {
          const { props } = await setup({
            clicked: {
              column,
              value: cellValue,
              data: ORDERS_COLUMNS_LIST.map(column => ({
                col: ORDERS_COLUMNS[
                  column.name as keyof typeof ORDERS_ROW_VALUES
                  ],
                value:
                  ORDERS_ROW_VALUES[
                    column.name as keyof typeof ORDERS_ROW_VALUES
                    ],
              })),
            },
          });

          const drill = screen.getByText("View details");
          expect(drill).toBeInTheDocument();

          userEvent.click(drill);

          expect(props.dispatch).toHaveBeenCalledTimes(3);
          expect(props.dispatch).toHaveBeenCalledWith(expectedAction);
        },
      );
    });

    describe("ObjectDetailsFkDrill", () => {
      it.each([
        {
          column: ORDERS_COLUMNS.USER_ID,
          columnName: ORDERS_COLUMNS.USER_ID.name,
          cellValue: ORDERS_ROW_VALUES.USER_ID,
          expectedCard: {
            dataset_query: {
              database: SAMPLE_DB_ID,
              query: {
                filter: [
                  "=",
                  [
                    "field",
                    PEOPLE.ID,
                    {
                      "base-type": "type/BigInteger",
                    },
                  ],
                  ORDERS_ROW_VALUES.USER_ID,
                ],
                "source-table": PEOPLE_ID,
              },
              type: "query",
            },
            display: "table",
          },
        },
        {
          column: createOrdersProductIdDatasetColumn(),
          columnName: createOrdersProductIdDatasetColumn().name,
          cellValue: ORDERS_ROW_VALUES.PRODUCT_ID,
          expectedCard: {
            dataset_query: {
              database: SAMPLE_DB_ID,
              query: {
                filter: [
                  "=",
                  [
                    "field",
                    PRODUCTS.ID,
                    {
                      "base-type": "type/BigInteger",
                    },
                  ],
                  ORDERS_ROW_VALUES.PRODUCT_ID,
                ],
                "source-table": PRODUCTS_ID,
              },
              type: "query",
            },
            display: "table",
          },
        },
      ])(
        "should apply drill on $columnName cell click",
        async ({ column, cellValue, expectedCard }) => {
          const { props } = await setup({
            clicked: {
              column,
              value: cellValue,
            },
          });

          const drill = screen.getByText("View details");
          expect(drill).toBeInTheDocument();

          userEvent.click(drill);

          expect(props.onChangeCardAndRun).toHaveBeenCalledTimes(1);
          expect(props.onChangeCardAndRun).toHaveBeenLastCalledWith(
            expect.objectContaining({
              nextCard: expect.objectContaining(expectedCard),
            }),
          );
        },
      );
    });

    describe("ObjectDetailsPkDrill", () => {
      it.each<{
        columnName: keyof typeof ORDERS_COLUMNS_WITH_MULTIPLE_PK;
        expectedCard: Partial<Card>;
      }>([
        {
          columnName: "USER_ID",
          expectedCard: {
            dataset_query: {
              database: SAMPLE_DB_ID,
              query: {
                filter: [
                  "=",
                  [
                    "field",
                    ORDERS.USER_ID,
                    {
                      "base-type": "type/Integer",
                    },
                  ],
                  ORDERS_ROW_VALUES.USER_ID,
                ],
                "source-table": ORDERS_ID,
              },
              type: "query",
            },
            display: "table",
          },
        },
        {
          columnName: "PRODUCT_ID",
          expectedCard: {
            dataset_query: {
              database: SAMPLE_DB_ID,
              query: {
                filter: [
                  "=",
                  [
                    "field",
                    ORDERS.PRODUCT_ID,
                    {
                      "base-type": "type/Integer",
                    },
                  ],
                  ORDERS_ROW_VALUES.PRODUCT_ID,
                ],
                "source-table": ORDERS_ID,
              },
              type: "query",
            },
            display: "table",
          },
        },
        {
          columnName: "CREATED_AT",
          expectedCard: {
            dataset_query: {
              database: SAMPLE_DB_ID,
              query: {
                filter: [
                  "=",
                  [
                    "field",
                    ORDERS.USER_ID,
                    {
                      "base-type": "type/Integer",
                    },
                  ],
                  ORDERS_ROW_VALUES.USER_ID,
                ],
                "source-table": ORDERS_ID,
              },
              type: "query",
            },
            display: "table",
          },
        },
      ])(
        "should apply drill on $columnName cell click",
        async ({ columnName, expectedCard }) => {
          const { props } = await setup({
            question: ORDERS_QUESTION_WITH_MULTIPLE_PK,
            clicked: {
              column: ORDERS_COLUMNS_WITH_MULTIPLE_PK[columnName],
              value: ORDERS_ROW_VALUES_WITH_MULTIPLE_PK[columnName],
            },
          });

          const drill = screen.getByText("View details");
          expect(drill).toBeInTheDocument();

          userEvent.click(drill);

          expect(props.onChangeCardAndRun).toHaveBeenCalledTimes(1);
          expect(props.onChangeCardAndRun).toHaveBeenLastCalledWith(
            expect.objectContaining({
              nextCard: expect.objectContaining(expectedCard),
            }),
          );
        },
      );
    });
  });
});

async function setup({
  question = Question.create({
    metadata: SAMPLE_METADATA,
    dataset_query: ORDERS_DATASET_QUERY,
  }),
  clicked,
  settings = {},
  dimension: inputDimension,
  columns = ORDERS_COLUMNS_LIST,
  rowValues = ORDERS_ROW_VALUES,
}: Partial<{
  question: Question;
  clicked: ClickObject;
  settings: Record<string, any>;
  dimension?: Dimension;
  columns?: DatasetColumn[];
  rowValues?: Record<string, RowValue>;
}> = {}) {
  const mode = checkNotNull(getMode(question));

  const dimension =
    inputDimension ||
    (question?.query() as StructuredQuery).dimensionForColumn(
      checkNotNull(clicked?.column),
    );

  clicked = {
    ...clicked,
    dimension: dimension || undefined,
  };

  const clickActions = mode.actionsForClick(
    clicked,
    settings,
  ) as RegularClickAction[];

  const dispatch = jest.fn();
  const onChangeCardAndRun = jest.fn();
  const onClose = jest.fn();
  const onUpdateVisualizationSettings = jest.fn();

  // used only in FormatDrill. To be refactored. I think we should pass this widget from the outside, ready to be rendered
  const series: Series = [
    createMockSingleSeries(
      {
        dataset_query: question.datasetQuery(),
      },
      {
        data: {
          cols: [...columns],
          rows: [],
          requested_timezone: "UTC",
          results_timezone: "Asia/Nicosia",
          results_metadata: {
            columns: [...columns],
          },
        },
      },
    ),
  ];

  const view = renderWithProviders(
    <ClickActionsPopover
      clickActions={clickActions}
      clicked={clicked}
      series={series}
      dispatch={dispatch}
      onChangeCardAndRun={onChangeCardAndRun}
      onUpdateVisualizationSettings={onUpdateVisualizationSettings}
      onClose={onClose}
    />,
  );

  dispatch.mockImplementation(fn => {
    if (typeof fn === "function") {
      return fn(dispatch, view.store.getState);
    }
  });

  const updatedClicked = {
    ...clicked,
    element: view.baseElement,
  };

  view.rerender(
    <ClickActionsPopover
      clickActions={clickActions}
      clicked={updatedClicked}
      series={series as unknown as Series}
      dispatch={dispatch}
      onChangeCardAndRun={onChangeCardAndRun}
      onUpdateVisualizationSettings={onUpdateVisualizationSettings}
      onClose={onClose}
    />,
  );

  await waitFor(async () => {
    expect(
      (await screen.findAllByTestId("drill-through-section")).length,
    ).toBeGreaterThan(0);
  });

  return {
    props: {
      clickActions,
      clicked: updatedClicked,
      series,
      dispatch,
      onChangeCardAndRun,
      onUpdateVisualizationSettings,
      onClose,
    },
    view,
  };
}

function getSummarizedOverTimeResultDatasetQuery(
  aggregatedColumnId: number,
  aggregatedColumnType: string,
): DatasetQuery {
  return {
    database: SAMPLE_DB_ID,
    query: {
      aggregation: [
        [
          "sum",
          [
            "field",
            aggregatedColumnId,
            {
              "base-type": aggregatedColumnType,
            },
          ],
        ],
      ],
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
      "source-table": ORDERS_ID,
    },
    type: "query",
  };
}

function getFKFilteredResultDatasetQuery(
  filteredColumnId: number,
  filteredColumnType: string,
  cellValue: string,
): DatasetQuery {
  return {
    database: SAMPLE_DB_ID,
    query: {
      filter: [
        "=",
        [
          "field",
          filteredColumnId,
          {
            "base-type": filteredColumnType,
          },
        ],
        cellValue,
      ],
      "source-table": ORDERS_ID,
    },
    type: "query",
  };
}

function getQuickFilterResultDatasetQuery({
  filteredColumnId,
  filterOperator,
  filterColumnType,
  cellValue,
}: {
  filteredColumnId: number;
  filterOperator: "=" | "!=" | ">" | "<" | "is-null" | "not-null";
  filterColumnType: string;
  cellValue: RowValue;
}): DatasetQuery {
  const filterClause = ["is-null", "not-null"].includes(filterOperator)
    ? ([
        filterOperator,
        ["field", filteredColumnId, { "base-type": filterColumnType }],
      ] as Filter)
    : ([
        filterOperator,
        ["field", filteredColumnId, { "base-type": filterColumnType }],
        cellValue,
      ] as Filter);

  return {
    database: SAMPLE_DB_ID,
    query: {
      filter: filterClause,
      "source-table": ORDERS_ID,
    },
    type: "query",
  };
}
