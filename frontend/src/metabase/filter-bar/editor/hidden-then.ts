import { Extension } from "@tiptap/core";
import { type EditorState, Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { isPillNode, isThenNode } from "./nodes";

const createHiddenThenDecorations = ({ doc }: EditorState) => {
  const thens: { from: number; to: number; pillsBefore: number }[] = [];
  let pillCount = 0;
  doc.descendants((node, pos) => {
    if (isThenNode(node)) {
      thens.push({
        from: pos,
        to: pos + node.nodeSize,
        pillsBefore: pillCount,
      });
    }
    if (isPillNode(node)) {
      pillCount += 1;
    }
  });
  const decorations = thens
    .filter(({ pillsBefore }, index) => {
      const pillsBeforeNextThen = thens[index + 1]?.pillsBefore ?? pillCount;
      const hasPillInStage = pillsBeforeNextThen > pillsBefore;
      return pillsBefore === 0 || !hasPillInStage;
    })
    .map(({ from, to }) =>
      Decoration.node(from, to, { "data-hidden": "true" }),
    );
  return DecorationSet.create(doc, decorations);
};

/**
 * Every stage starts with a `then` node, even an empty one, so the caret can
 * get into it: before the `then` is the previous stage, after it is its own.
 *
 * The word "then" is only drawn when there are filters on both sides of it;
 * otherwise the node is there but takes no width.
 */
export const createHiddenThen = () =>
  Extension.create({
    name: "hiddenThen",
    addProseMirrorPlugins: () => [
      new Plugin({
        props: {
          decorations: createHiddenThenDecorations,
        },
      }),
    ],
  });
