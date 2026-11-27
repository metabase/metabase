import { type AnyExtension, Editor, findChildren } from "@tiptap/core";
import Text from "@tiptap/extension-text";

import type { PillToken, Token } from "../model";
import { MOCK_ADAPTER, type MockFilter } from "../test-utils";
import type { FilterBarAdapter, FilterColumn, FilterOperator } from "../types";

import { documentToTokens, tokensToContent } from "./document";
import { createDraftActions } from "./draft/actions";
import { insertPillDraft } from "./draft/layout";
import { createDraftActionKeys } from "./draft/plugins/action-keys";
import { createDraftKeys } from "./draft/plugins/keys";
import { createDraftLifecycle } from "./draft/plugins/lifecycle";
import { findDraftAt } from "./draft/read";
import {
  createColumnNode,
  createConnectorNode,
  createDocumentNode,
  createDraftInputNode,
  createDraftNode,
  createOperatorNode,
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

const EDIT_COLUMN: FilterColumn = { key: "c", label: "C", icon: "int" };
const EDIT_OPERATOR: FilterOperator = {
  key: "=",
  label: "is",
  valueKind: "multi",
};

type KeyModifiers = Pick<
  KeyboardEventInit,
  "shiftKey" | "metaKey" | "ctrlKey" | "altKey"
>;

export const createTestEditorWith = <F = string>(
  extensions: AnyExtension[],
  ...stages: Token<F>[][]
) => {
  const editor = new Editor({
    extensions: [
      createDocumentNode(),
      Text,
      createPillNode(),
      createConnectorNode(),
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
      ...extensions,
    ],
    content: tokensToContent(stages),
  });

  const getStages = () => documentToTokens<F>(editor.state.doc);

  const placeCaret = (gap: number) => editor.commands.setTextSelection(gap);

  const selectNode = (index: number) => editor.commands.setNodeSelection(index);

  const press = (key: string, modifiers: KeyModifiers = {}) =>
    Boolean(
      editor.view.someProp("handleKeyDown", (handle) =>
        handle(
          editor.view,
          new KeyboardEvent("keydown", { key, ...modifiers }),
        ),
      ),
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

  const editPillAt = (pos: number, token: PillToken<F>, stage = 0) =>
    insertPillDraft(
      editor,
      { from: pos, to: pos + 1 },
      token,
      {
        column: { type: "column", column: EDIT_COLUMN, targetStage: stage },
        operator: { type: "operator", operator: EDIT_OPERATOR },
        values: [],
      },
      "value",
    );

  const getCaretDraft = () => {
    const draft = findDraftAt(editor.state.selection.$from);
    if (!draft) {
      throw new Error("Expected a draft at the caret");
    }
    return draft;
  };

  return {
    editor,
    getStages,
    placeCaret,
    selectNode,
    press,
    type,
    findDraft,
    getCaretDraft,
    editPillAt,
  };
};

export const createTestEditor = (...stages: Token<string>[][]) =>
  createTestEditorWith<string>([], ...stages);

export const createActionsTestEditor = ({
  stages = [],
  adapter = MOCK_ADAPTER,
}: {
  stages?: Token<MockFilter>[][];
  adapter?: FilterBarAdapter<MockFilter>;
} = {}) => {
  const openFilterEditor = jest.fn();
  const actions = createDraftActions<MockFilter>({
    getAdapter: () => adapter,
    openFilterEditor,
  });
  const testEditor = createTestEditorWith<MockFilter>(
    [createDraftActionKeys(actions)],
    ...stages,
  );
  return { ...testEditor, actions, openFilterEditor };
};
