import { Editor, findChildren } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

import type { Token } from "../model";

import { documentToTokens, tokensToContent } from "./document";
import { createDraftKeys } from "./draft/plugins/keys";
import { createDraftLifecycle } from "./draft/plugins/lifecycle";
import {
  createColumnNode,
  createConnectorNode,
  createDraftInputNode,
  createDraftNode,
  createOperatorNode,
  createParenNode,
  createPillNode,
  createRangeAndNode,
  createThenNode,
  createValueNode,
} from "./nodes/nodes";
import { isDraftNode } from "./nodes/types";
import { createBlankClick } from "./plugins/blank-click";
import { createCaret } from "./plugins/caret";
import { createHiddenThen } from "./plugins/hidden-then";
import { createFilterBarKeys } from "./plugins/keys";
import { createParens } from "./plugins/parens";

export const createTestEditor = (...stages: Token<string>[][]) => {
  const editor = new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      createPillNode(),
      createConnectorNode("and"),
      createConnectorNode("or"),
      createParenNode("open"),
      createParenNode("close"),
      createThenNode(),
      createDraftNode(),
      createDraftInputNode(),
      createColumnNode(),
      createOperatorNode(),
      createValueNode(),
      createRangeAndNode(),
      createDraftKeys(),
      createDraftLifecycle(),
      createFilterBarKeys(),
      createParens(),
      createHiddenThen(),
      createBlankClick(),
      createCaret("caret"),
    ],
    content: tokensToContent(stages),
  });

  const getStages = () => documentToTokens<string>(editor.state.doc);

  const placeCaret = (gap: number) => editor.commands.setTextSelection(1 + gap);

  const selectNode = (index: number) =>
    editor.commands.setNodeSelection(1 + index);

  const press = (key: string) =>
    editor.view.someProp("handleKeyDown", (handle) =>
      handle(editor.view, new KeyboardEvent("keydown", { key })),
    );

  const type = (text: string) => {
    [...text].forEach((char) => {
      const { from, to } = editor.state.selection;
      const isHandled = editor.view.someProp("handleTextInput", (handle) =>
        handle(editor.view, from, to, char, () => editor.state.tr),
      );
      if (!isHandled) {
        editor.view.dispatch(editor.state.tr.insertText(char, from, to));
      }
    });
  };

  const findDraft = () => {
    const [draft] = findChildren(editor.state.doc, isDraftNode);
    return draft ? { pos: draft.pos, text: draft.node.textContent } : null;
  };

  return {
    editor,
    getStages,
    placeCaret,
    selectNode,
    press,
    type,
    findDraft,
  };
};
