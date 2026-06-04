import { Route } from "react-router";

import { setupDocumentEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
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
      component={() => <AgentDocumentMessage documentId={99} />}
    />,
    { withRouter: true },
  );
}

describe("AgentDocumentMessage", () => {
  it("renders the document read-only with a link to open it", async () => {
    setup();

    const editor = await screen.findByTestId("document-editor");
    expect(editor).toHaveAttribute("data-editable", "false");

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
