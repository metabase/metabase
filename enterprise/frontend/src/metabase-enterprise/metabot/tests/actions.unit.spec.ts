import {
  type AnyAction,
  combineReducers,
  configureStore,
} from "@reduxjs/toolkit";

import { DEFAULT_UI_CONTROLS } from "metabase/query_builder/defaults";
import { uiControls } from "metabase/query_builder/reducers";
import {
  aiStreamingQuery,
  findMatchingInflightAiStreamingRequests,
} from "metabase-enterprise/api/ai-streaming";
import { sendAgentRequest } from "metabase-enterprise/metabot/state/actions";
import { metabotReducer } from "metabase-enterprise/metabot/state/reducer";

jest.mock("metabase-enterprise/api/ai-streaming", () => ({
  aiStreamingQuery: jest.fn(),
  findMatchingInflightAiStreamingRequests: jest.fn(() => []),
}));

const mockedAiStreamingQuery = jest.mocked(aiStreamingQuery);

const qbReducer = (
  state = { uiControls: DEFAULT_UI_CONTROLS },
  action: AnyAction,
) => ({
  uiControls: uiControls(
    state.uiControls,
    action as Parameters<typeof uiControls>[1],
  ),
});

const createTestStore = () =>
  configureStore({
    reducer: {
      plugins: combineReducers({
        metabotPlugin: metabotReducer,
      }),
      qb: qbReducer,
    },
  });

describe("sendAgentRequest", () => {
  beforeEach(() => {
    mockedAiStreamingQuery.mockReset();
    jest.mocked(findMatchingInflightAiStreamingRequests).mockReturnValue([]);
  });

  it("opens the QB code editor when receiving a qb code edit", async () => {
    mockedAiStreamingQuery.mockImplementation(async (_request, callbacks) => {
      callbacks?.onDataPart?.({
        type: "code_edit",
        version: 1,
        value: {
          buffer_id: "qb",
          mode: "rewrite",
          value: "SELECT 1",
        },
      });

      return {
        aborted: false,
        toolCalls: [],
        data: [],
        text: null,
        parts: [],
        history: [],
      };
    });

    const store = createTestStore();
    const conversationId =
      store.getState().plugins.metabotPlugin.conversations.sql?.conversationId;

    expect(store.getState().qb.uiControls.isNativeEditorOpen).toBe(false);
    expect(conversationId).toBeDefined();

    await store.dispatch(
      sendAgentRequest({
        agentId: "sql",
        message: "Rewrite this query",
        conversation_id: conversationId as string,
        context: {
          user_is_viewing: [],
          current_time_with_timezone: "2026-03-04T00:00:00Z",
          capabilities: [],
        },
        history: [],
        state: {},
      }),
    );

    expect(store.getState().qb.uiControls.isNativeEditorOpen).toBe(true);
    expect(
      store.getState().plugins.metabotPlugin.reactions.suggestedCodeEdits.qb,
    ).toEqual(
      expect.objectContaining({
        buffer_id: "qb",
        mode: "rewrite",
        value: "SELECT 1",
        active: true,
      }),
    );
  });
});
