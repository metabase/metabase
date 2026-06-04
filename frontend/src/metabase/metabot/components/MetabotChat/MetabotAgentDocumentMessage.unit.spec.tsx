import { Route } from "react-router";

import { setupDocumentEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockDocument,
  createMockDocumentContent,
} from "metabase-types/api/mocks";

import { AgentDocumentMessage } from "./MetabotAgentDocumentMessage";

// The real Editor mounts TipTap/ProseMirror; stub it so the test stays focused
// on the message's data flow.
jest.mock("metabase/documents/components/Editor", () => ({
  Editor: ({ editable }: { editable?: boolean }) => (
    <div data-testid="document-editor" data-editable={String(editable)} />
  ),
}));

const AGENT_ID = "chat_doc";

function seededMetabotState() {
  return {
    conversations: {
      [AGENT_ID]: {
        conversationId: "doc",
        prompt: "",
        promptFocusToken: 0,
        isProcessing: false,
        title: "Seed chat",
        messages: [],
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
}

function setup() {
  const document = createMockDocument({
    id: 99,
    name: "My report",
    document: createMockDocumentContent({
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    }),
  });
  setupDocumentEndpoints(document);

  return renderWithProviders(
    <Route
      path="/"
      component={() => (
        <AgentDocumentMessage documentId={99} agentId={AGENT_ID} />
      )}
    />,
    {
      withRouter: true,
      storeInitialState: createMockState({
        metabot: seededMetabotState() as any,
      }),
    },
  );
}

describe("AgentDocumentMessage", () => {
  it("renders the canvas with the document read-only and an ask-for-changes prompt", async () => {
    setup();

    const editor = await screen.findByTestId("document-editor");
    // Read-only until the user toggles editing.
    expect(editor).toHaveAttribute("data-editable", "false");

    expect(screen.getByPlaceholderText("Ask for changes")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open document/ });
    expect(link).toHaveAttribute("href", "/document/99");
  });

  it("shows a loading state while the document is being fetched", () => {
    setup();
    expect(screen.getByText("Building your document…")).toBeInTheDocument();
  });

  it("hydrates once the document loads", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByTestId("document-editor")).toBeInTheDocument();
    });
    expect(
      screen.queryByText("Building your document…"),
    ).not.toBeInTheDocument();
  });
});
