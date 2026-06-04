import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { t } from "ttag";

import S from "./DocumentDiff.module.css";

export const DIFF_INSERTION_MARK = "diffInsertion";
export const DIFF_DELETION_MARK = "diffDeletion";

// Marks carry the `changeId` they belong to so the controls plugin can group a
// removed run and its replacement together (see `diffBlocks`).
const changeIdAttribute = {
  changeId: {
    default: null as number | null,
    parseHTML: (el: HTMLElement) => {
      const raw = el.getAttribute("data-change-id");
      return raw == null ? null : Number(raw);
    },
    renderHTML: (attrs: { changeId: number | null }) =>
      attrs.changeId == null
        ? {}
        : { "data-change-id": String(attrs.changeId) },
  },
};

const DiffInsertion = Mark.create({
  name: DIFF_INSERTION_MARK,
  addAttributes: () => changeIdAttribute,
  parseHTML: () => [{ tag: "span[data-diff='insertion']" }],
  renderHTML: ({ HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, {
      "data-diff": "insertion",
      class: S.added,
    }),
    0,
  ],
});

const DiffDeletion = Mark.create({
  name: DIFF_DELETION_MARK,
  addAttributes: () => changeIdAttribute,
  parseHTML: () => [{ tag: "span[data-diff='deletion']" }],
  renderHTML: ({ HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, {
      "data-diff": "deletion",
      class: S.removed,
    }),
    0,
  ],
});

export interface DocumentDiffOptions {
  /** Invoked when the user accepts (`true`) or rejects (`false`) a change. */
  onResolveChange?: (changeId: number, accept: boolean) => void;
}

const controlsKey = new PluginKey("documentDiffControls");

function renderControls(
  changeId: number,
  onResolveChange?: (changeId: number, accept: boolean) => void,
): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = S.controls;
  wrapper.contentEditable = "false";

  const makeButton = (label: string, title: string, accept: boolean) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = accept ? S.accept : S.reject;
    button.textContent = label;
    button.title = title;
    // mousedown + preventDefault so clicking doesn't move the editor selection.
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      onResolveChange?.(changeId, accept);
    });
    return button;
  };

  wrapper.append(
    makeButton("✓", t`Accept change`, true),
    makeButton("✕", t`Reject change`, false),
  );
  return wrapper;
}

/**
 * Tracked-changes diff for the Metabot document canvas. Registers two inline
 * marks (insertion / deletion) for the visual diff and a plugin that drops a
 * per-change ✓/✗ control at the start of each change. Resolving a change is
 * delegated to `options.onResolveChange`, which the canvas uses to rebuild the
 * document.
 */
export const DocumentDiff = Extension.create<DocumentDiffOptions>({
  name: "documentDiff",

  addOptions() {
    return { onResolveChange: undefined };
  },

  addExtensions() {
    return [DiffInsertion, DiffDeletion];
  },

  addProseMirrorPlugins() {
    const extension = this;
    return [
      new Plugin({
        key: controlsKey,
        props: {
          decorations(state) {
            const firstPosByChange = new Map<number, number>();
            state.doc.descendants((node, pos) => {
              if (!node.isText) {
                return;
              }
              for (const mark of node.marks) {
                const isDiffMark =
                  mark.type.name === DIFF_INSERTION_MARK ||
                  mark.type.name === DIFF_DELETION_MARK;
                const changeId = mark.attrs.changeId;
                if (
                  isDiffMark &&
                  changeId != null &&
                  !firstPosByChange.has(changeId)
                ) {
                  firstPosByChange.set(changeId, pos);
                }
              }
            });

            const decorations = Array.from(firstPosByChange.entries()).map(
              ([changeId, pos]) =>
                Decoration.widget(
                  pos,
                  () =>
                    renderControls(changeId, extension.options.onResolveChange),
                  { side: -1, key: `diff-change-${changeId}` },
                ),
            );
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
