import type { JSONContent, Editor as TiptapEditor } from "@tiptap/react";

import {
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import {
  createMockDatabase,
  createMockRecentCollectionItem,
  createMockUser,
} from "metabase-types/api/mocks";

import { Editor } from "./Editor";

const CONTENT: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Intro" }],
    },
    {
      type: "metabot",
      content: [{ type: "text", text: "Chart orders by" }],
    },
  ],
};

type SetupOpts = {
  canUseMetabot?: boolean;
};

const setup = async ({ canUseMetabot = false }: SetupOpts = {}) => {
  setupDatabasesEndpoints([createMockDatabase({ id: 1, name: "QA Postgres" })]);
  setupSearchEndpoints([]);
  setupUserMetabotPermissionsEndpoint();
  setupRecentViewsEndpoints([
    createMockRecentCollectionItem({ id: 1, name: "Recent Card" }),
  ]);

  let editor: TiptapEditor | null = null;
  renderWithProviders(
    <Editor
      initialContent={CONTENT}
      onEditorReady={(readyEditor) => {
        editor = readyEditor;
      }}
    />,
    canUseMetabot
      ? {
          storeInitialState: createMockState({
            currentUser: createMockUser(),
            settings: mockSettings({
              "metabot-enabled?": true,
              "llm-metabot-configured?": true,
            }),
          }),
        }
      : undefined,
  );
  await waitFor(() => expect(editor?.getText()).toContain("Chart orders by"));
  return checkNotNull<TiptapEditor>(editor);
};

const getEndOfNode = (editor: TiptapEditor, nodeType: string) => {
  let end: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (end === null && node.type.name === nodeType) {
      end = pos + 1 + node.content.size;
    }
    return end === null;
  });
  return checkNotNull<number>(end);
};

const typeAtEndOf = (editor: TiptapEditor, nodeType: string, text: string) =>
  act(() => {
    editor
      .chain()
      .focus()
      .setTextSelection(getEndOfNode(editor, nodeType))
      .insertContent(text)
      .run();
  });

describe("Editor suggestion routing", () => {
  it("opens the Metabot database suggestion for @ inside a Metabot block", async () => {
    const editor = await setup();

    typeAtEndOf(editor, "metabot", " @");

    expect(
      await screen.findByRole("option", { name: /QA Postgres/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Metabot dialog" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Mention Dialog" }),
    ).not.toBeInTheDocument();
  });

  it("offers Ask Metabot in the command menu when the user can use Metabot", async () => {
    const editor = await setup({ canUseMetabot: true });

    typeAtEndOf(editor, "paragraph", " /");

    expect(
      await screen.findByRole("option", { name: /Ask Metabot/ }),
    ).toBeInTheDocument();
  });

  it("does not open the command menu for / inside a Metabot block", async () => {
    const editor = await setup();

    typeAtEndOf(editor, "paragraph", " /");
    expect(
      await screen.findByRole("dialog", { name: "Command Dialog" }),
    ).toBeInTheDocument();

    typeAtEndOf(editor, "metabot", " /");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Command Dialog" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("opens the regular mention list for @ outside a Metabot block", async () => {
    const editor = await setup();

    typeAtEndOf(editor, "paragraph", " @");

    expect(
      await screen.findByRole("option", { name: /Recent Card/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Mention Dialog" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Metabot dialog" }),
    ).not.toBeInTheDocument();
  });
});
