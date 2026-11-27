import type { Node as PmNode } from "@tiptap/pm/model";

import type { TokenType } from "../../model";

// `then` and `draft` are not tokens: in the document `then` parts the stages,
// and `draft` is a filter being typed.
export type NodeName =
  | TokenType
  | "then"
  | "draft"
  | "draftInput"
  | "column"
  | "operator"
  | "value"
  | "rangeAnd";

type MaybeNode = PmNode | null | undefined;

export type PillNode = PmNode & { type: { name: "pill" } };
export type AndNode = PmNode & { type: { name: "and" } };
export type OrNode = PmNode & { type: { name: "or" } };
export type OpenNode = PmNode & { type: { name: "open" } };
export type CloseNode = PmNode & { type: { name: "close" } };
export type ThenNode = PmNode & { type: { name: "then" } };
export type DraftNode = PmNode & { type: { name: "draft" } };
export type DraftInputNode = PmNode & { type: { name: "draftInput" } };
export type ColumnNode = PmNode & { type: { name: "column" } };
export type OperatorNode = PmNode & { type: { name: "operator" } };
export type ValueNode = PmNode & { type: { name: "value" } };

export const isPillNode = (node: MaybeNode): node is PillNode =>
  node?.type.name === "pill";

export const isAndNode = (node: MaybeNode): node is AndNode =>
  node?.type.name === "and";

export const isOrNode = (node: MaybeNode): node is OrNode =>
  node?.type.name === "or";

export const isOpenNode = (node: MaybeNode): node is OpenNode =>
  node?.type.name === "open";

export const isCloseNode = (node: MaybeNode): node is CloseNode =>
  node?.type.name === "close";

export const isThenNode = (node: MaybeNode): node is ThenNode =>
  node?.type.name === "then";

export const isDraftNode = (node: MaybeNode): node is DraftNode =>
  node?.type.name === "draft";

export const isDraftInputNode = (node: MaybeNode): node is DraftInputNode =>
  node?.type.name === "draftInput";

export const isColumnNode = (node: MaybeNode): node is ColumnNode =>
  node?.type.name === "column";

export const isOperatorNode = (node: MaybeNode): node is OperatorNode =>
  node?.type.name === "operator";

export const isValueNode = (node: MaybeNode): node is ValueNode =>
  node?.type.name === "value";

export const isBoolOpNode = (node: MaybeNode): node is AndNode | OrNode =>
  isAndNode(node) || isOrNode(node);
