import userEvent from "@testing-library/user-event";
import { getIcon, render, screen } from "__support__/ui";
import {
  createOrdersIdDatasetColumn,
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { ClickActionsPopover } from "metabase/visualizations/components/ClickActions/ClickActionsPopover";
import type { RegularClickAction } from "metabase/visualizations/types";
import { getMode } from "metabase/visualizations/click-actions/lib/modes";
import { checkNotNull } from "metabase/core/utils/types";
import type { Series } from "metabase-types/api";
import type { ClickObject } from "metabase-lib/queries/drills/types";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/Question";

describe("ClickActionsPopover", function () {
  describe("apply drill", () => {
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

  const clickActions = mode.actionsForClick(
    clicked,
    settings,
  ) as RegularClickAction[];

  const dispatch = jest.fn();
  const onChangeCardAndRun = jest.fn();
  const onClose = jest.fn();

  // used only in FormatDrill. To be refactored. I think we should pass this widget from the outside, ready to be rendered
  const series = [] as Series;
  const onUpdateVisualizationSettings = jest.fn();

  const view = render(
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
      series={series}
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
