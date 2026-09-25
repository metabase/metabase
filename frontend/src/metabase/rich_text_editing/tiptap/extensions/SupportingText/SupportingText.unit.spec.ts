import { Editor, type JSONContent, Node } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";

import { FlexContainer } from "../FlexContainer/FlexContainer";
import { ResizeNode } from "../ResizeNode/ResizeNode";

import { SupportingText } from "./SupportingText";

// Keyboard shortcuts act on editor state only, so the React node views are
// replaced with inert DOM nodes.
jest.mock("@tiptap/react", () => {
  const noopNodeView = () => ({
    dom: document.createElement("div"),
    contentDOM: document.createElement("div"),
    update: () => true,
    destroy: () => {},
  });
  return {
    __esModule: true,
    ReactNodeViewRenderer: () => () => noopNodeView(),
    NodeViewWrapper: () => null,
    NodeViewContent: () => null,
  };
});

const CardEmbedStub = Node.create({
  name: "cardEmbed",
  group: "block",
  atom: true,
  addAttributes() {
    return { id: { default: null } };
  },
  renderHTML() {
    return ["div", { "data-type": "cardEmbed" }];
  },
});

const CARD_EMBED: JSONContent = { type: "cardEmbed", attrs: { id: 1 } };

// Position of the first character inside the supporting text's paragraph:
// resizeNode(0) > flexContainer(1) > supportingText(2) > paragraph(3) > text(4)
const SUPPORTING_TEXT_CONTENT_START = 4;

function setup({ supportingText }: { supportingText: string }) {
  const paragraph: JSONContent = supportingText
    ? { type: "paragraph", content: [{ type: "text", text: supportingText }] }
    : { type: "paragraph" };

  const editor = new Editor({
    extensions: [
      StarterKit,
      ResizeNode,
      FlexContainer,
      SupportingText,
      CardEmbedStub,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "resizeNode",
          content: [
            {
              type: "flexContainer",
              content: [
                { type: "supportingText", content: [paragraph] },
                CARD_EMBED,
              ],
            },
          ],
        },
        { type: "paragraph" },
      ],
    },
  });

  editor.commands.setTextSelection(
    SUPPORTING_TEXT_CONTENT_START + supportingText.length,
  );

  return { editor };
}

type ProseMirrorNode = Editor["state"]["doc"];

const descendantTypes = (node: ProseMirrorNode): string[] =>
  node.content.content.flatMap((child) => [
    child.type.name,
    ...descendantTypes(child),
  ]);

const nodeTypes = (editor: Editor) => descendantTypes(editor.state.doc);

const pressBackspace = (editor: Editor) =>
  editor.view.dom.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
  );

describe("SupportingText", () => {
  it("removes an empty supporting text on Backspace and unwraps its flex container", () => {
    const { editor } = setup({ supportingText: "" });
    expect(nodeTypes(editor)).toContain("supportingText");

    pressBackspace(editor);

    expect(nodeTypes(editor)).toEqual(["resizeNode", "cardEmbed", "paragraph"]);
    expect(editor.state.doc.firstChild?.firstChild?.attrs.id).toBe(1);

    editor.destroy();
  });

  it("keeps a non-empty supporting text on Backspace", () => {
    const { editor } = setup({ supportingText: "Lorem" });

    pressBackspace(editor);

    expect(nodeTypes(editor)).toContain("supportingText");
    expect(nodeTypes(editor)).toContain("flexContainer");

    editor.destroy();
  });
});
