import type { ComponentProps } from "react";

import { act, screen, waitFor } from "__support__/ui";
import { setTempSetting } from "metabase/redux/app";
import { getSettings, settingsApi } from "metabase/settings";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
} from "metabase-types/api/mocks";

import type { View } from "../components/view/View";

import {
  TEST_NATIVE_CARD,
  TEST_NATIVE_CARD_DATASET,
  setup,
  triggerNativeQueryChange,
  waitForFaviconReady,
} from "./test-utils";

registerVisualizations();

let vizUpdateCount = 0;
let viewUpdateCount = 0;
let lastViewProps: ComponentProps<typeof View> | undefined;

jest.mock("../components/view/View", () => {
  const actual = jest.requireActual("../components/view/View");
  const { createElement } = jest.requireActual("react");
  return {
    ...actual,
    View: (props: ComponentProps<typeof View>) => {
      viewUpdateCount += 1;
      lastViewProps = props;
      return createElement(actual.View, props);
    },
  };
});

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
    viewUpdateCount = 0;
    lastViewProps = undefined;
  });

  it("does not rerender the query view for unrelated store updates", async () => {
    const { container, store } = await setup({ card: TEST_NATIVE_CARD });
    await waitForFaviconReady(container);

    // Drain initial RTK Query notifications and React work before measuring.
    act(() => {
      store.dispatch(
        setTempSetting({
          key: "last-opened-onboarding-checklist-item",
          value: "database",
        }),
      );
    });

    const countBeforeUpdate = viewUpdateCount;
    const stateBeforeUpdate = store.getState();
    // A normal Redux action notifies subscribers synchronously. Do not yield to
    // unrelated API responses or scheduled favicon/resize work while measuring.
    act(() => {
      store.dispatch(
        setTempSetting({
          key: "last-opened-onboarding-checklist-item",
          value: "invite",
        }),
      );
    });

    expect(store.getState()).not.toBe(stateBeforeUpdate);
    expect(
      store.getState().app.tempStorage["last-opened-onboarding-checklist-item"],
    ).toBe("invite");
    expect(viewUpdateCount).toBe(countBeforeUpdate);
  });

  it("propagates updated settings to the query view's question metadata", async () => {
    const { container, store } = await setup({ card: TEST_NATIVE_CARD });
    await waitForFaviconReady(container);

    const stateBeforeUpdate = store.getState();
    const questionBeforeUpdate = lastViewProps?.question;
    await act(async () => {
      await store.dispatch(
        settingsApi.util.upsertQueryData("getSessionProperties", undefined, {
          ...getSettings(store.getState()),
          "site-name": "Renamed site",
        }),
      );
    });

    expect(store.getState()).not.toBe(stateBeforeUpdate);
    expect(getSettings(store.getState())["site-name"]).toBe("Renamed site");
    // Settings are a Metadata input, not an unrelated state slice. Await the
    // View receiving them, rather than observing RTK Query before its batched
    // subscriber notification has run.
    await waitFor(() => {
      expect(lastViewProps?.question.metadata().setting("site-name")).toBe(
        "Renamed site",
      );
    });
    expect(lastViewProps?.question).not.toBe(questionBeforeUpdate);
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
