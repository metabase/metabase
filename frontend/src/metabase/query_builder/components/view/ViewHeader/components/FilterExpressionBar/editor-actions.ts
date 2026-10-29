import type { JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import {
  type Draft,
  type KnownValues,
  type PMNode,
  attrsOf,
  draftAt,
  draftsIn,
  parseDraft,
} from "./parser";
import type { FilterSchema } from "./schema";

export type ActionContext = {
  schema: FilterSchema;
  knownValues: KnownValues;
};

/** Replaces a range with nodes, makes sure a space follows, and puts the caret after it. */
export function replaceWithNodes(
  view: EditorView,
  from: number,
  to: number,
  nodes: PMNode[],
) {
  const tr = view.state.tr.replaceWith(from, to, nodes);
  const after = from + nodes.reduce((size, node) => size + node.nodeSize, 0);
  const nextChar = tr.doc.textBetween(
    after,
    Math.min(after + 1, tr.doc.content.size - 1),
  );
  if (nextChar !== " ") {
    tr.insertText(" ", after);
  }
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  view.dispatch(tr);
}

export function replaceWithNode(
  view: EditorView,
  from: number,
  to: number,
  node: PMNode,
) {
  replaceWithNodes(view, from, to, [node]);
}

/** Inline nodes from JSON, like the pills that an AI answer turns into. */
export function nodesFromJson(view: EditorView, content: JSONContent[]) {
  return content.map((json) => view.state.schema.nodeFromJSON(json));
}

export function replaceText(
  view: EditorView,
  from: number,
  to: number,
  text: string,
  { addToHistory = true }: { addToHistory?: boolean } = {},
) {
  const tr = view.state.tr.insertText(text, from, to);
  tr.setSelection(TextSelection.create(tr.doc, from + text.length));
  if (!addToHistory) {
    tr.setMeta("addToHistory", false);
  }
  view.dispatch(tr);
}

/** Turns a complete draft into a pill. Returns false when it isn't complete. */
export function commitDraft(
  view: EditorView,
  draft: Draft,
  { schema, knownValues }: ActionContext,
) {
  const attrs = attrsOf(parseDraft(draft.text, schema, knownValues));
  if (attrs == null) {
    return false;
  }
  replaceWithNode(
    view,
    draft.from,
    draft.to,
    view.state.schema.nodes.filterPill.create(attrs),
  );
  return true;
}

/** Commits the draft at the caret, when it is complete. */
export function settle(view: EditorView, context: ActionContext) {
  const { state } = view;
  const draft = draftAt(
    state.doc,
    state.selection.from,
    context.schema,
    context.knownValues,
  );
  return commitDraft(view, draft, context);
}

/**
 * Turns every complete draft into a pill, except the one with the caret,
 * unless `all` is set, like when the bar loses focus.
 */
export function autoCommit(
  view: EditorView,
  all: boolean,
  { schema, knownValues }: ActionContext,
) {
  if (view.composing) {
    return;
  }
  const { state } = view;
  const caret = state.selection.empty ? state.selection.from : -1;
  const tr = state.tr;
  draftsIn(state.doc, schema, knownValues)
    .reverse()
    .forEach((draft) => {
      if (!all && draft.start <= caret && caret <= draft.end) {
        return;
      }
      const attrs = attrsOf(parseDraft(draft.text, schema, knownValues));
      if (attrs != null) {
        tr.replaceWith(
          draft.from,
          draft.to,
          state.schema.nodes.filterPill.create(attrs),
        );
      }
    });
  if (tr.docChanged) {
    view.dispatch(tr);
  }
}

/** The position of the AI pill with an id, which may have moved. */
export function findAiPill(view: EditorView, aiId: string) {
  let found: { pos: number; node: PMNode } | undefined;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "aiPill" && node.attrs.aiId === aiId) {
      found = { pos, node };
    }
  });
  return found;
}

/** Sets attributes of a node without an undo step, like an AI answer. */
export function setNodeAttrsSilently(
  view: EditorView,
  pos: number,
  attrs: Record<string, unknown>,
) {
  const node = view.state.doc.nodeAt(pos);
  if (node == null) {
    return;
  }
  const tr = view.state.tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    ...attrs,
  });
  view.dispatch(tr.setMeta("addToHistory", false));
}

/** Replaces a pill with its text, with the caret at the end, to edit it as text. */
export function unwrapNode(view: EditorView, pos: number, text: string) {
  const node = view.state.doc.nodeAt(pos);
  if (node == null) {
    return;
  }
  replaceText(view, pos, pos + node.nodeSize, text);
  view.focus();
}

/** Puts the caret right after the node at `pos`. */
export function focusAfter(view: EditorView, pos: number) {
  const node = view.state.doc.nodeAt(pos);
  const tr = view.state.tr.setSelection(
    TextSelection.create(view.state.doc, pos + (node?.nodeSize ?? 0)),
  );
  view.dispatch(tr);
  view.focus();
}
