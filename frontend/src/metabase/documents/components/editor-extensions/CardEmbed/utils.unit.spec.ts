import { findChildren } from "@tiptap/core";
import { type Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

import { canAddSupportingText } from "./utils";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: {},
    paragraph: { group: "block", content: "text*" },
    resizeNode: { group: "block", content: "(flexContainer|cardEmbed)" },
    flexContainer: { content: "(supportingText|cardEmbed){1,3}" },
    supportingText: { content: "paragraph+" },
    cardEmbed: { atom: true, attrs: { id: { default: null } } },
  },
});

const SUPPORTING_TEXT = "text";

type Item = number | typeof SUPPORTING_TEXT;

const toNode = (item: Item) =>
  item === SUPPORTING_TEXT
    ? schema.nodes.supportingText.create(null, schema.nodes.paragraph.create())
    : schema.nodes.cardEmbed.create({ id: item });

const standalone = (id: number) =>
  schema.nodes.resizeNode.create(null, toNode(id));

const group = (items: Item[]) =>
  schema.nodes.resizeNode.create(
    null,
    schema.nodes.flexContainer.create(null, items.map(toNode)),
  );

const makeDoc = (blocks: ProseMirrorNode[]) =>
  schema.nodes.doc.create(null, blocks);

function getCardPos(doc: ProseMirrorNode, id: number) {
  const [match] = findChildren(
    doc,
    (node) => node.type.name === "cardEmbed" && node.attrs.id === id,
  );
  return match.pos;
}

describe("canAddSupportingText", () => {
  it.each<{ name: string; blocks: ProseMirrorNode[]; expected: boolean }>([
    { name: "a standalone card", blocks: [standalone(1)], expected: true },
    { name: "a group of 2 cards", blocks: [group([1, 2])], expected: true },
    {
      name: "a group that already has supporting text",
      blocks: [group([SUPPORTING_TEXT, 1])],
      expected: false,
    },
    {
      name: "a group of 2 cards and supporting text elsewhere",
      blocks: [group([1, 2]), group([SUPPORTING_TEXT, 3])],
      expected: true,
    },
    {
      name: "a full group of 3 cards",
      blocks: [group([1, 2, 3])],
      expected: false,
    },
  ])("returns $expected for card 1 in $name", ({ blocks, expected }) => {
    const doc = makeDoc(blocks);

    expect(canAddSupportingText(doc, getCardPos(doc, 1))).toBe(expected);
  });

  it("returns false while the card has no position", () => {
    const doc = makeDoc([standalone(1)]);

    expect(canAddSupportingText(doc, undefined)).toBe(false);
  });
});
