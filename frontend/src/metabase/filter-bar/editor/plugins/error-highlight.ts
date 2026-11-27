import { type Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { type ParseError, tokensToTrees } from "../../model";
import { documentToTokens, documentToTokensWithPositions } from "../document";

const ERROR_KEY = new PluginKey<DecorationSet>("filterBarErrors");
const ERROR_SPEC = Symbol("filter-bar-error");

const isPositions = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === "number");

export const createErrorHighlight = () =>
  Extension.create({
    name: "errorHighlight",
    addProseMirrorPlugins: () => [
      new Plugin<DecorationSet>({
        key: ERROR_KEY,
        state: {
          init: () => DecorationSet.empty,
          apply: (transaction, decorations) => {
            const positions: unknown = transaction.getMeta(ERROR_KEY);
            if (!isPositions(positions)) {
              return decorations.map(transaction.mapping, transaction.doc);
            }
            return DecorationSet.create(
              transaction.doc,
              positions.flatMap((pos) => {
                const node = transaction.doc.nodeAt(pos);
                return node
                  ? [Decoration.node(pos, pos + node.nodeSize, {}, ERROR_SPEC)]
                  : [];
              }),
            );
          },
        },
        props: {
          decorations: (state) => ERROR_KEY.getState(state),
        },
      }),
    ],
  });

const highlightNodesAt = (editor: Editor, positions: number[]) => {
  editor.view.dispatch(editor.state.tr.setMeta(ERROR_KEY, positions));
};

export const hasErrorDecoration = (decorations: readonly Decoration[]) =>
  decorations.some((decoration) => decoration.spec === ERROR_SPEC);

export const clearErrors = (editor: Editor) => highlightNodesAt(editor, []);

export const highlightErrors = (editor: Editor): ParseError | null => {
  const result = tokensToTrees(documentToTokens(editor.state.doc));
  const items = documentToTokensWithPositions(editor.state.doc);
  const error = result.type === "error" ? result : null;
  const positions =
    error?.indexes.flatMap((index) => {
      const item = items[error.stageIndex]?.[index];
      return item ? [item.pos] : [];
    }) ?? [];
  highlightNodesAt(editor, positions);
  return error;
};
