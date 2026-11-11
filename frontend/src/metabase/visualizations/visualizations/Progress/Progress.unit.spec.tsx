import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { ClickObject } from "metabase/visualizations/types";
import { createMockVisualizationProps } from "metabase/visualizations/types/mocks";
import type { ClickBehavior } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { Progress } from "./Progress";

const CLICK_BEHAVIOR: ClickBehavior = {
  type: "link",
  linkType: "question",
  targetId: 10,
  parameterMapping: {},
};
const PROGRESS_CARD = createMockCard({ display: "progress" });

function setup() {
  const onVisualizationClick = jest.fn<void, [ClickObject | null]>();
  const series = createMockSingleSeries(PROGRESS_CARD, {
    data: createMockDatasetData({
      cols: [
        createMockColumn({
          name: "count",
          base_type: "type/Integer",
          effective_type: "type/Integer",
        }),
      ],
      rows: [[1112]],
    }),
  });

  renderWithProviders(
    <Progress
      {...createMockVisualizationProps({
        series: [series],
        rawSeries: [series],
        settings: {
          "progress.value": "count",
          "progress.goal": 2000,
          "progress.color": "#84BB4C",
          column: () => ({}),
          click_behavior: CLICK_BEHAVIOR,
        },
        visualizationIsClickable: () => true,
        onVisualizationClick,
      })}
    />,
  );

  return { onVisualizationClick };
}

describe("Progress", () => {
  it("passes its click behavior settings on click, so a dashboard card can follow it (metabase#23137)", async () => {
    const { onVisualizationClick } = setup();

    await userEvent.click(screen.getByTestId("progress-bar"));

    expect(onVisualizationClick).toHaveBeenCalledTimes(1);
    const [clicked] = onVisualizationClick.mock.calls[0];
    expect(clicked?.settings?.click_behavior).toEqual(CLICK_BEHAVIOR);
  });
});
