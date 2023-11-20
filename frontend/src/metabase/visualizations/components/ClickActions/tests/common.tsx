import { waitFor } from "@testing-library/react";
import type { DatasetColumn, RowValue, Series } from "metabase-types/api";
import { checkNotNull } from "metabase/lib/types";
import { getMode } from "metabase/visualizations/click-actions/lib/modes";
import type { RegularClickAction } from "metabase/visualizations/types";
import {
  createMockCard,
  createMockSingleSeries,
} from "metabase-types/api/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { ClickActionsPopover } from "metabase/visualizations/components/ClickActions/ClickActionsPopover";
import { createMockQueryBuilderState } from "metabase-types/store/mocks";
import Question from "metabase-lib/Question";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import {
  ORDERS_COLUMNS_LIST,
  ORDERS_DATASET_QUERY,
  ORDERS_ROW_VALUES,
} from "metabase-lib/tests/drills-common";
import type { ClickObject } from "metabase-lib/queries/drills/types";
import type Dimension from "metabase-lib/Dimension";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

export async function setup({
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
    {
      storeInitialState: {
        qb: createMockQueryBuilderState({
          card: createMockCard({
            dataset_query: question?.datasetQuery(),
          }),
        }),
      },
    },
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
