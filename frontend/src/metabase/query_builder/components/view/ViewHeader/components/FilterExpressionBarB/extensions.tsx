import { Extension, Node, mergeAttributes } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import { history, redo, undo } from "@tiptap/pm/history";
import { keymap } from "@tiptap/pm/keymap";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import type { MouseEvent, ReactNode } from "react";
import { t } from "ttag";

import { Icon, Loader } from "metabase/ui";

import S from "../KeyboardFilterRow/KeyboardFilterRow.module.css";
import { formatDraftValue } from "../KeyboardFilterRow/utils";

import BS from "./FilterExpressionBarB.module.css";
import {
  type AiStatus,
  type PillAttrs,
  draftAt,
  parseDraft,
  pillText,
  splitText,
} from "./parser";
import type { BarStore } from "./query-sync";
import { type FilterSchema, getFieldDisplayName } from "./schema";

export type SegmentPart = "field" | "operator" | "value";

/** What node views need from the bar. The bar keeps it up to date. */
export type BarRuntime = {
  schema: FilterSchema;
  store: BarStore;
  openSegment: (pos: number, part: SegmentPart, anchor: HTMLElement) => void;
  openClause: (pos: number, anchor: HTMLElement) => void;
  openAi: (pos: number, anchor: HTMLElement) => void;
  /** Version B: the + button at the end of the pills. */
  onAddFilter: () => void;
};

export type BarRuntimeRef = { current: BarRuntime };

type PillOptions = { runtime: BarRuntimeRef | null };

const MAX_VALUE_TOKENS = 3;

/** A single-line document. */
export const SingleLineDocument = /* #__PURE__ */ Document.extend({
  content: "paragraph",
});

export const BarHistory = /* #__PURE__ */ Extension.create({
  name: "filterBarHistory",
  addProseMirrorPlugins: () => [
    history(),
    keymap({ "Mod-z": undo, "Mod-Shift-z": redo, "Mod-y": redo }),
  ],
});

// Mouse events on pill segments go to React, not to ProseMirror's selection
// handling.
const stopSegmentEvents = ({ event }: { event: Event }) =>
  ["mousedown", "mouseup", "click"].includes(event.type) &&
  event.target instanceof Element &&
  event.target.closest("[data-seg]") != null;

function getRuntime(props: NodeViewProps): BarRuntime | undefined {
  const options: PillOptions = props.extension.options;
  return options.runtime?.current;
}

interface SegmentProps {
  className?: string;
  children: ReactNode;
  onOpen: (anchor: HTMLElement) => void;
}

function Segment({ className, children, onOpen }: SegmentProps) {
  return (
    <span
      data-seg
      className={cx(BS.part, className)}
      onMouseDown={(event: MouseEvent<HTMLElement>) => {
        event.preventDefault();
        onOpen(event.currentTarget);
      }}
    >
      {children}
    </span>
  );
}

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <span
      data-seg
      className={cx(BS.part, BS.removePart)}
      role="button"
      aria-label={t`Remove filter`}
      onMouseDown={(event) => {
        event.preventDefault();
        onRemove();
      }}
    >
      <Icon name="close" size={12} />
    </span>
  );
}

function FilterPillView(props: NodeViewProps) {
  const { node, getPos, deleteNode, selected } = props;
  const runtime = getRuntime(props);
  const attrs: PillAttrs = {
    columnKey: node.attrs.columnKey,
    operatorKey: node.attrs.operatorKey,
    values: node.attrs.values,
  };
  const field = runtime?.schema.getField(attrs.columnKey);
  const op = runtime?.schema.getOperator(field, attrs.operatorKey);
  const open = (part: SegmentPart) => (anchor: HTMLElement) => {
    const pos = getPos();
    if (pos != null) {
      runtime?.openSegment(pos, part, anchor);
    }
  };
  const shownValues = attrs.values.slice(0, MAX_VALUE_TOKENS);
  const hiddenCount = attrs.values.length - shownValues.length;

  return (
    <NodeViewWrapper
      as="span"
      className={cx(S.pill, BS.editorPill, { [BS.isSelected]: selected })}
      data-testid="filter-pill"
    >
      <Segment className={S.columnSegment} onOpen={open("field")}>
        {field != null ? getFieldDisplayName(field) : "?"}
      </Segment>
      <Segment className={S.operatorSegment} onOpen={open("operator")}>
        {op?.label ?? "?"}
      </Segment>
      {op?.needsValue && (
        <Segment className={BS.valuePart} onOpen={open("value")}>
          {shownValues.map((value, index) => (
            <span key={index}>
              {index > 0 &&
                (op.isRange ? (
                  <span className={S.conjunction}>
                    {`\u00a0${t`and`}\u00a0`}
                  </span>
                ) : (
                  ", "
                ))}
              {formatDraftValue(op.draft, value)}
            </span>
          ))}
          {hiddenCount > 0 && (
            <span className={S.conjunction}>{` +${hiddenCount}`}</span>
          )}
        </Segment>
      )}
      <RemoveButton onRemove={deleteNode} />
    </NodeViewWrapper>
  );
}

function ClausePillView(props: NodeViewProps) {
  const { node, getPos, deleteNode, selected } = props;
  const runtime = getRuntime(props);
  const entry = runtime?.store.clauses.get(node.attrs.clauseId);
  return (
    <NodeViewWrapper
      as="span"
      className={cx(S.pill, BS.editorPill, { [BS.isSelected]: selected })}
      data-testid="filter-pill"
    >
      <Segment
        onOpen={(anchor) => {
          const pos = getPos();
          if (pos != null) {
            runtime?.openClause(pos, anchor);
          }
        }}
      >
        {entry?.label ?? "?"}
      </Segment>
      <RemoveButton onRemove={deleteNode} />
    </NodeViewWrapper>
  );
}

function AiPillView(props: NodeViewProps) {
  const { node, getPos, deleteNode, selected } = props;
  const runtime = getRuntime(props);
  const entry = runtime?.store.ai.get(node.attrs.aiId);
  const status: AiStatus = node.attrs.status;
  return (
    <NodeViewWrapper
      as="span"
      className={cx(S.pill, BS.editorPill, BS.aiPill, {
        [BS.isSelected]: selected,
        [BS.aiLoading]: status === "loading",
        [BS.aiError]: status === "error",
      })}
      data-testid="ai-filter-pill"
    >
      <Segment
        onOpen={(anchor) => {
          const pos = getPos();
          if (pos != null) {
            runtime?.openAi(pos, anchor);
          }
        }}
      >
        <Icon className={S.aiModeIcon} name="ai" size={14} />
        <span>{entry?.prompt ?? node.attrs.prompt}</span>
        {status === "loading" && <Loader size="xs" />}
        {status === "error" && (
          <span className={S.conjunction}>{` — ${t`no match`}`}</span>
        )}
        {status === "done" && entry?.summary != null && (
          <span className={S.conjunction}>{` → ${entry.summary}`}</span>
        )}
      </Segment>
      <RemoveButton onRemove={deleteNode} />
    </NodeViewWrapper>
  );
}

export const FilterPill = /* #__PURE__ */ Node.create<PillOptions>({
  name: "filterPill",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addOptions: () => ({ runtime: null }),
  addAttributes: () => ({
    columnKey: { default: null },
    operatorKey: { default: null },
    values: { default: [] },
  }),
  parseHTML: () => [{ tag: "span[data-filter-pill]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, { "data-filter-pill": "" }),
  ],
  renderText({ node }) {
    const runtime = this.options.runtime?.current;
    if (runtime == null) {
      return "";
    }
    const attrs: PillAttrs = {
      columnKey: node.attrs.columnKey,
      operatorKey: node.attrs.operatorKey,
      values: node.attrs.values,
    };
    return pillText(attrs, runtime.schema, runtime.store.knownValues);
  },
  addNodeView: () =>
    ReactNodeViewRenderer(FilterPillView, { stopEvent: stopSegmentEvents }),
});

export const ClausePill = /* #__PURE__ */ Node.create<PillOptions>({
  name: "clausePill",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addOptions: () => ({ runtime: null }),
  addAttributes: () => ({ clauseId: { default: null } }),
  parseHTML: () => [{ tag: "span[data-clause-pill]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, { "data-clause-pill": "" }),
  ],
  renderText({ node }) {
    return (
      this.options.runtime?.current.store.clauses.get(node.attrs.clauseId)
        ?.label ?? ""
    );
  },
  addNodeView: () =>
    ReactNodeViewRenderer(ClausePillView, { stopEvent: stopSegmentEvents }),
});

export const AiPill = /* #__PURE__ */ Node.create<PillOptions>({
  name: "aiPill",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addOptions: () => ({ runtime: null }),
  addAttributes: () => ({
    aiId: { default: null },
    prompt: { default: "" },
    status: { default: "loading" },
  }),
  parseHTML: () => [{ tag: "span[data-ai-pill]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, { "data-ai-pill": "" }),
  ],
  renderText: ({ node }) => `/${node.attrs.prompt}`,
  addNodeView: () =>
    ReactNodeViewRenderer(AiPillView, { stopEvent: stopSegmentEvents }),
});

type DraftPiece = {
  from: number;
  to: number;
  className?: string;
  /** A part that the caret can be in: field, operator or values. */
  isPart: boolean;
};

/**
 * Version B: the pieces of a filter that is being typed, in positions of the
 * text. Together they cover the whole draft, spaces included, so they look
 * like one pill: the field, the operator and the values, or the whole text
 * before a field matches.
 */
function getDraftPieces(
  text: string,
  start: number,
  end: number,
  runtime: BarRuntime,
  /** The caret, in positions of the text, or -1. */
  caret: number,
): { from: number; to: number; pieces: DraftPiece[] } | null {
  const raw = text.slice(start, end);
  const draftText = raw.trim();
  if (draftText.length === 0) {
    return null;
  }
  const from = start + (raw.length - raw.trimStart().length);
  const to = from + draftText.length;
  const parsed = parseDraft(
    draftText,
    runtime.schema,
    runtime.store.knownValues,
  );
  const pieces: DraftPiece[] = [];
  const add = (
    pieceFrom: number,
    pieceTo: number,
    isPart: boolean,
    className?: string,
  ) => {
    if (pieceTo > pieceFrom) {
      pieces.push({
        from: from + pieceFrom,
        to: from + pieceTo,
        className,
        isPart,
      });
    }
  };
  const length = draftText.length;
  if (parsed.field == null) {
    add(0, length, true);
  } else {
    add(0, parsed.fieldEnd, true, BS.draftField);
    if (parsed.op != null) {
      add(parsed.fieldEnd, parsed.opStart, false);
      add(parsed.opStart, parsed.opEnd, true, BS.draftOperator);
      if (parsed.valueText.length > 0) {
        add(parsed.opEnd, parsed.valueStart, false);
        add(parsed.valueStart, length, true, BS.draftValue);
      } else {
        add(parsed.opEnd, length, false);
      }
    } else {
      add(parsed.fieldEnd, parsed.opStart, false);
      add(parsed.opStart, length, true);
    }
  }
  // After a part is picked, the caret waits in the space for the next part,
  // like the values after "is between ". The pill takes in that space, as
  // the next part, so the caret stays inside it.
  const isCaretInTrailingSpace =
    caret > to && caret <= end && text.slice(to, caret).trim() === "";
  if (isCaretInTrailingSpace) {
    pieces.push({
      from: to,
      to: caret,
      isPart: true,
      className:
        parsed.op != null
          ? BS.draftValue
          : parsed.field != null
            ? BS.draftOperator
            : undefined,
    });
    return { from, to: caret, pieces };
  }
  return { from, to, pieces };
}

const PILL_NODE_NAMES = new Set(["filterPill", "clausePill", "aiPill"]);

/** The end of a filter that is being typed: its × button and right edge. */
function createDraftEnd(
  view: EditorView,
  getPos: () => number | undefined,
  runtime: BarRuntimeRef | null,
) {
  const element = document.createElement("span");
  element.className = BS.draftPillEnd;
  element.contentEditable = "false";
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", t`Remove filter`);
  element.textContent = "×";
  element.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const pos = getPos();
    const current = runtime?.current;
    if (pos == null || current == null) {
      return;
    }
    const draft = draftAt(
      view.state.doc,
      pos,
      current.schema,
      current.store.knownValues,
    );
    view.dispatch(view.state.tr.delete(draft.from, draft.to));
    view.focus();
  });
  return element;
}

/** Version B: the + button after the last pill, which starts a new filter. */
function createAddButton(runtime: BarRuntimeRef | null) {
  const element = document.createElement("span");
  element.className = BS.addFilterButton;
  element.contentEditable = "false";
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", t`Add filter`);
  element.setAttribute("title", t`Add a filter (F)`);
  element.setAttribute("data-testid", "add-filter-button");
  element.textContent = "+";
  element.addEventListener("mousedown", (event) => {
    event.preventDefault();
    runtime?.current.onAddFilter();
  });
  return element;
}

/**
 * Styles the and / or / parentheses typed between pills as connectors, and a
 * filter that is being typed as a pill, with its parts inside. Adds the +
 * button after the last pill.
 */
export const LogicHighlight = /* #__PURE__ */ Extension.create<PillOptions>({
  name: "filterBarLogicHighlight",
  addOptions: () => ({ runtime: null }),
  addProseMirrorPlugins() {
    const runtime = this.options.runtime;
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            // Version B: a click on a connector chip, which shows a × on
            // hover, removes the connector.
            mousedown(view, event) {
              const chip =
                event.target instanceof Element
                  ? event.target.closest(`.${BS.logic}`)
                  : null;
              if (chip == null) {
                return false;
              }
              event.preventDefault();
              // The connector and one space next to it.
              const from = view.posAtDOM(chip, 0);
              const to = from + (chip.textContent?.length ?? 0);
              const { doc } = view.state;
              const end = doc.content.size - 1;
              const after = doc.textBetween(to, Math.min(to + 1, end));
              const before = doc.textBetween(Math.max(1, from - 1), from);
              const deleteFrom =
                after !== " " && before === " " ? from - 1 : from;
              const deleteTo = after === " " ? to + 1 : to;
              view.dispatch(view.state.tr.delete(deleteFrom, deleteTo));
              view.focus();
              return true;
            },
          },
          decorations(state) {
            const decorations: Decoration[] = [];
            const current = runtime?.current;
            const { from: selectionFrom, to: selectionTo } = state.selection;
            let hasPills = false;
            state.doc.descendants((node, pos) => {
              if (PILL_NODE_NAMES.has(node.type.name)) {
                hasPills = true;
                return;
              }
              const text = node.text;
              if (!node.isText || !text) {
                return;
              }
              splitText(
                text,
                current?.schema,
                current?.store.knownValues,
              ).forEach((part) => {
                if (part.kind === "logic") {
                  decorations.push(
                    Decoration.inline(pos + part.start, pos + part.end, {
                      class: BS.logic,
                    }),
                  );
                  return;
                }
                const draft =
                  current != null
                    ? getDraftPieces(
                        text,
                        part.start,
                        part.end,
                        current,
                        selectionFrom === selectionTo
                          ? selectionFrom - pos
                          : -1,
                      )
                    : null;
                if (draft == null) {
                  return;
                }
                draft.pieces.forEach((piece, index) => {
                  const from = pos + piece.from;
                  const to = pos + piece.to;
                  const isActive =
                    piece.isPart && from <= selectionFrom && selectionTo <= to;
                  decorations.push(
                    Decoration.inline(from, to, {
                      class: cx(BS.draftPill, piece.className, {
                        [BS.draftGap]: !piece.isPart,
                        [BS.draftPillStart]: index === 0,
                        [BS.draftPartActive]: isActive,
                      }),
                    }),
                  );
                });
                decorations.push(
                  Decoration.widget(
                    pos + draft.to,
                    (view, getPos) => createDraftEnd(view, getPos, runtime),
                    { side: 1, key: "draft-end", ignoreSelection: true },
                  ),
                );
              });
            });
            if (hasPills) {
              decorations.push(
                Decoration.widget(
                  state.doc.content.size - 1,
                  () => createAddButton(runtime),
                  { side: 2, key: "add-filter", ignoreSelection: true },
                ),
              );
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
