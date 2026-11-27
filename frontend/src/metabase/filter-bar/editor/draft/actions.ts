import type { Editor, Range } from "@tiptap/core";
import { NodeSelection, PluginKey } from "@tiptap/pm/state";
import { match } from "ts-pattern";

import { pillToken } from "../../model";
import type {
  FilterBarAdapter,
  FilterColumn,
  FilterOperator,
} from "../../types";
import { getStageAt, placePill } from "../document";
import { getPillToken } from "../nodes/nodes";
import { isPillNode } from "../nodes/types";

import {
  columnDraftContent,
  insertDraft,
  insertPillDraft,
  moveToNextInput,
  placeDraftInput,
  setDraftValues,
} from "./layout";
import {
  findDraftAt,
  findDraftStartingAt,
  getDraftRange,
  getInputRange,
  readDraft,
  readValues,
} from "./read";
import type {
  ColumnPart,
  Draft,
  DraftStep,
  FilterEditorRequest,
} from "./types";

const splitList = (text: string) =>
  text
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

export const addListValues = (values: readonly unknown[], text: string) => {
  const texts = new Set(values.map(String));
  const added = splitList(text).filter((value) => !texts.has(value));
  return [...values, ...new Set(added)];
};

export const DRAFT_SUGGESTION_KEY = new PluginKey("draftSuggestion");

export type DraftActionsOptions<F> = {
  getAdapter: () => FilterBarAdapter<F>;
  openFilterEditor: (request: FilterEditorRequest<F>) => void;
};

export type DraftActions<F> = ReturnType<typeof createDraftActions<F>>;

export const createDraftActions = <F>({
  getAdapter,
  openFilterEditor,
}: DraftActionsOptions<F>) => {
  const getColumnPart = (draft: Draft | null) =>
    draft ? readDraft(draft).column : null;

  const getOperatorPart = (draft: Draft) => readDraft(draft).operator;

  const commitFilter = (
    editor: Editor,
    range: Range,
    filter: F,
    targetStage: number,
  ) => {
    const token = pillToken(
      filter,
      getAdapter().stage(targetStage).toPill(filter),
    );
    placePill(editor, range, token, targetStage);
    return true;
  };

  const getValueStep = (draft: Draft) => {
    const columnPart = getColumnPart(draft);
    const operatorPart = getOperatorPart(draft);
    const { step, text } = readDraft(draft);
    if (!columnPart || !operatorPart || step !== "value") {
      return null;
    }
    const { operator } = operatorPart;
    const values = readValues(draft);
    return {
      column: columnPart.column,
      targetStage: columnPart.targetStage,
      operator,
      values:
        operator.valueKind === "multi" ? addListValues(values, text) : values,
    };
  };

  const commitValues = (
    editor: Editor,
    draft: Draft,
    {
      column,
      targetStage,
      operator,
      values,
    }: NonNullable<ReturnType<typeof getValueStep>>,
  ) => {
    const hasValues = match(operator.valueKind)
      .with("none", () => true)
      .with(
        "range",
        () => values.length === 2 && values.every((value) => value !== ""),
      )
      .otherwise(() => values.length > 0);
    const filter = hasValues
      ? getAdapter().stage(targetStage).toFilter({ column, operator, values })
      : null;
    if (filter === null) {
      return true;
    }
    return commitFilter(editor, getDraftRange(draft), filter, targetStage);
  };

  const commitDraft = (editor: Editor, draft: Draft) => {
    const step = getValueStep(draft);
    return step ? commitValues(editor, draft, step) : false;
  };

  const commitDraftAtCaret = (editor: Editor) => {
    const draft = findDraftAt(editor.state.selection.$from);
    return draft ? commitDraft(editor, draft) : false;
  };

  const addTypedValues = (editor: Editor) => {
    const draft = findDraftAt(editor.state.selection.$from);
    const step = draft ? getValueStep(draft) : null;
    if (!draft || !step) {
      return false;
    }
    return match(step.operator.valueKind)
      .with("multi", () => setDraftValues(editor, draft, step.values))
      .with(
        "range",
        () => moveToNextInput(editor) || commitValues(editor, draft, step),
      )
      .otherwise(() => false);
  };

  const tabInValues = (editor: Editor) => {
    const draft = findDraftAt(editor.state.selection.$from);
    const step = draft ? getValueStep(draft) : null;
    if (!draft || !step) {
      return false;
    }
    const hasText = readDraft(draft).text.trim() !== "";
    return match(step.operator.valueKind)
      .with("multi", () =>
        hasText
          ? setDraftValues(editor, draft, step.values)
          : commitValues(editor, draft, step),
      )
      .with(
        "range",
        () => moveToNextInput(editor) || commitValues(editor, draft, step),
      )
      .otherwise(() => commitValues(editor, draft, step));
  };

  const removeLastValue = (editor: Editor) => {
    const { selection } = editor.state;
    const draft = findDraftAt(selection.$from);
    const { valuesPart, step, text } = draft
      ? readDraft(draft)
      : { valuesPart: null, step: null, text: "" };
    const isAtInputStart =
      draft && selection.empty && selection.from === getInputRange(draft).from;
    if (!draft || !isAtInputStart || step !== "value" || !valuesPart) {
      return false;
    }
    if (text !== "") {
      return true;
    }
    const values = readValues(draft).slice(0, -1);
    return setDraftValues(editor, draft, values);
  };

  const pickColumn = (
    editor: Editor,
    range: Range,
    column: FilterColumn,
    targetStage: number,
  ) => {
    const operators = getAdapter().stage(targetStage).operators(column);
    if (operators === null) {
      editor.commands.deleteRange(range);
      openFilterEditor({ type: "new", column, pos: range.from, targetStage });
      return;
    }
    const columnPart: ColumnPart = { type: "column", column, targetStage };
    const draft = findDraftStartingAt(editor.state.doc, range.from);
    const parts = draft ? readDraft(draft) : null;
    if (!draft || !parts || !parts.edited) {
      insertDraft(editor, range, columnDraftContent(columnPart));
      return;
    }
    const previous = getOperatorPart(draft)?.operator;
    const keepsOperator = operators
      .flat()
      .some(({ key }) => key === previous?.key);
    placeDraftInput(
      editor,
      draft,
      {
        column: columnPart,
        operator: keepsOperator ? parts.operator : null,
        values: keepsOperator ? readValues(draft) : [],
      },
      keepsOperator ? "value" : "operator",
    );
  };

  const pickOperator = (
    editor: Editor,
    range: Range,
    operator: FilterOperator,
  ) => {
    const draft = findDraftStartingAt(editor.state.doc, range.from);
    if (!draft) {
      return;
    }
    const { column } = readDraft(draft);
    const previous = getOperatorPart(draft)?.operator;
    const keepsValues = previous?.valueKind === operator.valueKind;
    const values = keepsValues ? readValues(draft) : [];
    placeDraftInput(
      editor,
      draft,
      { column, operator: { type: "operator", operator }, values },
      "value",
    );
    if (operator.valueKind === "none") {
      commitDraftAtCaret(editor);
    }
  };

  const editPill = (editor: Editor, pos: number, step: DraftStep = "value") => {
    const node = editor.state.doc.nodeAt(pos);
    const token = isPillNode(node) ? getPillToken<F>(node) : null;
    if (!node || !token) {
      return false;
    }
    const targetStage = getStageAt(editor.state.doc, pos);
    if (token.content.type !== "parts") {
      openFilterEditor({
        type: "edit",
        filter: token.filter,
        pos,
        targetStage,
      });
      return true;
    }
    const { column, operator, values } = token.content.parts;
    return insertPillDraft(
      editor,
      { from: pos, to: pos + node.nodeSize },
      token,
      {
        column: { type: "column", column, targetStage },
        operator: { type: "operator", operator },
        values,
      },
      step,
    );
  };

  const editSelectedPill = (editor: Editor) => {
    const { selection } = editor.state;
    const isPillSelected =
      selection instanceof NodeSelection && isPillNode(selection.node);
    return isPillSelected && editPill(editor, selection.from);
  };

  return {
    commitFilter,
    commitDraft,
    addTypedValues,
    tabInValues,
    removeLastValue,
    pickColumn,
    pickOperator,
    editPill,
    editSelectedPill,
  };
};
