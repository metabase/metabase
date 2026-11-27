import { type JSONContent, Node, type NodeConfig } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";

import type { BoolOpToken, ParenToken, PillToken } from "../../model";
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

const createAtom = (type: NodeName, config: Partial<NodeConfig> = {}) =>
  Node.create({ ...ATOM, ...config, name: type });

export const createPillNode = () =>
  createAtom("pill", {
    addAttributes: () => ({
      token: { default: null, rendered: false },
      stage: {},
    }),
  });

export const createBoolOpNode = (type: BoolOpToken["type"]) => createAtom(type);

export const createParenNode = (type: ParenToken["type"]) => createAtom(type);

export const createThenNode = () =>
  createAtom("then", {
    selectable: false,
    addAttributes: () => ({ stage: {} }),
  });

export const createDraftNode = () =>
  Node.create({
    name: "draft",
    group: "inline",
    inline: true,
    content: "(draftPart | draftInput)+",
    selectable: false,
    addAttributes: () => ({
      pill: { default: null, rendered: false },
      pillStage: { default: null },
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

export const pillContent = <F>(
  token: PillToken<F>,
  stage: number,
): JSONContent => ({
  type: "pill",
  attrs: { token, stage },
});

export const boolOpContent = (type: BoolOpToken["type"]): JSONContent => ({
  type,
});

export const parenContent = (type: ParenToken["type"]): JSONContent => ({
  type,
});

export const thenContent = (stage: number): JSONContent => ({
  type: "then",
  attrs: { stage },
});

export const getStage = (node: PmNode) => {
  const value: unknown = node.attrs.stage;
  return typeof value === "number" ? value : 0;
};

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

export const getPillToken = <F>(pill: PmNode): PillToken<F> | null => {
  const value: unknown = pill.attrs.token;
  return isPillTokenValue<F>(value) ? value : null;
};

export const getEditedPill = <F>(draft: PmNode) => {
  const token: unknown = draft.attrs.pill;
  const stage: unknown = draft.attrs.pillStage;
  return isPillTokenValue<F>(token) && typeof stage === "number"
    ? { token, stage }
    : null;
};
