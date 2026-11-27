import { type JSONContent, Node, type NodeConfig } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import type { Node as PmNode } from "@tiptap/pm/model";

import type { ConnectorToken, PillToken } from "../../model";
import type {
  ColumnPart,
  DraftPart,
  OperatorPart,
  ValuesPart,
} from "../draft/types";

import type { NodeName } from "./types";

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

export const createDocumentNode = () => Document.extend({ content: "inline*" });

const createAtom = (type: NodeName, config: Partial<NodeConfig> = {}) =>
  Node.create({ ...ATOM, ...config, name: type });

export const createPillNode = () =>
  createAtom("pill", {
    addAttributes: () => ({
      token: { default: null, rendered: false },
    }),
  });

export const createConnectorNode = () =>
  createAtom("connector", {
    addAttributes: () => ({
      token: { default: null, rendered: false },
    }),
  });

export const createThenNode = () => createAtom("then", { selectable: false });

export const createDraftNode = () =>
  Node.create({
    name: "draft",
    group: "inline",
    inline: true,
    content: "(draftPart | draftInput)+",
    selectable: false,
    addAttributes: () => ({
      pill: { default: null, rendered: false },
    }),
    renderHTML: () => ["span", 0],
  });

export const createDraftInputNode = () =>
  Node.create({
    name: "draftInput",
    inline: true,
    content: "text*",
    selectable: false,
    addAttributes: () => ({ part: { default: null, rendered: false } }),
    renderHTML: () => ["span", 0],
  });

export const createColumnNode = () =>
  createAtom("column", {
    group: "draftPart",
    selectable: false,
    addAttributes: () => ({ part: { default: null, rendered: false } }),
  });

export const createOperatorNode = () =>
  createAtom("operator", {
    group: "draftPart",
    selectable: false,
    addAttributes: () => ({ part: { default: null, rendered: false } }),
  });

export const createValueNode = () =>
  createAtom("value", {
    group: "draftPart",
    selectable: false,
    addAttributes: () => ({ part: { default: null, rendered: false } }),
  });

export const createRangeAndNode = () =>
  createAtom("rangeAnd", { group: "draftPart", selectable: false });

export const rangeAndContent = (): JSONContent => ({ type: "rangeAnd" });

export const valueContent = (part: ValuesPart): JSONContent => ({
  type: "value",
  attrs: { part },
});

export const columnContent = (part: ColumnPart): JSONContent => ({
  type: "column",
  attrs: { part },
});

export const operatorContent = (part: OperatorPart): JSONContent => ({
  type: "operator",
  attrs: { part },
});

export const pillContent = <F>(token: PillToken<F>): JSONContent => ({
  type: "pill",
  attrs: { token },
});

export const connectorContent = (token: ConnectorToken): JSONContent => ({
  type: "connector",
  attrs: { token },
});

export const thenContent = (): JSONContent => ({ type: "then" });

const DRAFT_PART_TYPES = ["column", "operator", "values"];

const isDraftPart = (value: unknown): value is DraftPart =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  DRAFT_PART_TYPES.some((type) => type === value.type);

export const getDraftPart = (node: PmNode) => {
  const value: unknown = node.attrs.part;
  return isDraftPart(value) ? value : null;
};

const isPillTokenValue = <F>(value: unknown): value is PillToken<F> =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  value.type === "pill";

const CONNECTOR_TYPES = ["and", "or", "open", "close"];

const isConnectorTokenValue = (value: unknown): value is ConnectorToken =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  CONNECTOR_TYPES.some((type) => type === value.type);

export const getConnectorToken = (node: PmNode): ConnectorToken | null => {
  const value: unknown = node.attrs.token;
  return isConnectorTokenValue(value) ? value : null;
};

export const getPillToken = <F>(pill: PmNode): PillToken<F> | null => {
  const value: unknown = pill.attrs.token;
  return isPillTokenValue<F>(value) ? value : null;
};

export const getEditedPill = <F>(draft: PmNode): PillToken<F> | null => {
  const value: unknown = draft.attrs.pill;
  return isPillTokenValue<F>(value) ? value : null;
};
