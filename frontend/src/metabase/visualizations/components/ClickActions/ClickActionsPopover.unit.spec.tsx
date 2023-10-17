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
  createOrdersDiscountDatasetColumn,
  createOrdersIdDatasetColumn,
  createOrdersProductIdDatasetColumn,
  createOrdersQuantityDatasetColumn,
  createOrdersTableDatasetColumns,
  createOrdersTotalDatasetColumn,
  createOrdersUserIdDatasetColumn,
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { ClickActionsPopover } from "metabase/visualizations/components/ClickActions/ClickActionsPopover";
import type { RegularClickAction } from "metabase/visualizations/types";
import { getMode } from "metabase/visualizations/click-actions/lib/modes";
import { checkNotNull } from "metabase/core/utils/types";
import type {
  DatasetQuery,
  Filter,
  Series,
  StructuredDatasetQuery,
} from "metabase-types/api";
import registerVisualizations from "metabase/visualizations/register";
import { POPOVER_TEST_ID } from "metabase/visualizations/click-actions/actions/ColumnFormattingAction/ColumnFormattingAction";
import { createMockSingleSeries } from "metabase-types/api/mocks";
import type { ClickObject } from "metabase-lib/queries/drills/types";
import { DEFAULT_QUERY, SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type Dimension from "metabase-lib/Dimension";

registerVisualizations();

const ORDERS_DATASET_QUERY = DEFAULT_QUERY as StructuredDatasetQuery;
const ORDERS_COLUMNS = createOrdersTableDatasetColumns();
const ORDERS_ROW_VALUES = {
  ID: "3",
  USER_ID: "1",
  PRODUCT_ID: "105",
  SUBTOTAL: 52.723521442619514,
  TAX: 2.9,
  TOTAL: 49.206842233769756,
  DISCOUNT: 6.416679208849759,
  CREATED_AT: "2025-12-06T22:22:48.544+02:00",
  QUANTITY: 2,
};

describe("ClickActionsPopover", function () {
  describe("apply click actions", () => {
    describe("ColumnFormattingAction", () => {
      it("should apply column formatting to default ORDERS question on header click", async () => {
        const { props } = await setup();

        const gearIconButton = getIcon("gear");
        expect(gearIconButton).toBeInTheDocument();

        userEvent.click(gearIconButton);

        expect(screen.getByTestId(POPOVER_TEST_ID)).toBeInTheDocument();

        userEvent.type(screen.getByLabelText("Column title"), " NEW NAME");
        userEvent.tab(); // blur field

        expect(props.onUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
        expect(props.onUpdateVisualizationSettings).toHaveBeenLastCalledWith({
          column_settings: {
            [`["ref",["field",${ORDERS.ID},null]]`]: {
              column_title: "ID NEW NAME",
            },
          },
        });
      });
    });

    describe("ColumnFilterDrill", () => {
      it("should apply ColumnFilterDrill to default ORDERS question on header click", async () => {
        const filterValue = 10;
        const { props } = await setup();

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
                filter: ["=", ["field", ORDERS.ID, null], filterValue],
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
        await setup();

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
                "order-by": [["asc", ["field", ORDERS.ID, null]]],
              },
            },
          }),
        });

        expect(queryIcon("arrow_up")).not.toBeInTheDocument();

        const sortDesc = getIcon("arrow_down");
        expect(sortDesc).toBeInTheDocument();
      });

      it("should apply SortDrill to default ORDERS question on ID column header click", async () => {
        const { props } = await setup();

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
          column: createOrdersTotalDatasetColumn(),
          columnName: createOrdersTotalDatasetColumn().name,
          expectedCard: {
            dataset_query: getSummarizedOverTimeResultDatasetQuery(
              ORDERS.TOTAL,
              "type/Float",
            ),
            display: "table",
          },
        },
        {
          column: createOrdersQuantityDatasetColumn(),
          columnName: createOrdersQuantityDatasetColumn().name,
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
          column: createOrdersUserIdDatasetColumn(),
          columnName: createOrdersUserIdDatasetColumn().name,
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
          column: createOrdersProductIdDatasetColumn(),
          columnName: createOrdersProductIdDatasetColumn().name,
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
          column: createOrdersTotalDatasetColumn(),
          columnName: createOrdersTotalDatasetColumn().name,
          cellValue: ORDERS_ROW_VALUES.TOTAL,
          drillTitle: ">",
          expectedCard: {
            dataset_query: getQuickFilterResultDatasetQuery({
              filteredColumnId: ORDERS.TOTAL,
              filterOperator: ">",
              cellValue: ORDERS_ROW_VALUES.TOTAL,
            }),
            display: "table",
          },
        },

        {
          column: createOrdersCreatedAtDatasetColumn(),
          columnName: createOrdersCreatedAtDatasetColumn().name,
          cellValue: ORDERS_ROW_VALUES.CREATED_AT,
          drillTitle: "Before",
          expectedCard: {
            dataset_query: getQuickFilterResultDatasetQuery({
              filteredColumnId: ORDERS.CREATED_AT,
              filterOperator: "<",
              cellValue: ORDERS_ROW_VALUES.CREATED_AT,
            }),
            display: "table",
          },
        },

        {
          column: createOrdersDiscountDatasetColumn(),
          columnName: createOrdersDiscountDatasetColumn().name,
          cellValue: null,
          drillTitle: "=",
          expectedCard: {
            dataset_query: getQuickFilterResultDatasetQuery({
              filteredColumnId: ORDERS.DISCOUNT,
              filterOperator: "is-null",
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
  });
});

async function setup({
  question = Question.create({
    metadata: SAMPLE_METADATA,
    dataset_query: ORDERS_DATASET_QUERY,
  }),
  clicked = {
    column: createOrdersIdDatasetColumn(),
    value: undefined,
  },
  settings = {},
  dimension: inputDimension,
}: Partial<{
  question: Question;
  clicked: ClickObject | undefined;
  settings: Record<string, any>;
  dimension?: Dimension;
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
    {
      ...clicked,
    },
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
          cols: [...ORDERS_COLUMNS],
          rows: [],
          requested_timezone: "UTC",
          results_timezone: "Asia/Nicosia",
          results_metadata: {
            columns: [...ORDERS_COLUMNS],
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
  cellValue,
}: {
  filteredColumnId: number;
  filterOperator: "=" | "!=" | ">" | "<" | "is-null" | "not-null";
  cellValue: string | number | null | undefined;
}): DatasetQuery {
  const filterClause = ["is-null", "not-null"].includes(filterOperator)
    ? ([filterOperator, ["field", filteredColumnId, null]] as Filter)
    : ([
        filterOperator,
        ["field", filteredColumnId, null],
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
