import fetchMock from "fetch-mock";

import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockDocument } from "metabase-types/api/mocks";

import { convertConversationToDocument } from "./actions";
import { getMessages } from "./selectors";
import type { MetabotChatMessage } from "./types";

const AGENT_ID = "chat_live-id";

function setup(messages: MetabotChatMessage[]) {
  const metabotState: any = {
    conversations: {
      [AGENT_ID]: {
        conversationId: "live-id",
        prompt: "",
        promptFocusToken: 0,
        isProcessing: false,
        title: "Seed chat",
        messages,
        queuedMessages: [],
        visible: false,
        history: [],
        state: {},
        activeToolCalls: [],
        modelOverride: undefined,
        profileOverride: undefined,
        selectedDatabaseId: undefined,
        pendingMessageExternalId: undefined,
        experimental: { developerMessage: "", metabotReqIdOverride: undefined },
      },
    },
    reactions: { suggestedCodeEdits: {}, suggestedTransforms: [] },
    debugMode: false,
  };

  const { store } = renderWithProviders(<div />, {
    storeInitialState: createMockState({ metabot: metabotState }),
  });
  return store;
}

describe("convertConversationToDocument", () => {
  it("creates a document from the conversation and appends a document message", async () => {
    const createdDocument = createMockDocument({ id: 99 });
    fetchMock.post("path:/api/document", createdDocument);

    const store = setup([
      { id: "u1", role: "user", type: "text", message: "show sales" },
      { id: "a1", role: "agent", type: "text", message: "Here you go" },
      {
        id: "a2",
        role: "agent",
        type: "data_part",
        part: { type: "static_viz", version: 1, value: { entity_id: 7 } },
      },
    ]);

    await store.dispatch(
      convertConversationToDocument({
        agentId: AGENT_ID,
        title: "My report",
      }) as any,
    );

    // POST fired with the conversation rendered into a TipTap doc.
    const call = fetchMock.callHistory.lastCall("path:/api/document", {
      method: "POST",
    });
    const body = await call?.request?.json();
    expect(body.name).toBe("My report");
    expect(body.document.type).toBe("doc");

    // A read-only document message is appended referencing the created doc.
    const messages = getMessages(store.getState() as any, AGENT_ID);
    expect(messages.at(-1)).toMatchObject({
      role: "agent",
      type: "document",
      documentId: 99,
    });
  });

  it("falls back to the conversation title when no title is given", async () => {
    fetchMock.post("path:/api/document", createMockDocument({ id: 1 }));

    const store = setup([
      { id: "u1", role: "user", type: "text", message: "hi" },
    ]);

    await store.dispatch(
      convertConversationToDocument({ agentId: AGENT_ID }) as any,
    );

    const call = fetchMock.callHistory.lastCall("path:/api/document", {
      method: "POST",
    });
    const body = await call?.request?.json();
    expect(body.name).toBe("Seed chat");
  });
});
