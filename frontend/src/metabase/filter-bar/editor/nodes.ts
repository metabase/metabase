import { type JSONContent, Node, type NodeConfig } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";

import type { ConnectorToken, ParenToken, TokenType } from "../model/types";

// `then` is not a token: in the document it parts the stages.
type NodeName = TokenType | "then";

const ATOM: Partial<NodeConfig> = {
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  // A stub: the real views are added in components/FilterBar/extensions.tsx,
  // but tiptap still calls this in some cases (e.g. when EditorContent
  // unmounts) and throws without it.
  renderHTML: () => ["span"],
};

const createAtom = (type: NodeName, config: Partial<NodeConfig> = {}) =>
  Node.create({ ...ATOM, ...config, name: type });

export const createPillNode = () =>
  createAtom("pill", { addAttributes: () => ({ id: {}, stage: {} }) });

export const createConnectorNode = (type: ConnectorToken["type"]) =>
  createAtom(type);

export const createParenNode = (type: ParenToken["type"]) => createAtom(type);

export const createThenNode = () =>
  createAtom("then", {
    selectable: false,
    addAttributes: () => ({ stage: {} }),
  });

export const pillContent = (id: string, stage: number): JSONContent => ({
  type: "pill",
  attrs: { id, stage },
});

export const connectorContent = (
  type: ConnectorToken["type"],
): JSONContent => ({
  type,
});

export const parenContent = (type: ParenToken["type"]): JSONContent => ({
  type,
});

export const thenContent = (stage: number): JSONContent => ({
  type: "then",
  attrs: { stage },
});

type MaybeNode = PmNode | null | undefined;

export type PillNode = PmNode & { type: { name: "pill" } };
export type AndNode = PmNode & { type: { name: "and" } };
export type OrNode = PmNode & { type: { name: "or" } };
export type OpenNode = PmNode & { type: { name: "open" } };
export type CloseNode = PmNode & { type: { name: "close" } };
export type ThenNode = PmNode & { type: { name: "then" } };

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

export const isConnectorNode = (node: MaybeNode): node is AndNode | OrNode =>
  isAndNode(node) || isOrNode(node);

export const getPillId = (node: PmNode) => {
  const value: unknown = node.attrs.id;
  return typeof value === "string" ? value : "";
};

export const getStage = (node: PmNode) => {
  const value: unknown = node.attrs.stage;
  return typeof value === "number" ? value : 0;
};
