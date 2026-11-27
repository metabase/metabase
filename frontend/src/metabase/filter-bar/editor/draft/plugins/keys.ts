import { type Editor, Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import { moveCaretPast } from "../../commands";
import { placeDraftInput } from "../layout";
import {
  findDraftAt,
  getCaretInput,
  getDraftRange,
  getInputRange,
  getInputs,
  hasParts,
  readDraft,
  readParts,
} from "../read";
import type { Draft, DraftState, DraftStep } from "../types";

import { removeDraft } from "./lifecycle";

const moveBetweenInputs = (editor: Editor, isBackward: boolean) => {
  const caret = getCaretInput(editor);
  if (!caret) {
    return false;
  }
  const isAtInnerEdge = isBackward
    ? caret.isAtStart && !caret.isFirst
    : caret.isAtEnd && !caret.isLast;
  const target = caret.inputs[caret.index + (isBackward ? -1 : 1)];
  if (!isAtInnerEdge || !target) {
    return false;
  }
  return editor.commands.setTextSelection(isBackward ? target.to : target.from);
};

const finishPartEdit = (editor: Editor, draft: Draft) =>
  readDraft(draft).edited !== null &&
  placeDraftInput(editor, draft, readParts(draft), "value");

export const finishPartEditAtCaret = (editor: Editor) => {
  const draft = findDraftAt(editor.state.selection.$from);
  return draft ? finishPartEdit(editor, draft) : false;
};

const getNextStep = (
  { step, column, operator }: DraftState,
  isBackward: boolean,
): DraftStep | null => {
  if (isBackward) {
    if (step === "value" && operator) {
      return "operator";
    }
    return step === "operator" && column ? "column" : null;
  }
  if (step === "column" && column) {
    return "operator";
  }
  return step === "operator" && operator ? "value" : null;
};

const moveToPart = (editor: Editor, isBackward: boolean) => {
  const caret = getCaretInput(editor);
  const isAtOuterEdge = isBackward
    ? caret?.isAtStart && caret.isFirst
    : caret?.isAtEnd && caret.isLast;
  const step = caret ? getNextStep(readDraft(caret.draft), isBackward) : null;
  if (!caret || !isAtOuterEdge || !step) {
    return false;
  }
  return placeDraftInput(editor, caret.draft, readParts(caret.draft), step);
};

export const tabToPart = (editor: Editor, isBackward: boolean) => {
  const caret = getCaretInput(editor);
  if (!caret) {
    return false;
  }
  const field = caret.inputs[caret.index + (isBackward ? -1 : 1)];
  if (field) {
    return editor.commands.setTextSelection(field.to);
  }
  const step = getNextStep(readDraft(caret.draft), isBackward);
  if (!step) {
    return false;
  }
  return placeDraftInput(editor, caret.draft, readParts(caret.draft), step);
};

const removeEditedPart = (editor: Editor, draft: Draft) => {
  const { step, edited, column, text } = readDraft(draft);
  if (!edited) {
    return false;
  }
  if (text !== "") {
    return true;
  }
  const kept = step === "operator" ? column : null;
  return placeDraftInput(
    editor,
    draft,
    { column: kept, operator: null, values: [] },
    step,
  );
};

const removeLastPart = (editor: Editor) => {
  const caret = getCaretInput(editor);
  if (!caret || !caret.isAtStart) {
    return false;
  }
  const { draft, inputs, index } = caret;
  const previous = inputs[index - 1];
  if (previous) {
    return editor.commands.setTextSelection(previous.to);
  }
  if (!hasParts(draft.node)) {
    return false;
  }
  if (removeEditedPart(editor, draft)) {
    return true;
  }
  const { step, column } = readDraft(draft);
  if (step === "value") {
    return placeDraftInput(
      editor,
      draft,
      { column, operator: null, values: [] },
      "operator",
    );
  }
  const input = getInputRange(draft);
  const part = draft.node.child(0);
  return editor.commands.deleteRange({
    from: input.from - 1 - part.nodeSize,
    to: input.from - 1,
  });
};

const keepRangeAnd = (editor: Editor) => {
  const caret = getCaretInput(editor);
  return Boolean(caret?.isAtEnd && !caret.isLast);
};

const removeDraftAtCaret = (editor: Editor) => {
  const draft = findDraftAt(editor.state.selection.$from);
  if (!draft) {
    return false;
  }
  if (finishPartEdit(editor, draft)) {
    return true;
  }
  const range = getDraftRange(draft);
  const transaction = removeDraft(editor.state.tr, draft.node, range);
  const caret = transaction.mapping.map(range.to);
  editor.view.dispatch(
    transaction.setSelection(TextSelection.create(transaction.doc, caret)),
  );
  return true;
};

const leaveDraftEdge = (editor: Editor, isBackward: boolean) => {
  const caret = getCaretInput(editor);
  const isAtEdge = isBackward
    ? caret?.isAtStart && caret.isFirst
    : caret?.isAtEnd && caret.isLast;
  if (!caret || !isAtEdge) {
    return false;
  }
  const { draft } = caret;
  const edge = isBackward ? draft.pos : draft.pos + draft.node.nodeSize;
  return moveCaretPast(editor, edge, isBackward);
};

const moveCaretInDraft = (editor: Editor, edge: "start" | "end") => {
  const draft = findDraftAt(editor.state.selection.$from);
  const inputs = draft ? getInputs(draft) : [];
  const target = edge === "start" ? inputs.at(0)?.from : inputs.at(-1)?.to;
  return target !== undefined && editor.commands.setTextSelection(target);
};

export const createDraftKeys = () =>
  Extension.create({
    name: "draftKeys",
    priority: 1100,
    addKeyboardShortcuts: () => ({
      Escape: ({ editor }) => removeDraftAtCaret(editor),
      Backspace: ({ editor }) => removeLastPart(editor),
      Delete: ({ editor }) => keepRangeAnd(editor),
      Tab: ({ editor }) => tabToPart(editor, false),
      "Shift-Tab": ({ editor }) => tabToPart(editor, true),
      ArrowLeft: ({ editor }) =>
        moveBetweenInputs(editor, true) ||
        moveToPart(editor, true) ||
        leaveDraftEdge(editor, true),
      ArrowRight: ({ editor }) =>
        moveBetweenInputs(editor, false) ||
        moveToPart(editor, false) ||
        leaveDraftEdge(editor, false),
      Home: ({ editor }) => moveCaretInDraft(editor, "start"),
      End: ({ editor }) => moveCaretInDraft(editor, "end"),
      "Meta-ArrowLeft": ({ editor }) => moveCaretInDraft(editor, "start"),
      "Meta-ArrowRight": ({ editor }) => moveCaretInDraft(editor, "end"),
    }),
  });
