import { Extension, Node, mergeAttributes } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import { history, redo, undo } from "@tiptap/pm/history";
import { keymap } from "@tiptap/pm/keymap";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
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

import BS from "./FilterExpressionBar.module.css";
import {
  type AiStatus,
  type PillAttrs,
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
                  <span className={S.conjunction}>{` ${t`and`} `}</span>
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

/**
 * The blocks of a filter that is being typed, in positions of the text:
 * the field, the operator and the values, or the whole text before a field
 * matches.
 */
function getDraftBlocks(
  text: string,
  start: number,
  end: number,
  runtime: BarRuntime,
) {
  const raw = text.slice(start, end);
  const draftText = raw.trim();
  if (draftText.length === 0) {
    return [];
  }
  const from = start + (raw.length - raw.trimStart().length);
  const to = from + draftText.length;
  const parsed = parseDraft(
    draftText,
    runtime.schema,
    runtime.store.knownValues,
  );
  if (parsed.field == null) {
    return [{ from, to, className: BS.draftPart }];
  }
  const blocks = [
    {
      from,
      to: from + parsed.fieldEnd,
      className: cx(BS.draftPart, BS.draftField),
    },
  ];
  if (parsed.op != null) {
    blocks.push({
      from: from + parsed.opStart,
      to: from + parsed.opEnd,
      className: cx(BS.draftPart, BS.draftOperator),
    });
    if (parsed.valueText.length > 0) {
      blocks.push({
        from: from + parsed.valueStart,
        to,
        className: cx(BS.draftPart, BS.draftValue),
      });
    }
  } else if (parsed.opStart < draftText.length) {
    blocks.push({
      from: from + parsed.opStart,
      to,
      className: BS.draftPart,
    });
  }
  return blocks;
}

/**
 * Styles the and / or / parentheses typed between pills as connectors, and
 * the parts of a filter that is being typed as blocks.
 */
export const LogicHighlight = /* #__PURE__ */ Extension.create<PillOptions>({
  name: "filterBarLogicHighlight",
  addOptions: () => ({ runtime: null }),
  addProseMirrorPlugins() {
    const runtime = this.options.runtime;
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const current = runtime?.current;
            const caret = state.selection.empty ? state.selection.from : -1;
            state.doc.descendants((node, pos) => {
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
                } else if (current != null) {
                  getDraftBlocks(text, part.start, part.end, current).forEach(
                    (block) => {
                      const from = pos + block.from;
                      const to = pos + block.to;
                      const hasCaret = from <= caret && caret <= to;
                      decorations.push(
                        Decoration.inline(from, to, {
                          class: cx(block.className, {
                            [BS.draftPartActive]: hasCaret,
                          }),
                        }),
                      );
                    },
                  );
                }
              });
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
