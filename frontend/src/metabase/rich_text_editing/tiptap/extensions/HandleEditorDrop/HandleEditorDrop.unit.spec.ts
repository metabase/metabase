import { Editor, type JSONContent, Node, findChildren } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { FlexContainer } from "../FlexContainer/FlexContainer";
import { ResizeNode } from "../ResizeNode/ResizeNode";

import { HandleEditorDrop } from "./HandleEditorDrop";

// Drop handling acts on editor state only, so the React node views are
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
  draggable: true,
  addAttributes() {
    return { id: { default: null } };
  },
  renderHTML() {
    return ["div", { class: "node-cardEmbed" }];
  },
});

const SupportingTextStub = Node.create({
  name: "supportingText",
  group: "block",
  content: "paragraph+",
});

type Side = "left" | "right";

// Drop target geometry: the drop side is derived from where `clientX` falls
// within the target card's bounding rect.
const TARGET_RECT_WIDTH = 100;
const CLIENT_X_BY_SIDE: Record<Side, number> = { left: 20, right: 80 };

const card = (id: number): JSONContent => ({
  type: "cardEmbed",
  attrs: { id },
});

const standalone = (id: number): JSONContent => ({
  type: "resizeNode",
  content: [card(id)],
});

const columns = (
  ids: number[],
  columnWidths: number[] | null = null,
): JSONContent => ({
  type: "resizeNode",
  content: [
    {
      type: "flexContainer",
      attrs: { columnWidths },
      content: ids.map(card),
    },
  ],
});

function setup(content: JSONContent[]) {
  return new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      CardEmbedStub,
      SupportingTextStub,
      FlexContainer,
      ResizeNode,
      HandleEditorDrop,
    ],
    content: { type: "doc", content },
  });
}

function findCard(doc: ProseMirrorNode, id: number) {
  const matches = findChildren(
    doc,
    (node) => node.type.name === "cardEmbed" && node.attrs.id === id,
  );
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one card with id ${id}`);
  }
  return matches[0];
}

/**
 * Simulates ProseMirror dispatching a drop of card `cardId` onto card
 * `targetId`. Layout-dependent view methods are stubbed because jsdom has no
 * layout; everything else runs through the real `handleDrop` plugin prop.
 */
function dropCard({
  editor,
  cardId,
  targetId,
  side = "left",
}: {
  editor: Editor;
  cardId: number;
  targetId: number;
  side?: Side;
}) {
  const { view } = editor;
  const { doc } = view.state;
  const source = findCard(doc, cardId);
  const target = findCard(doc, targetId);

  const targetDOM = view.nodeDOM(target.pos) as HTMLElement;
  targetDOM.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: TARGET_RECT_WIDTH, height: 100 }) as DOMRect;

  jest
    .spyOn(view, "posAtCoords")
    .mockReturnValue({ pos: target.pos, inside: target.pos });

  const slice = doc.slice(source.pos, source.pos + source.node.nodeSize);
  const event = {
    target: targetDOM,
    clientX: CLIENT_X_BY_SIDE[side],
    clientY: 10,
  } as unknown as DragEvent;

  return view.someProp("handleDrop", (handleDrop) =>
    handleDrop(view, event, slice, true),
  );
}

type LayoutBlock = number | number[];

const childNodes = (node: ProseMirrorNode) => [...node.content.content];

/** Top-level layout: a number for a standalone card, an array for columns. */
function getLayout(editor: Editor): LayoutBlock[] {
  return childNodes(editor.state.doc)
    .filter((block) => block.type.name === "resizeNode")
    .flatMap(childNodes)
    .map((child) =>
      child.type.name === "flexContainer"
        ? childNodes(child).map((item) => item.attrs.id)
        : child.attrs.id,
    );
}

function getColumnWidths(editor: Editor) {
  return findChildren(
    editor.state.doc,
    (node) => node.type.name === "flexContainer",
  ).map(({ node }) => node.attrs.columnWidths);
}

describe("HandleEditorDrop", () => {
  describe("dropping a standalone card onto another standalone card", () => {
    it.each<{ side: Side; expected: LayoutBlock[] }>([
      { side: "left", expected: [[1, 2]] },
      { side: "right", expected: [[2, 1]] },
    ])(
      "wraps both cards in columns inside a resizeNode ($side side)",
      ({ side, expected }) => {
        const editor = setup([standalone(1), standalone(2)]);

        expect(dropCard({ editor, cardId: 1, targetId: 2, side })).toBe(true);

        expect(getLayout(editor)).toEqual(expected);
        expect(editor.state.doc.firstChild?.type.name).toBe("resizeNode");
        expect(editor.state.doc.firstChild?.firstChild?.type.name).toBe(
          "flexContainer",
        );
      },
    );

    it("ignores a card dropped onto itself", () => {
      const editor = setup([standalone(1), standalone(2)]);
      const docBefore = editor.state.doc;

      expect(dropCard({ editor, cardId: 1, targetId: 1 })).toBe(true);

      expect(editor.state.doc.eq(docBefore)).toBe(true);
      expect(getLayout(editor)).toEqual([1, 2]);
    });
  });

  describe("dropping a standalone card into existing columns", () => {
    it.each<{ targetId: number; side: Side; expected: number[] }>([
      { targetId: 1, side: "left", expected: [3, 1, 2] },
      { targetId: 1, side: "right", expected: [1, 3, 2] },
      { targetId: 2, side: "right", expected: [1, 2, 3] },
    ])(
      "inserts the card $side of card $targetId",
      ({ targetId, side, expected }) => {
        const editor = setup([columns([1, 2]), standalone(3)]);

        expect(dropCard({ editor, cardId: 3, targetId, side })).toBe(true);

        expect(getLayout(editor)).toEqual([expected]);
      },
    );

    it("rejects a fourth card", () => {
      const editor = setup([columns([1, 2, 3]), standalone(4)]);
      const docBefore = editor.state.doc;

      expect(dropCard({ editor, cardId: 4, targetId: 1 })).toBe(true);

      expect(editor.state.doc.eq(docBefore)).toBe(true);
      expect(getLayout(editor)).toEqual([[1, 2, 3], 4]);
    });
  });

  describe("reordering cards within the same columns", () => {
    it("swaps two cards and back", () => {
      const editor = setup([columns([1, 2])]);

      dropCard({ editor, cardId: 1, targetId: 2, side: "right" });
      expect(getLayout(editor)).toEqual([[2, 1]]);

      dropCard({ editor, cardId: 1, targetId: 2, side: "left" });
      expect(getLayout(editor)).toEqual([[1, 2]]);
    });

    it("keeps each card's column width when swapping", () => {
      const editor = setup([columns([1, 2], [70, 30])]);

      dropCard({ editor, cardId: 1, targetId: 2, side: "right" });

      expect(getLayout(editor)).toEqual([[2, 1]]);
      expect(getColumnWidths(editor)).toEqual([[30, 70]]);
    });

    it("keeps all three cards when reordering a full row", () => {
      const editor = setup([columns([1, 2, 3]), standalone(4)]);

      dropCard({ editor, cardId: 1, targetId: 2, side: "left" });

      expect(getLayout(editor)).toEqual([[1, 2, 3], 4]);

      dropCard({ editor, cardId: 1, targetId: 3, side: "right" });

      expect(getLayout(editor)).toEqual([[2, 3, 1], 4]);
    });
  });

  describe("moving cards between columns", () => {
    it("moves a card into other columns and unwraps the single card left behind", () => {
      const editor = setup([columns([1, 2]), columns([3, 4])]);

      expect(dropCard({ editor, cardId: 2, targetId: 3, side: "right" })).toBe(
        true,
      );

      expect(getLayout(editor)).toEqual([1, [3, 2, 4]]);
    });

    it("rejects a move into full columns", () => {
      const editor = setup([columns([1, 2]), columns([3, 4, 5])]);
      const docBefore = editor.state.doc;

      expect(dropCard({ editor, cardId: 2, targetId: 3 })).toBe(true);

      expect(editor.state.doc.eq(docBefore)).toBe(true);
      expect(getLayout(editor)).toEqual([
        [1, 2],
        [3, 4, 5],
      ]);
    });

    it("creates new columns when a card leaves full columns for a standalone card", () => {
      const editor = setup([standalone(1), columns([2, 3, 4])]);

      expect(dropCard({ editor, cardId: 4, targetId: 1, side: "right" })).toBe(
        true,
      );

      expect(getLayout(editor)).toEqual([
        [1, 4],
        [2, 3],
      ]);
    });
  });
});
