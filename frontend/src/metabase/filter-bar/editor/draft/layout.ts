import type { Editor, JSONContent, Range } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { match } from "ts-pattern";

import type { PillToken } from "../../model";
import {
  columnContent,
  operatorContent,
  rangeAndContent,
  valueContent,
} from "../nodes/nodes";
import {
  isColumnNode,
  isDraftNode,
  isOperatorNode,
  isValueNode,
} from "../nodes/types";

import {
  findDraftAt,
  findValueKind,
  getCaretInput,
  getInputs,
  readParts,
} from "./read";
import type {
  ColumnPart,
  Draft,
  DraftLayout,
  DraftPart,
  DraftParts,
  DraftStep,
  ValuesPart,
} from "./types";

const inputContent = (
  part: DraftPart | null = null,
  text = "",
): JSONContent => ({
  type: "draftInput",
  attrs: { part },
  content: text !== "" ? [{ type: "text", text }] : [],
});

export const draftContent = (text: string): JSONContent => ({
  type: "draft",
  content: [inputContent(null, text)],
});

export const columnDraftContent = (part: ColumnPart): JSONContent => ({
  type: "draft",
  content: [columnContent(part), inputContent()],
});

const buildValuesPart = ({
  column,
  operator,
  values,
}: DraftParts): ValuesPart | null =>
  column && operator && values.length > 0
    ? {
        type: "values",
        parts: { column: column.column, operator: operator.operator, values },
        targetStage: column.targetStage,
      }
    : null;

const getCaretOffset = (nodes: readonly PmNode[], caretIndex: number) => {
  const before = nodes
    .slice(0, caretIndex)
    .reduce((size, node) => size + node.nodeSize, 0);
  return before + 1 + (nodes[caretIndex]?.content.size ?? 0);
};

const setDraftContent = (
  editor: Editor,
  draft: Draft,
  { content, caretIndex }: DraftLayout,
) => {
  const { state } = editor;
  const nodes = content.map((json) => state.schema.nodeFromJSON(json));
  const from = draft.pos + 1;
  const transaction = state.tr.replaceWith(
    from,
    draft.pos + draft.node.nodeSize - 1,
    nodes,
  );
  const caret = from + getCaretOffset(nodes, caretIndex);
  editor.view.dispatch(
    transaction.setSelection(TextSelection.create(transaction.doc, caret)),
  );
  return true;
};

const layoutDraft = (parts: DraftParts, step: DraftStep): DraftLayout => {
  const { values } = parts;
  const column = parts.column ? [columnContent(parts.column)] : [];
  const operator = parts.operator ? [operatorContent(parts.operator)] : [];
  const listContent = () => {
    const valuesPart = parts.valuesPart ?? buildValuesPart(parts);
    return valuesPart ? [valueContent(valuesPart)] : [];
  };
  const texts = values.map(String);
  const fixed = [...column, ...operator];
  return match(step)
    .with("column", () => ({
      content: [inputContent(parts.column), ...operator, ...listContent()],
      caretIndex: 0,
    }))
    .with("operator", () => ({
      content: [...column, inputContent(parts.operator), ...listContent()],
      caretIndex: column.length,
    }))
    .with("value", () =>
      match(findValueKind(parts.operator))
        .with("single", () => ({
          content: [...fixed, inputContent(null, texts.at(-1) ?? "")],
          caretIndex: fixed.length,
        }))
        .with("range", () => {
          const [from = "", to = ""] = texts;
          return {
            content: [
              ...fixed,
              inputContent(null, from),
              rangeAndContent(),
              inputContent(null, to),
            ],
            caretIndex: from === "" ? fixed.length : fixed.length + 2,
          };
        })
        .otherwise(() => {
          const content = [...fixed, ...listContent(), inputContent()];
          return { content, caretIndex: content.length - 1 };
        }),
    )
    .exhaustive();
};

export const insertDraft = (
  editor: Editor,
  range: Range,
  json: JSONContent,
) => {
  const { state } = editor;
  const node = state.schema.nodeFromJSON(json);
  if (!isDraftNode(node)) {
    return false;
  }
  const transaction = state.tr.replaceRangeWith(range.from, range.to, node);
  const inputs = getInputs({ node, pos: range.from });
  const caret = inputs.at(-1)?.to ?? range.from + 1;
  editor.view.dispatch(
    transaction.setSelection(TextSelection.create(transaction.doc, caret)),
  );
  return true;
};

export const placeDraftInput = (
  editor: Editor,
  draft: Draft,
  parts: DraftParts,
  step: DraftStep,
) => setDraftContent(editor, draft, layoutDraft(parts, step));

export const insertPillDraft = <F>(
  editor: Editor,
  range: Range,
  pill: PillToken<F>,
  parts: DraftParts,
  step: DraftStep,
) => {
  const { state } = editor;
  const { content, caretIndex } = layoutDraft(parts, step);
  const node = state.schema.nodeFromJSON({
    type: "draft",
    attrs: { pill },
    content,
  });
  const children = Array.from({ length: node.childCount }, (_, index) =>
    node.child(index),
  );
  const transaction = state.tr.replaceRangeWith(range.from, range.to, node);
  const caret = range.from + 1 + getCaretOffset(children, caretIndex);
  editor.view.dispatch(
    transaction.setSelection(TextSelection.create(transaction.doc, caret)),
  );
  return true;
};

export const setDraftValues = (
  editor: Editor,
  draft: Draft,
  values: readonly unknown[],
) =>
  placeDraftInput(
    editor,
    draft,
    { ...readParts(draft), values, valuesPart: null },
    "value",
  );

const getPartStep = (node: PmNode): DraftStep | null => {
  if (isColumnNode(node)) {
    return "column";
  }
  if (isOperatorNode(node)) {
    return "operator";
  }
  return isValueNode(node) ? "value" : null;
};

export const editClickedPart = (
  editor: Editor,
  node: PmNode,
  nodePos: number,
) => {
  const step = getPartStep(node);
  const draft = step
    ? findDraftAt(editor.state.doc.resolve(nodePos))
    : undefined;
  if (!step || !draft) {
    return false;
  }
  return placeDraftInput(editor, draft, readParts(draft), step);
};

export const placeCaretInField = (editor: Editor, index: number) => {
  const draft = findDraftAt(editor.state.selection.$from);
  const input = draft ? getInputs(draft)[index] : undefined;
  return input ? editor.commands.setTextSelection(input.to) : false;
};

export const moveToNextInput = (editor: Editor) => {
  const caret = getCaretInput(editor);
  const next = caret ? caret.inputs[caret.index + 1] : undefined;
  return next ? editor.commands.setTextSelection(next.to) : false;
};
