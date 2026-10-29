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
import type { PillItem } from "./query-sync";
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

/** Like `replaceText`, but the new text is selected, so typing replaces it. */
export function replaceTextSelected(
  view: EditorView,
  from: number,
  to: number,
  text: string,
  { addToHistory = true }: { addToHistory?: boolean } = {},
) {
  const tr = view.state.tr.insertText(text, from, to);
  tr.setSelection(TextSelection.create(tr.doc, from, from + text.length));
  if (!addToHistory) {
    tr.setMeta("addToHistory", false);
  }
  view.dispatch(tr);
}

/**
 * Version B: starts a new filter at `pos` with the first field filled in and
 * selected, so the popover shows the fields and typing searches them.
 */
export function startNewFilter(
  view: EditorView,
  pos: number,
  schema: FilterSchema,
) {
  const [firstField] = schema.fields;
  if (firstField == null) {
    return;
  }
  const prev = view.state.doc.textBetween(Math.max(1, pos - 1), pos);
  const pad = prev && !/[\s(]/.test(prev) ? " " : "";
  if (pad) {
    view.dispatch(view.state.tr.insertText(pad, pos));
  }
  replaceTextSelected(
    view,
    pos + pad.length,
    pos + pad.length,
    firstField.text,
  );
}

/**
 * Removes the drafts that are only a field name, like a pre-filled field the
 * user left without finishing the filter.
 */
export function removeLoneFieldDrafts(
  view: EditorView,
  { schema, knownValues }: ActionContext,
) {
  const tr = view.state.tr;
  draftsIn(view.state.doc, schema, knownValues)
    .reverse()
    .forEach((draft) => {
      const parsed = parseDraft(draft.text, schema, knownValues);
      if (parsed.field != null && parsed.fieldEnd === draft.text.length) {
        tr.delete(draft.start, draft.end);
      }
    });
  if (tr.docChanged) {
    view.dispatch(tr);
  }
}

/**
 * Replaces the node at `pos`, like an AI pill, with pills joined by "and",
 * in parentheses when there are several.
 */
export function replaceWithPillItems(
  view: EditorView,
  pos: number,
  items: PillItem[],
) {
  const node = view.state.doc.nodeAt(pos);
  if (node == null || items.length === 0) {
    return;
  }
  const { schema: pmSchema } = view.state;
  const pills = items.map((item) =>
    "attrs" in item
      ? pmSchema.nodes.filterPill.create(item.attrs)
      : pmSchema.nodes.clausePill.create({ clauseId: item.clauseId }),
  );
  // Version B: an implicit AND joins the pills. It binds tighter than OR, so
  // they stay one group without parentheses.
  const nodes = pills.flatMap((pill, index) =>
    index > 0 ? [pmSchema.text(" "), pill] : [pill],
  );
  replaceWithNodes(view, pos, pos + node.nodeSize, nodes);
}

/**
 * Version B: after the user types a connector, like "and " or "(", a new
 * filter starts at the caret with the first field filled in.
 */
export function startFilterAfterConnector(
  view: EditorView,
  { schema, knownValues }: ActionContext,
) {
  const { selection, doc } = view.state;
  if (!selection.empty) {
    return;
  }
  const caret = selection.from;
  const draft = draftAt(doc, caret, schema, knownValues);
  const textBefore = doc.textBetween(Math.max(1, caret - 4), caret);
  const isAfterConnector = /(?:\b(?:and|or) |\()$/i.test(textBefore);
  if (draft.text.length === 0 && isAfterConnector) {
    startNewFilter(view, caret, schema);
  }
}

/**
 * Version B: removes an "and" or "or" left at the start of the bar, like after
 * the first filter is removed, since it joins nothing.
 */
export function removeLeadingConnector(view: EditorView) {
  const firstNode = view.state.doc.firstChild?.firstChild;
  const text = firstNode?.isText ? (firstNode.text ?? "") : "";
  // The space after it tells a connector from a word being typed, like "Or…".
  const match = /^\s*(?:and|or)\s+/i.exec(text);
  if (match != null) {
    view.dispatch(view.state.tr.delete(1, 1 + match[0].length));
  }
}
