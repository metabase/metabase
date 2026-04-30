import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import {
  assertConversation,
  createMockReadableStream,
  createPauses,
  enterChatMessage,
  input,
  mockAgentEndpoint,
  responseLoader,
  sendMessageButton,
  setup,
  whoIsYourFavoriteResponse,
} from "./utils";

const SOURCE_FEEDBACK_ENDPOINT = "path:/api/metabot/source-feedback";
const EXTRACT_TABLES_ENDPOINT = "path:/api/llm/extract-tables";

const ORDERS_TABLE = createMockTable({
  id: 2,
  db_id: 1,
  name: "ORDERS",
  display_name: "Orders",
});

const createQuestionPath = (datasetQuery: Record<string, unknown>) =>
  `/question#${btoa(JSON.stringify({ dataset_query: datasetQuery }))}`;

const createNativePath = (sql = "SELECT * FROM ORDERS", database = 1) =>
  createQuestionPath({
    type: "native",
    database,
    native: { query: sql },
  });

describe("metabot > message", () => {
  it("should properly send chat messages", async () => {
    setup();

    const { sendResponse } = mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
      waitForResponse: true,
    });

    await enterChatMessage("Who is your favorite?", false);
    expect(await input()).toHaveTextContent("Who is your favorite?");

    await enterChatMessage("Who is your favorite?");
    expect(await responseLoader()).toBeInTheDocument();

    sendResponse();

    expect(
      await screen.findByText("You, but don't tell anyone."),
    ).toBeInTheDocument();
    expect(await input()).toHaveTextContent("");
    expect(await input()).toHaveFocus();
  });

  it("should be able to send a message via send button", async () => {
    setup();
    mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?", false);
    expect(await input()).toHaveTextContent("Who is your favorite?");
    (await sendMessageButton()).click();

    expect(
      await screen.findByText("You, but don't tell anyone."),
    ).toBeInTheDocument();
  });

  it("should properly handle partial messages", async () => {
    setup();

    const [pause1] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockReadableStream(
        (async function* () {
          yield `0:"You, but "\n`;
          await pause1.promise;
          yield `0:"don't tell anyone."\n`;
          yield `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`;
        })(),
      ),
    });

    await enterChatMessage("Who is your favorite?");
    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but"],
    ]);

    pause1.resolve();

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but don't tell anyone."],
    ]);
  });

  it("should use the first streamed message id for source feedback", async () => {
    const sql = "SELECT * FROM ORDERS";
    const path = createNativePath(sql);

    setup();
    fetchMock.post(SOURCE_FEEDBACK_ENDPOINT, 204);
    fetchMock.post(EXTRACT_TABLES_ENDPOINT, {
      tables: [
        {
          id: ORDERS_TABLE.id,
          name: ORDERS_TABLE.name,
          schema: ORDERS_TABLE.schema,
          display_name: ORDERS_TABLE.display_name,
          description: null,
          columns: [],
        },
      ],
    });
    fetchMock.get("path:/api/database/1", createMockDatabase({ id: 1 }));
    mockAgentEndpoint({
      textChunks: [
        `f:{"messageId":"persisted-message-id"}`,
        `f:{"messageId":"later-step-id"}`,
        `2:{"type":"navigate_to","version":1,"value":${JSON.stringify(path)}}`,
        `0:"Here are the orders."`,
        `2:{"type":"state","version":1,"value":{"queries":{}}}`,
        `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
      ],
    });

    await enterChatMessage("Show me orders");
    await userEvent.click(
      await screen.findByRole("button", { name: "Source is wrong" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(SOURCE_FEEDBACK_ENDPOINT, {
          body: {
            metabot_id: FIXED_METABOT_IDS.DEFAULT,
            message_id: "persisted-message-id",
            source_id: ORDERS_TABLE.id,
            source_type: "table",
            positive: false,
          },
        }),
      ).toHaveLength(1),
    );
  });
});
