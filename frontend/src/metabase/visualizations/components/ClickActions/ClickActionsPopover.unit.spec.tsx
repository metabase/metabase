import userEvent from "@testing-library/user-event";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersDiscountDatasetColumn,
  createOrdersIdDatasetColumn,
  createOrdersProductIdDatasetColumn,
  createOrdersQuantityDatasetColumn,
  createOrdersSubtotalDatasetColumn,
  createOrdersTaxDatasetColumn,
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
import type { Series } from "metabase-types/api";
import { POPOVER_TEST_ID } from "metabase/visualizations/click-actions/actions/ColumnFormattingAction/ColumnFormattingAction";
import type { ClickObject } from "metabase-lib/queries/drills/types";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

const ORDERS_COLUMNS = [
  createOrdersIdDatasetColumn(),
  createOrdersUserIdDatasetColumn(),
  createOrdersProductIdDatasetColumn(),
  createOrdersSubtotalDatasetColumn(),
  createOrdersTaxDatasetColumn(),
  createOrdersTotalDatasetColumn(),
  createOrdersDiscountDatasetColumn(),
  createOrdersCreatedAtDatasetColumn(),
  createOrdersQuantityDatasetColumn(),
];

describe("ClickActionsPopover", function () {
  describe("apply click actions", () => {
    describe("ColumnFormattingAction", () => {
      it("should apply column formatting to default question", async () => {
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
  });

  describe("apply drills", () => {
    describe("ColumnFilterDrill", () => {
      it("should apply ColumnFilterDrill to default question", async () => {
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
          nextCard: {
            collection_id: undefined,
            dataset: undefined,
            dataset_query: {
              database: SAMPLE_DB_ID,
              query: {
                filter: ["=", ["field", ORDERS.ID, null], filterValue],
                "source-table": ORDERS_ID,
              },
              type: "query",
            },
            display: "table",
            name: undefined,
            visualization_settings: {},
          },
        });
      });
    });

    describe("SortDrill", () => {
      it("should apply SortDrill to default question", async () => {
        const { props } = await setup();

        const sortDesc = getIcon("arrow_down");
        expect(sortDesc).toBeInTheDocument();

        userEvent.click(sortDesc);

        expect(props.onChangeCardAndRun).toHaveBeenCalledTimes(1);
        expect(props.onChangeCardAndRun).toHaveBeenLastCalledWith({
          nextCard: {
            collection_id: undefined,
            dataset: undefined,
            dataset_query: {
              database: SAMPLE_DB_ID,
              query: {
                "order-by": [["desc", ["field", ORDERS.ID, null]]],
                "source-table": ORDERS_ID,
              },
              type: "query",
            },
            display: "table",
            name: undefined,
            visualization_settings: {},
          },
        });
      });
    });
  });
});

async function setup({
  question = Question.create({
    databaseId: SAMPLE_DB_ID,
    tableId: ORDERS_ID,
    metadata: SAMPLE_METADATA,
  }),
  clicked = {
    column: createOrdersIdDatasetColumn(),
    value: undefined,
  },
  settings = {},
}: Partial<{
  question: Question;
  clicked: ClickObject | undefined;
  settings: Record<string, any>;
}> = {}) {
  const mode = checkNotNull(getMode(question));

  const dimension = (question?.query() as StructuredQuery).dimensionForColumn(
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

  // used only in FormatDrill. To be refactored. I think we should pass this widget from the outside, ready to be rendered
  const series = [
    {
      card: {
        dataset_query: question.datasetQuery(),
        display: "table",
        result_metadata: undefined,
        visualization_settings: {},
      },
      data: {
        cols: [...ORDERS_COLUMNS],
        insights: null,
        rows: [],
        requested_timezone: "UTC",
        results_timezone: "Asia/Nicosia",
        results_metadata: {
          columns: [...ORDERS_COLUMNS],
        },
      },
    },
  ];
  const onUpdateVisualizationSettings = jest.fn();

  const view = renderWithProviders(
    <ClickActionsPopover
      clickActions={clickActions}
      clicked={clicked}
      series={series as unknown as Series}
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

  expect(
    (await screen.findAllByTestId("drill-through-section")).length,
  ).toBeGreaterThan(0);

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
