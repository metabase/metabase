import { screen } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
} from "metabase-types/api/mocks";

import {
  TEST_NATIVE_CARD,
  TEST_NATIVE_CARD_DATASET,
  setup,
  triggerNativeQueryChange,
  waitForFaviconReady,
} from "./test-utils";

registerVisualizations();

let vizUpdateCount = 0;

jest.mock("metabase/visualizations/components/Visualization", () => {
  const { memo, createElement } = jest.requireActual("react");

  const MockVisualization = memo(function MockVisualization() {
    vizUpdateCount += 1;
    return createElement("div", { "data-testid": "mock-visualization" });
  });

  return { __esModule: true, default: MockVisualization };
});

// TEST_NATIVE_CARD_DATASET has row_count: 1 but empty `rows`. VisualizationResult
// treats empty rows as "no results" and renders ErrorMessage instead of Visualization.
const NATIVE_CARD_WITH_RESULTS = createMockDataset({
  ...TEST_NATIVE_CARD_DATASET,
  data: {
    rows: [[1]],
    cols: [createMockColumn({ name: "1", display_name: "1" })],
  },
});

describe("QueryBuilder > Visualization rerenders", () => {
  beforeEach(() => {
    vizUpdateCount = 0;
  });

  it("should not rerender Visualization when typing in the native editor", async () => {
    const { container } = await setup({
      card: createMockCard({
        ...TEST_NATIVE_CARD,
        display: "line",
      }),
      dataset: NATIVE_CARD_WITH_RESULTS,
    });

    await waitForFaviconReady(container);
    await screen.findByTestId("mock-visualization");

    // The first keystroke turns a saved question into an ad-hoc one (id/name
    // stripped), which is a real series change. Later keystrokes must not
    // rerender — that's the editor-typing hot path.
    await triggerNativeQueryChange();

    const countAfterFirstEdit = vizUpdateCount;
    expect(countAfterFirstEdit).toBeGreaterThan(0);

    await triggerNativeQueryChange();

    expect(vizUpdateCount).toBe(countAfterFirstEdit);
  });
});
