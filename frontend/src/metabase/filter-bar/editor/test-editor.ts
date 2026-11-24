import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

import type { Token } from "../model/types";

import { createCaret } from "./caret";
import { documentToTokens, tokensToContent } from "./document";
import { createHiddenThen } from "./hidden-then";
import {
  createConnectorNode,
  createParenNode,
  createPillNode,
  createThenNode,
} from "./nodes";
import { createPillRegistry } from "./pill-registry";
import { createFilterBarRules } from "./rules";

export const createTestEditor = (...stages: Token<string>[][]) => {
  const registry = createPillRegistry<string>();
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
      createFilterBarRules(),
      createHiddenThen(),
      createCaret("caret"),
    ],
    content: tokensToContent(stages, registry),
  });

  const getStages = () => documentToTokens(editor.state.doc, registry);

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

  return { editor, getStages, placeCaret, selectNode, press, type };
};
