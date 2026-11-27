import {
  type Editor,
  type JSONContent,
  type Range,
  findChildren,
} from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { P, match } from "ts-pattern";

import {
  type PillToken,
  type Token,
  type TokenStages,
  applyImplicitAnds,
  isConnectorToken,
  isPillToken,
  isSameStages,
  join,
  normalizeTokens,
} from "../model";

import {
  connectorContent,
  getConnectorToken,
  getEditedPill,
  getPillToken,
  getStage,
  pillContent,
  thenContent,
} from "./nodes/nodes";
import {
  isConnectorNode,
  isDraftNode,
  isPillNode,
  isThenNode,
} from "./nodes/types";
type DocumentToken<F> = { token: Token<F>; pos: number };

const tokenToNode = <F>(token: Token<F>, stage: number): JSONContent =>
  match(token)
    .with(P.when(isPillToken), (pill) => pillContent(pill, stage))
    .with(P.when(isConnectorToken), connectorContent)
    .exhaustive();

export const tokensToContent = <F>(stages: TokenStages<F>): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: join(
        stages.map((tokens, stage) =>
          tokens.map((token) => tokenToNode(token, stage)),
        ),
        thenContent,
      ),
    },
  ],
});

const nodeToToken = <F>(node: PmNode): Token<F> | null =>
  match(node)
    .with(P.when(isPillNode), () => getPillToken<F>(node))
    .with(P.when(isDraftNode), () => getEditedPill<F>(node)?.token ?? null)
    .with(P.when(isConnectorNode), () => getConnectorToken(node))
    .otherwise(() => null);

export const documentToTokensWithPositions = <F>(
  doc: PmNode,
): DocumentToken<F>[][] => {
  const stages: DocumentToken<F>[][] = [[]];
  doc.descendants((node, pos) => {
    const token = nodeToToken<F>(node);
    if (isThenNode(node)) {
      stages.push([]);
    } else if (token) {
      stages.at(-1)?.push({ token, pos });
    }
  });
  return stages;
};

export const documentToTokens = <F>(doc: PmNode): TokenStages<F> =>
  documentToTokensWithPositions<F>(doc).map((items) =>
    items.map(({ token }) => token),
  );

export const getStageAt = (doc: PmNode, pos: number) =>
  findChildren(doc, isThenNode).filter((then) => then.pos < pos).length;

const findStageEnd = (doc: PmNode, stage: number) => {
  const thens = findChildren(doc, isThenNode).map(({ node, pos }) => ({
    stage: getStage(node),
    pos,
  }));
  const next = thens.find((then) => then.stage > stage);
  const lastStage = thens.at(-1)?.stage ?? 0;
  const missingStages = Array.from(
    { length: Math.max(0, stage - lastStage) },
    (_, index) => lastStage + 1 + index,
  );
  return {
    pos: next ? next.pos : doc.content.size - 1,
    missingStages: next ? [] : missingStages,
  };
};

export const placePill = <F>(
  editor: Editor,
  range: { from: number; to: number },
  token: PillToken<F>,
  stage: number,
) => {
  const { state } = editor;
  const pill = pillContent(token, stage);
  const transaction = state.tr.delete(range.from, range.to);
  const isCaretStage = getStageAt(transaction.doc, range.from) === stage;
  const target = isCaretStage
    ? { pos: range.from, missingStages: [] }
    : findStageEnd(transaction.doc, stage);
  const nodes = [...target.missingStages.map(thenContent), pill].map((json) =>
    state.schema.nodeFromJSON(json),
  );
  transaction.insert(target.pos, nodes);
  const size = nodes.reduce((total, node) => total + node.nodeSize, 0);
  editor.view.dispatch(
    transaction.setSelection(
      TextSelection.create(transaction.doc, target.pos + size),
    ),
  );
  return true;
};

const getPillRangeAt = (editor: Editor, pos: number): Range => {
  const node = editor.state.doc.nodeAt(pos);
  return { from: pos, to: isPillNode(node) ? pos + node.nodeSize : pos };
};

export const hasLooseContent = (doc: PmNode) =>
  findChildren(doc, (node) => node.isText || isDraftNode(node)).length > 0;

export const replacePillTokens = <F>(editor: Editor, next: TokenStages<F>) => {
  const pills = documentToTokensWithPositions<F>(editor.state.doc)
    .flat()
    .filter(({ token }) => isPillToken(token));
  const nextPills = next.flat().filter(isPillToken);
  const transaction = editor.state.tr.setMeta("addToHistory", false);
  pills.forEach(({ token, pos }, index) => {
    const replacement = nextPills[index];
    const node = transaction.doc.nodeAt(pos);
    const isSameFilter =
      isPillToken(token) && token.filter === replacement?.filter;
    if (!replacement || isSameFilter || !node) {
      return;
    }
    const attr = isDraftNode(node) ? "pill" : "token";
    transaction.setNodeAttribute(pos, attr, replacement);
  });
  if (transaction.docChanged) {
    editor.view.dispatch(transaction);
  }
};

export const readTokens = <F>(editor: Editor) =>
  applyImplicitAnds(documentToTokens<F>(editor.state.doc));

export const replaceDocument = <F>(
  editor: Editor,
  tokens: TokenStages<F>,
  { emitUpdate = true }: { emitUpdate?: boolean } = {},
) => {
  editor.commands.setContent(tokensToContent(tokens), {
    emitUpdate,
  });
};

export const normalizeDocument = <F>(editor: Editor) => {
  const tokens = documentToTokens<F>(editor.state.doc);
  const normalized = normalizeTokens(tokens);
  const isNormalized =
    isSameStages(normalized, tokens) && !hasLooseContent(editor.state.doc);
  if (!isNormalized) {
    replaceDocument(editor, normalized);
  }
};

const getRangeRect = (editor: Editor, range: Range) => {
  const dom = editor.view.nodeDOM(range.from);
  if (dom instanceof Element && range.to > range.from) {
    return dom.getBoundingClientRect();
  }
  const { top, bottom, left } = editor.view.coordsAtPos(range.from);
  return new DOMRect(left, top, 0, bottom - top);
};

export const getPillRectAt = (editor: Editor, pos: number) =>
  getRangeRect(editor, getPillRangeAt(editor, pos));

export const placePillAt = <F>(
  editor: Editor,
  pos: number,
  token: PillToken<F>,
  stage: number,
) => placePill(editor, getPillRangeAt(editor, pos), token, stage);
