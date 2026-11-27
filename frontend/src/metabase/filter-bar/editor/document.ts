import {
  type Editor,
  type JSONContent,
  type Range,
  findChildren,
} from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import type { NodeViewProps } from "@tiptap/react";
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

const tokenToNode = <F>(token: Token<F>): JSONContent =>
  match(token)
    .with(P.when(isPillToken), pillContent)
    .with(P.when(isConnectorToken), connectorContent)
    .exhaustive();

export const tokensToContent = <F>(stages: TokenStages<F>): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: join(
        stages.map((tokens) => tokens.map(tokenToNode)),
        thenContent,
      ),
    },
  ],
});

const nodeToToken = <F>(node: PmNode): Token<F> | null =>
  match(node)
    .with(P.when(isPillNode), () => getPillToken<F>(node))
    .with(P.when(isDraftNode), () => getEditedPill<F>(node))
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

export const getNodeViewStage = ({
  editor,
  getPos,
}: Pick<NodeViewProps, "editor" | "getPos">) =>
  getStageAt(editor.state.doc, getPos() ?? 0);

const findStageEnd = (doc: PmNode, stage: number) => {
  const thens = findChildren(doc, isThenNode);
  const next = thens.at(stage);
  return next
    ? { pos: next.pos, missingThens: 0 }
    : { pos: doc.content.size - 1, missingThens: stage - thens.length };
};

export const insertAtStage = (
  transaction: Transaction,
  range: Range,
  node: PmNode,
  targetStage: number,
) => {
  transaction.delete(range.from, range.to);
  const isCaretStage = getStageAt(transaction.doc, range.from) === targetStage;
  const target = isCaretStage
    ? { pos: range.from, missingThens: 0 }
    : findStageEnd(transaction.doc, targetStage);
  const { schema } = transaction.doc.type;
  const thens = Array.from({ length: target.missingThens }, () =>
    schema.nodeFromJSON(thenContent()),
  );
  transaction.insert(target.pos, [...thens, node]);
  return target.pos + thens.reduce((size, then) => size + then.nodeSize, 0);
};

export const placePill = <F>(
  editor: Editor,
  range: Range,
  token: PillToken<F>,
  targetStage: number,
) => {
  const { state } = editor;
  const pill = state.schema.nodeFromJSON(pillContent(token));
  const transaction = state.tr;
  const pos = insertAtStage(transaction, range, pill, targetStage);
  editor.view.dispatch(
    transaction.setSelection(
      TextSelection.create(transaction.doc, pos + pill.nodeSize),
    ),
  );
  return true;
};

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

const hasLooseContent = (doc: PmNode) =>
  findChildren(doc, (node) => node.isText || isDraftNode(node)).length > 0;

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

const getPillRangeAt = (editor: Editor, pos: number): Range => {
  const node = editor.state.doc.nodeAt(pos);
  return { from: pos, to: isPillNode(node) ? pos + node.nodeSize : pos };
};

export const getPillRectAt = (editor: Editor, pos: number) =>
  getRangeRect(editor, getPillRangeAt(editor, pos));

export const placePillAt = <F>(
  editor: Editor,
  pos: number,
  token: PillToken<F>,
  targetStage: number,
) => placePill(editor, getPillRangeAt(editor, pos), token, targetStage);
