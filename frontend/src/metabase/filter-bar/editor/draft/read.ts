import {
  type Editor,
  findChildren,
  findParentNodeClosestToPos,
} from "@tiptap/core";
import type { Node as PmNode, ResolvedPos } from "@tiptap/pm/model";
import { match } from "ts-pattern";

import { getDraftPart } from "../nodes/nodes";
import {
  isColumnNode,
  isDraftInputNode,
  isDraftNode,
  isOperatorNode,
  isValueNode,
} from "../nodes/types";

import type {
  Draft,
  DraftPart,
  DraftParts,
  DraftState,
  DraftStep,
  OperatorPart,
} from "./types";

const asColumnPart = (part: DraftPart | null) =>
  part?.type === "column" ? part : null;

const asOperatorPart = (part: DraftPart | null) =>
  part?.type === "operator" ? part : null;

const asValuesPart = (part: DraftPart | null) =>
  part?.type === "values" ? part : null;

export const findValueKind = (operator: OperatorPart | null) =>
  operator?.operator.valueKind ?? null;

export const findDraftAt = ($pos: ResolvedPos): Draft | undefined => {
  const found = findParentNodeClosestToPos($pos, isDraftNode);
  return found && isDraftNode(found.node)
    ? { node: found.node, pos: found.pos }
    : undefined;
};

export const findDrafts = (doc: PmNode): Draft[] =>
  findChildren(doc, isDraftNode).flatMap(({ node, pos }) =>
    isDraftNode(node) ? [{ node, pos }] : [],
  );

export const findDraftStartingAt = (doc: PmNode, pos: number) => {
  const node = doc.nodeAt(pos);
  return isDraftNode(node) ? { node, pos } : null;
};

export const getInputs = (draft: Draft) =>
  findChildren(draft.node, isDraftInputNode).map(({ node, pos }) => {
    const from = draft.pos + 2 + pos;
    return { node, from, to: from + node.content.size };
  });

export const getInputRange = (draft: Draft) => {
  const [input] = getInputs(draft);
  return input ?? { from: draft.pos + 1, to: draft.pos + 1 };
};

export const hasParts = (draft: PmNode) => draft.childCount > 1;

export const isEmptyDraft = (draft: PmNode) =>
  !hasParts(draft) && draft.textContent === "";

const getStep = (before: readonly PmNode[]): DraftStep => {
  if (before.some(isOperatorNode)) {
    return "value";
  }
  return before.some(isColumnNode) ? "operator" : "column";
};

const readPart = (
  node: PmNode | undefined,
  isEdited: boolean,
  edited: DraftPart | null,
) => {
  if (node) {
    return getDraftPart(node);
  }
  return isEdited ? edited : null;
};

export const readDraft = (draft: Draft): DraftState => {
  const children = Array.from({ length: draft.node.childCount }, (_, index) =>
    draft.node.child(index),
  );
  const inputIndex = children.findIndex(isDraftInputNode);
  const input = children[inputIndex];
  const step = getStep(inputIndex >= 0 ? children.slice(0, inputIndex) : []);
  const edited = input ? getDraftPart(input) : null;
  const column = children.find(isColumnNode);
  const operator = children.find(isOperatorNode);
  const values = children.find(isValueNode);
  return {
    step,
    edited,
    column: asColumnPart(readPart(column, step === "column", edited)),
    operator: asOperatorPart(readPart(operator, step === "operator", edited)),
    valuesPart: asValuesPart(values ? getDraftPart(values) : null),
    texts: children.filter(isDraftInputNode).map((node) => node.textContent),
    text: draft.node.textContent,
  };
};

export const getValueKind = (draft: Draft) =>
  findValueKind(readDraft(draft).operator);

const getFieldValues = (info: DraftState) => {
  const texts = info.texts.map((text) => text.trim());
  const isEmpty = texts.every((text) => text === "");
  if (info.step !== "value" || isEmpty) {
    return [];
  }
  return match(findValueKind(info.operator))
    .with("single", () => texts.slice(0, 1))
    .with("range", () => texts.slice(0, 2))
    .otherwise(() => []);
};

const getValues = (info: DraftState): readonly unknown[] =>
  info.valuesPart ? info.valuesPart.parts.values : getFieldValues(info);

export const readValues = (draft: Draft) => getValues(readDraft(draft));

export const readParts = (draft: Draft): DraftParts => {
  const info = readDraft(draft);
  return {
    column: info.column,
    operator: info.operator,
    values: getValues(info),
    valuesPart: info.valuesPart,
  };
};

export const getDraftRange = (draft: Draft) => ({
  from: draft.pos,
  to: draft.pos + draft.node.nodeSize,
});

export const findPartStep = ($position: ResolvedPos) => {
  const draft = findDraftAt($position);
  if (!draft) {
    return {
      range: { from: $position.pos, to: $position.pos },
      query: "",
      text: "",
    };
  }
  const { step, edited, text } = readDraft(draft);
  if (step === "value") {
    return null;
  }
  const to = edited ? getInputRange(draft).to + 1 : getDraftRange(draft).to;
  return { range: { from: draft.pos, to }, query: text, text };
};

export const getCaretInput = (editor: Editor) => {
  const { selection } = editor.state;
  const draft = findDraftAt(selection.$from);
  const inputs = draft ? getInputs(draft) : [];
  const index = inputs.findIndex(
    ({ from, to }) => selection.from >= from && selection.from <= to,
  );
  const input = inputs[index];
  if (!draft || !selection.empty || !input) {
    return null;
  }
  return {
    draft,
    inputs,
    index,
    isAtStart: selection.from === input.from,
    isAtEnd: selection.from === input.to,
    isFirst: index === 0,
    isLast: index === inputs.length - 1,
  };
};
