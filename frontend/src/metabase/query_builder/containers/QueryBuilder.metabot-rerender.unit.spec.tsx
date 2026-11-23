import type * as React from "react";
import _ from "underscore";

import { act, waitFor } from "__support__/ui";
import {
  addAgentTextDelta,
  getMessages,
  getMetabotConversationId,
} from "metabase/metabot/state";
import { startRequestlessAgentTurn } from "metabase/metabot/tests/utils";
import { registerVisualizations } from "metabase/visualizations/register";

import { TEST_CARD, setup, waitForFaviconReady } from "./test-utils";

registerVisualizations();

let mockViewCallCount = 0;

// A plain function, not `memo`, so the count shows every `QueryBuilder` render,
// also one with equal props.
jest.mock("metabase/query_builder/components/view/View", () => {
  const { createElement } = jest.requireActual<typeof React>("react");

  const MockView = () => {
    mockViewCallCount += 1;
    return createElement("div", { "data-testid": "mock-view" });
  };

  return { __esModule: true, View: MockView };
});

const STREAM_UPDATE_COUNT = 5;

describe("QueryBuilder > Metabot stream rerenders", () => {
  beforeEach(() => {
    mockViewCallCount = 0;
  });

  it("does not render the question view again on a Metabot stream update", async () => {
    const { container, store } = await setup({ card: TEST_CARD });

    await waitForFaviconReady(container);
    await waitFor(() =>
      expect(store.getState().qb.uiControls.isRunning).toBe(false),
    );

    const conversationId = getMetabotConversationId(
      store.getState(),
      "omnibot",
    );
    // A stream appends text to an open agent message, as a real request does.
    act(() => {
      startRequestlessAgentTurn(store, conversationId);
    });
    const baseline = mockViewCallCount;
    // The mock must apply, or the count stays 0 with or without the fix.
    expect(baseline).toBeGreaterThan(0);

    // One sync `act` per update, so React cannot batch them into one render.
    _.times(STREAM_UPDATE_COUNT, () =>
      act(() => {
        store.dispatch(addAgentTextDelta({ conversationId, text: "word " }));
      }),
    );

    // The updates must reach the store, or nothing can render again.
    expect(
      getMessages(store.getState(), conversationId).at(-1)?.parts,
    ).toContainEqual(
      expect.objectContaining({
        type: "text",
        message: "word ".repeat(STREAM_UPDATE_COUNT),
      }),
    );
    expect(mockViewCallCount - baseline).toBe(0);
  });
});
