import { type Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const ERROR_KEY = new PluginKey<DecorationSet>("filterBarErrors");
const ERROR_SPEC = { isError: true };

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

export const setErrorPositions = (editor: Editor, positions: number[]) => {
  editor.view.dispatch(editor.state.tr.setMeta(ERROR_KEY, positions));
};

export const hasErrorDecoration = (decorations: readonly Decoration[]) =>
  decorations.some((decoration) => decoration.spec === ERROR_SPEC);
