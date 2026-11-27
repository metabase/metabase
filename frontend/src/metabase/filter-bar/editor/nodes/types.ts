import type { Node as PmNode } from "@tiptap/pm/model";

import type { ConnectorToken } from "../../model";

import { getConnectorToken } from "./nodes";

// `then` and `draft` are not tokens: in the document `then` parts the stages,
// and `draft` is a filter being typed.
export type NodeName =
  | "pill"
  | "connector"
  | "then"
  | "draft"
  | "draftInput"
  | "column"
  | "operator"
  | "value"
  | "rangeAnd";

type MaybeNode = PmNode | null | undefined;

export type PillNode = PmNode & { type: { name: "pill" } };
export type ConnectorNode = PmNode & { type: { name: "connector" } };
export type ThenNode = PmNode & { type: { name: "then" } };
export type DraftNode = PmNode & { type: { name: "draft" } };
export type DraftInputNode = PmNode & { type: { name: "draftInput" } };
export type ColumnNode = PmNode & { type: { name: "column" } };
export type OperatorNode = PmNode & { type: { name: "operator" } };
export type ValueNode = PmNode & { type: { name: "value" } };

export const isPillNode = (node: MaybeNode): node is PillNode =>
  node?.type.name === "pill";

export const isConnectorNode = (node: MaybeNode): node is ConnectorNode =>
  node?.type.name === "connector";

const isConnectorNodeOf =
  (types: readonly ConnectorToken["type"][]) =>
  (node: MaybeNode): node is ConnectorNode => {
    const token = isConnectorNode(node) ? getConnectorToken(node) : null;
    return token !== null && types.includes(token.type);
  };

export const isAndNode = isConnectorNodeOf(["and"]);

export const isOrNode = isConnectorNodeOf(["or"]);

export const isOpenNode = isConnectorNodeOf(["open"]);

export const isCloseNode = isConnectorNodeOf(["close"]);

export const isBoolOpNode = isConnectorNodeOf(["and", "or"]);

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
