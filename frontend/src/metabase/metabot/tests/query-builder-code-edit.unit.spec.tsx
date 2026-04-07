import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { Metabot } from "metabase/metabot/components/Metabot";
import { useInlineSQLPrompt } from "metabase/metabot/components/MetabotInlineSQLPrompt";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { getMetabotInitialState } from "../state/reducer-utils";

import {
  enterChatMessage,
  lastReqBody,
  mockAgentEndpoint,
  setup,
} from "./utils";

const TEST_DB = createSampleDatabase();
const INITIAL_SQL = "SELECT 1";
const SUGGESTED_SQL = "SELECT * FROM ORDERS";
const QUERY_REWRITE_RESPONSE = [
  `2:${JSON.stringify({
    type: "code_edit",
    version: 1,
    value: {
      buffer_id: "qb",
      mode: "rewrite",
      value: SUGGESTED_SQL,
    },
  })}`,
  `2:${JSON.stringify({
    type: "state",
    version: 1,
    value: { queries: {} },
  })}`,
  `d:${JSON.stringify({ finishReason: "stop", usage: {} })}`,
];

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
  });

  it("updates the proposed SQL in query builder when omnibot streams a code_edit", async () => {
    const agentSpy = mockAgentEndpoint({ textChunks: QUERY_REWRITE_RESPONSE });

    const storeInitialState = createMockState({
      settings: mockSettings({
        "token-features": createMockTokenFeatures({
          metabot_v3: true,
        }),
      }),
      entities: createMockEntitiesState({
        databases: [TEST_DB],
        questions: [TEST_NATIVE_CARD],
      }),
      metabot: getMetabotInitialState(),
    } as any);

    const metadata = getMetadata(storeInitialState);
    const question = checkNotNull(metadata.question(TEST_NATIVE_CARD.id));

    const { store } = setup({
      ui: (
        <>
          <Metabot />
          <QuerySuggestionProbe question={question} />
        </>
      ),
      storeInitialState: storeInitialState as any,
    });

    await enterChatMessage("Please rewrite this query");

    await waitFor(() => {
      expect(store.getState().qb.uiControls.isNativeEditorOpen).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByTestId("qb-proposed-sql")).toHaveTextContent(
        SUGGESTED_SQL,
      );
    });

    expect((await lastReqBody(agentSpy))?.context).toEqual(
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
