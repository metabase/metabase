import type { EditorView } from "@tiptap/pm/view";
import { type KeyboardEvent, type Ref, useState } from "react";
import { t } from "ttag";

import { FilterAutoApplyContext } from "metabase/querying/filters/components/FilterPicker/FilterAutoApplyContext";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import { Button, Icon, Stack, Text, TextInput } from "metabase/ui";
import * as Lib from "metabase-lib";

import BS from "./FilterExpressionBar.module.css";
import {
  type ActionContext,
  focusAfter,
  replaceWithNode,
  replaceWithNodes,
  unwrapNode,
} from "./editor-actions";
import {
  type Draft,
  type PMNode,
  type PillAttrs,
  pillText,
  valuesText,
} from "./parser";
import {
  type Anchor,
  BarPopover,
  OptionList,
  flattenOptions,
  searchGroups,
} from "./popover-ui";
import { type BarStore, addClause, getClauseColumn } from "./query-sync";
import type { SchemaField, SchemaOperator } from "./schema";
import { getFieldGroups, toBarGroups } from "./suggestions";

const SEGMENT_POPOVER_WIDTH = 300;
const PICKER_POPOVER_WIDTH = 360;

type CommonProps = {
  view: EditorView;
  context: ActionContext & { store: BarStore };
  anchor: Anchor;
  popoverRef: Ref<HTMLDivElement>;
  onClose: () => void;
};

function getPillAttrs(node: PMNode): PillAttrs {
  return {
    columnKey: node.attrs.columnKey,
    operatorKey: node.attrs.operatorKey,
    values: node.attrs.values,
  };
}

function setPillAttrs(view: EditorView, pos: number, attrs: PillAttrs) {
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, attrs));
  focusAfter(view, pos);
}

/** The values that an operator can keep, or undefined when they're not enough. */
function getKeptValues(op: SchemaOperator, values: string[]) {
  if (!op.needsValue) {
    return [];
  }
  const kept = op.isRange
    ? values.slice(0, 2)
    : op.isMulti
      ? values
      : values.slice(0, 1);
  const isEnough = op.isRange ? kept.length === 2 : kept.length > 0;
  return isEnough ? kept : undefined;
}

// ---------- Field and operator of a pill ----------

type SegmentPopoverProps = CommonProps & {
  pos: number;
  part: "field" | "operator";
};

/**
 * A search and a list to change the field or the operator of a pill. A
 * change that leaves the filter incomplete turns the pill back into text, to
 * finish it in the bar.
 */
export function SegmentPopover({
  view,
  context,
  anchor,
  popoverRef,
  pos,
  part,
  onClose,
}: SegmentPopoverProps) {
  const [searchText, setSearchText] = useState("");
  const [highlight, setHighlight] = useState(0);
  const { schema, knownValues } = context;
  const node = view.state.doc.nodeAt(pos);
  if (node == null || node.type.name !== "filterPill") {
    return null;
  }
  const attrs = getPillAttrs(node);
  const field = schema.getField(attrs.columnKey);
  const op = schema.getOperator(field, attrs.operatorKey);

  const close = () => {
    onClose();
    focusAfter(view, pos);
  };

  const pickField = (newField: SchemaField) => {
    onClose();
    const newOp = newField.operators?.find(({ key }) => key === op?.key);
    const isSameKind = newField.column.kind === field?.column.kind;
    const values =
      newOp != null ? getKeptValues(newOp, attrs.values) : undefined;
    if (newOp != null && isSameKind && values != null) {
      setPillAttrs(view, pos, {
        columnKey: newField.key,
        operatorKey: newOp.key,
        values,
      });
    } else {
      unwrapNode(view, pos, `${newField.text} `);
    }
  };

  const pickOperator = (newOp: SchemaOperator) => {
    if (field == null) {
      return;
    }
    onClose();
    const values = getKeptValues(newOp, attrs.values);
    if (values != null) {
      setPillAttrs(view, pos, {
        columnKey: field.key,
        operatorKey: newOp.key,
        values,
      });
    } else {
      const partial = attrs.values.length
        ? valuesText(attrs.values.slice(0, 1), field, newOp, knownValues)
        : "";
      unwrapNode(view, pos, `${field.text} ${newOp.label} ${partial}`);
    }
  };

  const groups =
    part === "field"
      ? toBarGroups(
          searchGroups(
            getFieldGroups(schema).filter(
              (group) => group.section !== t`Segments`,
            ),
            searchText,
          ),
          (key) => {
            const newField = schema.getField(key);
            if (newField != null) {
              pickField(newField);
            }
          },
        )
      : toBarGroups(
          searchGroups(
            [
              {
                options: (field?.operators ?? []).map((op) => ({
                  value: op.key,
                  label: op.label,
                  aliases: op.aliases,
                })),
              },
            ],
            searchText,
          ),
          (key) => {
            const newOp = schema.getOperator(field, key);
            if (newOp != null) {
              pickOperator(newOp);
            }
          },
        );
  const options = flattenOptions(groups);
  const highlightIndex = Math.min(highlight, options.length - 1);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlight(
        Math.max(0, Math.min(highlightIndex + delta, options.length - 1)),
      );
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      options[highlightIndex]?.run();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <BarPopover
      anchor={anchor}
      width={SEGMENT_POPOVER_WIDTH}
      popoverRef={popoverRef}
    >
      <TextInput
        autoFocus
        m="sm"
        mb={0}
        leftSection={<Icon name="search" />}
        placeholder={
          part === "field" ? t`Search columns…` : t`Search operators…`
        }
        value={searchText}
        onChange={(event) => {
          setSearchText(event.currentTarget.value);
          setHighlight(0);
        }}
        onKeyDown={handleKeyDown}
      />
      <OptionList
        groups={groups}
        highlightIndex={highlightIndex}
        emptyMessage={t`No results`}
        onHighlight={setHighlight}
      />
    </BarPopover>
  );
}

// ---------- Filters that the bar can't edit inline ----------

type ClausePopoverProps = CommonProps & { pos: number };

/** The filter picker for a clause pill, like a date filter. */
export function ClausePopover({
  view,
  context,
  anchor,
  popoverRef,
  pos,
  onClose,
}: ClausePopoverProps) {
  const { schema, store } = context;
  const { query, stageIndex } = schema;
  const node = view.state.doc.nodeAt(pos);
  const entry =
    node?.type.name === "clausePill"
      ? store.clauses.get(node.attrs.clauseId)
      : undefined;
  if (node == null || entry == null) {
    return null;
  }
  const { clause } = entry;
  const column = Lib.isSegmentMetadata(clause)
    ? undefined
    : getClauseColumn(query, stageIndex, clause);

  return (
    <BarPopover
      anchor={anchor}
      width={PICKER_POPOVER_WIDTH}
      keepsEditorFocus={false}
      popoverRef={popoverRef}
    >
      {column != null ? (
        // The bar applies the filter, so the picker doesn't apply it itself.
        <FilterAutoApplyContext.Provider value={null}>
          <FilterPickerBody
            autoFocus
            query={query}
            stageIndex={stageIndex}
            column={column}
            filter={clause}
            isNew={false}
            onChange={(newClause) => {
              onClose();
              const clauseId = addClause(store, query, stageIndex, newClause);
              view.dispatch(
                view.state.tr.setNodeMarkup(pos, undefined, { clauseId }),
              );
              focusAfter(view, pos);
            }}
          />
        </FilterAutoApplyContext.Provider>
      ) : (
        <Stack p="md" gap="sm">
          <Text>{entry.label}</Text>
          <Text c="text-secondary" size="sm">
            {t`This filter can't be edited here.`}
          </Text>
          <Button
            variant="subtle"
            onClick={() => {
              onClose();
              view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
              view.focus();
            }}
          >{t`Remove`}</Button>
        </Stack>
      )}
    </BarPopover>
  );
}

type PickerPopoverProps = CommonProps & {
  draft: Draft;
  field: SchemaField;
};

/** The filter picker for a new filter on a column like a date. */
export function PickerPopover({
  view,
  context,
  anchor,
  popoverRef,
  draft,
  field,
  onClose,
}: PickerPopoverProps) {
  const { schema, store } = context;
  const { query, stageIndex } = schema;
  return (
    <BarPopover
      anchor={anchor}
      width={PICKER_POPOVER_WIDTH}
      keepsEditorFocus={false}
      popoverRef={popoverRef}
    >
      <FilterAutoApplyContext.Provider value={null}>
        <FilterPickerBody
          autoFocus
          query={query}
          stageIndex={stageIndex}
          column={field.column.column}
          isNew
          onChange={(clause) => {
            onClose();
            const clauseId = addClause(store, query, stageIndex, clause);
            replaceWithNode(
              view,
              draft.from,
              draft.to,
              view.state.schema.nodes.clausePill.create({ clauseId }),
            );
            view.focus();
          }}
          onBack={() => {
            onClose();
            unwrapNode(view, draft.from, "");
          }}
        />
      </FilterAutoApplyContext.Provider>
    </BarPopover>
  );
}

// ---------- AI pills ----------

type AiPopoverProps = CommonProps & { pos: number };

/** What an AI pill resolved to, and what to do with it. */
export function AiPopover({
  view,
  context,
  anchor,
  popoverRef,
  pos,
  onClose,
}: AiPopoverProps) {
  const { schema, store, knownValues } = context;
  const node = view.state.doc.nodeAt(pos);
  const entry =
    node?.type.name === "aiPill" ? store.ai.get(node.attrs.aiId) : undefined;
  if (node == null || entry == null) {
    return null;
  }
  const itemLabels = entry.items.map((item) =>
    "attrs" in item
      ? pillText(item.attrs, schema, knownValues)
      : (store.clauses.get(item.clauseId)?.label ?? ""),
  );

  const convert = () => {
    onClose();
    const { schema: pmSchema } = view.state;
    const pills = entry.items.map((item) =>
      "attrs" in item
        ? pmSchema.nodes.filterPill.create(item.attrs)
        : pmSchema.nodes.clausePill.create({ clauseId: item.clauseId }),
    );
    const nodes = pills.flatMap((pill, index) =>
      index > 0 ? [pmSchema.text(" and "), pill] : [pill],
    );
    const grouped =
      pills.length > 1
        ? [pmSchema.text("("), ...nodes, pmSchema.text(")")]
        : nodes;
    replaceWithNodes(view, pos, pos + node.nodeSize, grouped);
    view.focus();
  };

  const actions = [
    ...(entry.status === "done"
      ? [{ label: t`Convert to filters`, run: convert }]
      : []),
    {
      label: t`Edit prompt`,
      run: () => {
        onClose();
        unwrapNode(view, pos, `/${entry.prompt}`);
      },
    },
    {
      label: t`Remove`,
      run: () => {
        onClose();
        view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
        view.focus();
      },
    },
  ];

  return (
    <BarPopover
      anchor={anchor}
      width={SEGMENT_POPOVER_WIDTH}
      keepsEditorFocus={false}
      popoverRef={popoverRef}
    >
      <Stack
        p="md"
        gap="sm"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
            focusAfter(view, pos);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const buttons = [...event.currentTarget.querySelectorAll("button")];
            const index = buttons.findIndex(
              (button) => button === document.activeElement,
            );
            const delta = event.key === "ArrowDown" ? 1 : -1;
            buttons[(index + delta + buttons.length) % buttons.length]?.focus();
          }
        }}
      >
        <Text fw="bold">
          <Icon name="ai" size={14} className={BS.inlineIcon} />
          {entry.prompt}
        </Text>
        {entry.status === "loading" && (
          <Text c="text-secondary">{t`Thinking…`}</Text>
        )}
        {entry.status === "error" && (
          <Text c="text-secondary">
            {entry.error ?? t`Couldn't turn that into a filter.`}
          </Text>
        )}
        {entry.status === "done" &&
          itemLabels.map((label, index) => <Text key={index}>{label}</Text>)}
        <Stack gap={4}>
          {actions.map((action, index) => (
            <Button
              key={action.label}
              autoFocus={index === 0}
              variant={index === 0 ? "filled" : "subtle"}
              onClick={action.run}
            >
              {action.label}
            </Button>
          ))}
        </Stack>
      </Stack>
    </BarPopover>
  );
}
