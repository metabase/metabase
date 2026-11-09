import userEvent from "@testing-library/user-event";
import { Editor, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { noop } from "underscore";

import {
  setupCardQueryMetadataEndpoint,
  setupLastDownloadFormatEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  type DocumentEditorHost,
  DocumentEditorHostProvider,
} from "metabase/documents/components/Editor/DocumentEditorHost";
import { FlexContainer } from "metabase/rich_text_editing/tiptap/extensions/FlexContainer/FlexContainer";
import { ResizeNode } from "metabase/rich_text_editing/tiptap/extensions/ResizeNode/ResizeNode";
import { SupportingText } from "metabase/rich_text_editing/tiptap/extensions/SupportingText/SupportingText";
import {
  createMockCard,
  createMockCardQueryMetadata,
} from "metabase-types/api/mocks";

import { CardEmbed, CardEmbedComponent } from "./CardEmbedNode";

// The editor only provides the document model here; the component under test
// is rendered directly, so node views are plain divs.
jest.mock("@tiptap/react", () => ({
  ...jest.requireActual("@tiptap/react"),
  ReactNodeViewRenderer:
    () =>
    ({ node }: { node: ProseMirrorNode }) => {
      const dom = document.createElement("div");
      return { dom, contentDOM: node.isLeaf ? undefined : dom };
    },
}));

const createCard = (id: number) => createMockCard({ id, name: `Card ${id}` });

const HOST_OVERRIDE: Partial<DocumentEditorHost> = {
  useCardData: ({ id }) => ({
    card: createCard(id),
    isLoading: false,
    series: null,
  }),
  useNodeInViewport: () => ({
    ref: () => undefined,
    isInViewport: false,
    shouldLoadData: false,
  }),
  useUnresolvedCommentsCount: () => 0,
  useCommentUrl: () => "",
};

const card = (id: number): JSONContent => ({
  type: "cardEmbed",
  attrs: { id },
});

const resizeNode = (child: JSONContent): JSONContent => ({
  type: "resizeNode",
  content: [child],
});

const flexContainer = (children: JSONContent[]): JSONContent => ({
  type: "flexContainer",
  content: children,
});

const supportingText = (text: string): JSONContent => ({
  type: "supportingText",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

interface SetupOpts {
  content: JSONContent[];
  cardId: number;
}

function findCard(editor: Editor, cardId: number) {
  let result: { node: ProseMirrorNode; pos: number } | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "cardEmbed" && node.attrs.id === cardId) {
      result = { node, pos };
      return false;
    }
  });
  if (!result) {
    throw new Error(`Card ${cardId} not found`);
  }
  return result;
}

function setup({ content, cardId }: SetupOpts) {
  setupLastDownloadFormatEndpoints();
  setupCardQueryMetadataEndpoint(
    createCard(cardId),
    createMockCardQueryMetadata(),
  );

  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [
      StarterKit,
      CardEmbed,
      FlexContainer,
      ResizeNode,
      SupportingText,
    ],
    content: { type: "doc", content },
  });
  const { node, pos } = findCard(editor, cardId);

  renderWithProviders(
    <DocumentEditorHostProvider hostOverride={HOST_OVERRIDE}>
      <CardEmbedComponent
        node={node}
        editor={editor}
        view={editor.view}
        getPos={() => pos}
        selected={false}
        decorations={[]}
        innerDecorations={DecorationSet.empty}
        HTMLAttributes={{}}
        extension={CardEmbed}
        updateAttributes={noop}
        deleteNode={noop}
      />
    </DocumentEditorHostProvider>,
  );

  return { editor };
}

async function getAddSupportingTextItem() {
  await userEvent.click(screen.getByRole("button", { name: /ellipsis/ }));
  return screen.findByRole("menuitem", { name: /Add supporting text/ });
}

describe("CardEmbed 'Add supporting text' menu item", () => {
  it("is enabled for a standalone card", async () => {
    const { editor } = setup({ content: [resizeNode(card(1))], cardId: 1 });

    expect(await getAddSupportingTextItem()).toBeEnabled();

    editor.destroy();
  });

  it("is enabled for a card in a flexContainer with 2 cards", async () => {
    const { editor } = setup({
      content: [resizeNode(flexContainer([card(1), card(2)]))],
      cardId: 1,
    });

    expect(await getAddSupportingTextItem()).toBeEnabled();

    editor.destroy();
  });

  it("is disabled for a card in a flexContainer with 3 cards", async () => {
    const { editor } = setup({
      content: [resizeNode(flexContainer([card(1), card(2), card(3)]))],
      cardId: 1,
    });

    expect(await getAddSupportingTextItem()).toBeDisabled();

    editor.destroy();
  });

  it("is disabled for a card whose flexContainer already has supporting text", async () => {
    const { editor } = setup({
      content: [
        resizeNode(flexContainer([supportingText("Lorem ipsum"), card(1)])),
      ],
      cardId: 1,
    });

    expect(await getAddSupportingTextItem()).toBeDisabled();

    editor.destroy();
  });
});
