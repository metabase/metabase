import { Editor, type JSONContent, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";

import { FlexContainer } from "../../FlexContainer/FlexContainer";
import { ResizeNode } from "../../ResizeNode/ResizeNode";
import { SupportingText } from "../../SupportingText/SupportingText";
import type { DroppedCardEmbedNodeData } from "../utils";

import { handleCardDropOnCard } from "./cardToCard";
import { handleCardDropToFlexContainer } from "./cardToFlexContainer";

// Render every node as a plain div carrying the `node-<type>` class the drop
// handlers look up, so the schema and DOM work without React node views.
jest.mock("@tiptap/react", () => ({
  __esModule: true,
  ReactNodeViewRenderer:
    () =>
    ({ node }: { node: ProseMirrorNode }) => {
      const dom = document.createElement("div");
      dom.className = `node-${node.type.name}`;
      return { dom, contentDOM: node.isLeaf ? undefined : dom };
    },
  NodeViewWrapper: () => null,
  NodeViewContent: () => null,
}));

// Stands in for the documents CardEmbed node, which rich_text_editing can't import.
const CardEmbed = Node.create({
  name: "cardEmbed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { id: { default: null } };
  },
  renderHTML() {
    return ["div", { class: "node-cardEmbed" }];
  },
});

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

function makeEditor(content: JSONContent[]) {
  return new Editor({
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
  const { node, pos } = result;
  const $pos = editor.state.doc.resolve(pos);
  return { node, pos, parent: $pos.parent, $pos };
}

type DropSide = "left" | "right";

const CARD_WIDTH_PX = 100;

function dropEventOnCard(
  editor: Editor,
  cardId: number,
  side: DropSide,
): DragEvent {
  const target = editor.view.nodeDOM(findCard(editor, cardId).pos);
  if (!(target instanceof HTMLElement)) {
    throw new Error(`No DOM for card ${cardId}`);
  }
  jest
    .spyOn(target, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(0, 0, CARD_WIDTH_PX, CARD_WIDTH_PX));
  const event = new MouseEvent("drop", {
    bubbles: true,
    clientX: side === "left" ? CARD_WIDTH_PX * 0.25 : CARD_WIDTH_PX * 0.75,
  });
  target.dispatchEvent(event);
  // jsdom has no DragEvent; the drop handlers only read MouseEvent fields.
  return event as DragEvent;
}

function dropCardOnCard(
  editor: Editor,
  draggedCardId: number,
  targetCardId: number,
  side: DropSide,
): DroppedCardEmbedNodeData {
  const dragged = findCard(editor, draggedCardId);
  const target = findCard(editor, targetCardId);
  const originalParent = dragged.parent;
  const originalPos =
    originalParent.type.name === "resizeNode"
      ? dragged.$pos.before()
      : dragged.pos;
  return {
    draggedNode: dragged.node,
    originalParent,
    originalPos,
    cameFromFlexContainer: originalParent.type.name === "flexContainer",
    dropPos: target.pos,
    dropToParent: target.parent,
    dropToParentPos: target.$pos,
    event: dropEventOnCard(editor, targetCardId, side),
    slice: editor.state.doc.slice(dragged.pos, dragged.pos + 1),
    moved: true,
    view: editor.view,
  };
}

function getFlexContainerCardIds(editor: Editor) {
  const groups: (number | "supportingText")[][] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "flexContainer") {
      groups.push(
        node.children.map((child) =>
          child.type.name === "cardEmbed" ? child.attrs.id : child.type.name,
        ),
      );
      return false;
    }
  });
  return groups;
}

function getCardIds(editor: Editor) {
  const ids: number[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "cardEmbed") {
      ids.push(node.attrs.id);
    }
  });
  return ids;
}

describe("card drop handlers", () => {
  it("does not add a fourth card to a flexContainer that already has 3 cards", () => {
    const editor = makeEditor([
      resizeNode(flexContainer([card(1), card(2), card(3)])),
      resizeNode(card(4)),
    ]);
    const docBefore = editor.state.doc;

    const handled = handleCardDropToFlexContainer(
      dropCardOnCard(editor, 4, 1, "left"),
    );

    expect(handled).toBe(true);
    expect(editor.state.doc.eq(docBefore)).toBe(true);
    expect(getFlexContainerCardIds(editor)).toEqual([[1, 2, 3]]);
    expect(getCardIds(editor)).toEqual([1, 2, 3, 4]);

    editor.destroy();
  });

  it("does not move a card into a flexContainer from another one that already has 3 cards", () => {
    const editor = makeEditor([
      resizeNode(flexContainer([card(1), card(2), card(3)])),
      resizeNode(flexContainer([card(4), card(5)])),
    ]);
    const docBefore = editor.state.doc;

    const handled = handleCardDropToFlexContainer(
      dropCardOnCard(editor, 4, 1, "left"),
    );

    expect(handled).toBe(true);
    expect(editor.state.doc.eq(docBefore)).toBe(true);

    editor.destroy();
  });

  it("removes supporting text when the last chart in its group is moved to another group", () => {
    const editor = makeEditor([
      resizeNode(
        flexContainer([supportingText("Lorem ipsum"), card(1), card(2)]),
      ),
      resizeNode(card(3)),
    ]);

    handleCardDropOnCard(
      dropCardOnCard(editor, 1, 3, "left"),
      findCard(editor, 3).node,
    );

    expect(editor.getText()).toContain("Lorem ipsum");
    expect(getFlexContainerCardIds(editor)).toEqual([
      ["supportingText", 2],
      [1, 3],
    ]);

    handleCardDropToFlexContainer(dropCardOnCard(editor, 2, 3, "left"));

    expect(editor.getText()).not.toContain("Lorem ipsum");
    expect(getFlexContainerCardIds(editor)).toEqual([[1, 2, 3]]);

    editor.destroy();
  });

  it("removes supporting text when the last chart in its group is dropped onto a standalone card", () => {
    const editor = makeEditor([
      resizeNode(flexContainer([supportingText("Lorem ipsum"), card(1)])),
      resizeNode(card(2)),
    ]);

    handleCardDropOnCard(
      dropCardOnCard(editor, 1, 2, "left"),
      findCard(editor, 2).node,
    );

    expect(editor.getText()).not.toContain("Lorem ipsum");
    expect(getFlexContainerCardIds(editor)).toEqual([[1, 2]]);

    editor.destroy();
  });
});
