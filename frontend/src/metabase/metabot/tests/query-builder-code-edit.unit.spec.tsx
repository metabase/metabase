import type { AnyAction, ThunkDispatch } from "@reduxjs/toolkit";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  aiStreamingQuery,
  findMatchingInflightAiStreamingRequests,
} from "metabase/api/ai-streaming";
import { useInlineSQLPrompt } from "metabase/metabot/components/MetabotInlineSQLPrompt";
import { getMetadata } from "metabase/selectors/metadata";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockUser,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { MetabotProvider } from "../context";
import { sendAgentRequest } from "../state/actions";
import { getMetabotInitialState } from "../state/reducer-utils";

jest.mock("metabase/api/ai-streaming", () => ({
  aiStreamingQuery: jest.fn(),
  findMatchingInflightAiStreamingRequests: jest.fn(() => []),
}));

const mockedAiStreamingQuery = jest.mocked(aiStreamingQuery);

const TEST_DB = createSampleDatabase();
const INITIAL_SQL = "SELECT 1";
const SUGGESTED_SQL = "SELECT * FROM ORDERS";

const TEST_NATIVE_CARD = createMockCard({
  id: 101,
  dataset_query: createMockNativeDatasetQuery({
    database: TEST_DB.id,
    native: {
      query: INITIAL_SQL,
    },
  }),
});

const QuerySuggestionProbe = ({ question }: { question: Question }) => {
  const inlinePrompt = useInlineSQLPrompt(question, "qb");
  const proposedSql = inlinePrompt.proposedQuestion
    ? Lib.rawNativeQuery(inlinePrompt.proposedQuestion.query())
    : "";

  return <div data-testid="qb-proposed-sql">{proposedSql}</div>;
};

describe("query builder code edits from omnibot", () => {
  beforeEach(() => {
    setupEnterprisePlugins();
    mockedAiStreamingQuery.mockReset();
    jest.mocked(findMatchingInflightAiStreamingRequests).mockReturnValue([]);
    fetchMock.get(
      "path:/api/metabot/permissions/user-permissions",
      createMockUserMetabotPermissions(),
    );
  });

  afterEach(() => {
    fetchMock.removeRoutes();
  });

  it("updates the proposed SQL in query builder when omnibot streams a code_edit", async () => {
    let requestBody: any;

    mockedAiStreamingQuery.mockImplementation(async (request, callbacks) => {
      requestBody = request.body;

      callbacks?.onDataPart?.({
        type: "code_edit",
        version: 1,
        value: {
          buffer_id: "qb",
          mode: "rewrite",
          value: SUGGESTED_SQL,
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

    const storeInitialState = createMockState({
      currentUser: createMockUser(),
      settings: mockSettings({
        "llm-metabot-configured?": true,
      }),
      entities: createMockEntitiesState({
        databases: [TEST_DB],
        questions: [TEST_NATIVE_CARD],
      }),
      metabot: getMetabotInitialState(),
    } as any);

    const metadata = getMetadata(storeInitialState);
    const question = checkNotNull(metadata.question(TEST_NATIVE_CARD.id));

    const { store } = renderWithProviders(
      <MetabotProvider>
        <QuerySuggestionProbe question={question} />
      </MetabotProvider>,
      {
        storeInitialState: storeInitialState as any,
      },
    );
    const typedStore = store as Omit<typeof store, "dispatch" | "getState"> & {
      dispatch: ThunkDispatch<State, void, AnyAction>;
      getState: () => State;
    };

    const conversationId =
      typedStore.getState().metabot.conversations.omnibot?.conversationId;

    expect(conversationId).toBeDefined();

    await act(async () => {
      await typedStore.dispatch(
        sendAgentRequest({
          agentId: "omnibot",
          message: "Please rewrite this query",
          conversation_id: conversationId as string,
          context: {
            user_is_viewing: [
              {
                type: "code_editor",
                buffers: [
                  {
                    id: "qb",
                    source: {
                      language: "sql",
                      database_id: TEST_DB.id,
                      value: INITIAL_SQL,
                    },
                    cursor: { line: 1, column: 1 },
                  },
                ],
              },
            ],
            current_time_with_timezone: "2026-03-04T00:00:00Z",
            capabilities: [],
          },
          history: [],
          state: {},
        }),
      );
    });

    expect(typedStore.getState().qb.uiControls.isNativeEditorOpen).toBe(true);

    await waitFor(() => {
      expect(screen.getByTestId("qb-proposed-sql")).toHaveTextContent(
        SUGGESTED_SQL,
      );
    });

    expect(requestBody?.context).toEqual(
      expect.objectContaining({
        user_is_viewing: expect.arrayContaining([
          expect.objectContaining({
            type: "code_editor",
            buffers: [
              expect.objectContaining({
                id: "qb",
                source: expect.objectContaining({
                  language: "sql",
                  database_id: TEST_DB.id,
                }),
              }),
            ],
          }),
        ]),
      }),
    );
  });
});
