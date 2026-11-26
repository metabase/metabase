import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";

import { pillToken } from "../model";
import { AND, createTestPill, pill } from "../test-utils";

import {
  documentToTokens,
  replacePillTokens,
  tokensToContent,
} from "./document";
import { createConnectorNode, createPillNode } from "./nodes/nodes";

const A = pill("A");
const B = pill("B");

const setup = () => {
  const editor = new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      UndoRedo,
      createPillNode(),
      createConnectorNode("and"),
    ],
    content: tokensToContent([[A, AND, B]]),
  });
  const removeFirstPill = () => {
    editor.commands.setNodeSelection(1);
    editor.commands.deleteSelection();
  };
  const getStages = () => documentToTokens<string>(editor.state.doc);
  return { editor, removeFirstPill, getStages };
};

describe("undo", () => {
  it("brings back a removed pill with its filter", () => {
    const { editor, removeFirstPill, getStages } = setup();
    removeFirstPill();
    editor.commands.undo();
    expect(getStages()[0][0]).toBe(A);
  });

  it("skips the filters the host sent back", () => {
    const { editor, removeFirstPill, getStages } = setup();
    removeFirstPill();
    const newB = pillToken("new B", createTestPill("B"));
    replacePillTokens(editor, [[AND, newB]]);
    expect(getStages()[0][1]).toBe(newB);
    editor.commands.undo();
    expect(getStages()[0][0]).toBe(A);
  });
});
