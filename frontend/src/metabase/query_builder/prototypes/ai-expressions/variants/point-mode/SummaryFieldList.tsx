import { useDraggable } from "@dnd-kit/core";
import cx from "classnames";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { Box, Card, Icon, Text, TextInput, UnstyledButton } from "metabase/ui";
import { isMac } from "metabase/utils/browser";
import type { IconName } from "metabase-types/api";

import type {
  SummaryBase,
  SummaryDragItem,
} from "../../../../components/view/SummarySidebar/types";
import {
  getAvailableMetrics,
  getColumnLabel,
  getColumnSections,
  getItemKey,
  getMetricLabel,
} from "../../../../components/view/SummarySidebar/utils";

import { MatchedLabel } from "./MatchedLabel";
import S from "./SummarySidebar.module.css";
import {
  type ActiveFormulaEditor,
  getFieldReference,
  getFieldReferenceColorClassName,
} from "./point-mode";

const METRICS_SECTION_KEY = "metrics";

/** A field in the list: a column, a metric, or the count, but never a chip from a well. */
export type SummaryFieldItem = Exclude<SummaryDragItem, { kind: "chip" }>;

type SummaryFieldListProps = {
  base: SummaryBase;
  /** The open formula, if any: clicks insert into it instead of swapping or adding. */
  formulaEditor: ActiveFormulaEditor | null;
  /** A field was clicked, or picked with Enter or Space. */
  onSwap: (item: SummaryFieldItem) => void;
  /** A field was option-clicked (alt-clicked off a Mac), or picked with that key and Enter or Space. */
  onAdd: (item: SummaryFieldItem) => void;
};

/**
 * The fields to click or drag into the wells, in one list: a Metrics section (Count of rows, then
 * the metrics defined on the same table), then a section per table the question reaches. Every
 * section collapses; a search shows all matches. While a formula is open, it's in point mode:
 * a click inserts the field into the formula, and the fields it references take their colors.
 */
export function SummaryFieldList({
  base,
  formulaEditor,
  onSwap,
  onAdd,
}: SummaryFieldListProps) {
  const [searchText, setSearchText] = useState("");
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const query = searchText.trim();
  const isSearching = query.length > 0;

  const sections = useMemo(() => getColumnSections(base, query), [base, query]);
  const metrics = useMemo(
    () => getAvailableMetrics(base, query),
    [base, query],
  );

  // the formula's help popover opens over the list; while pointing at the list, it lets the
  // clicks through. Tracked by position, since the popover is what's under the pointer
  const cardRef = useRef<HTMLDivElement>(null);
  const [isPointerOverList, setIsPointerOverList] = useState(false);
  const isPointMode = formulaEditor != null;
  useEffect(() => {
    if (!isPointMode) {
      setIsPointerOverList(false);
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const rect = cardRef.current?.getBoundingClientRect();
      setIsPointerOverList(
        rect != null &&
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom,
      );
    };
    document.addEventListener("pointermove", handlePointerMove);
    return () => document.removeEventListener("pointermove", handlePointerMove);
  }, [isPointMode]);

  const toggleSection = (key: string) => {
    setCollapsedKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(key)) {
        nextKeys.delete(key);
      } else {
        nextKeys.add(key);
      }
      return nextKeys;
    });
  };
  const renderSection = (key: string, name: string, items: ReactNode[]) => (
    <CollapsibleSection
      key={key}
      name={name}
      // matches would be hidden in a collapsed section, so a search opens them all
      isExpanded={isSearching || !collapsedKeys.has(key)}
      onToggle={isSearching ? undefined : () => toggleSection(key)}
    >
      {items}
    </CollapsibleSection>
  );

  const countLabel = t`Count of rows`;
  const isCountMatching = countLabel
    .toLowerCase()
    .includes(query.toLowerCase());
  // Count of rows leads the metrics: the quickest value to start a summary with
  const metricItems = [
    ...(isCountMatching
      ? [
          <DraggableField
            key="count"
            id="summary-count"
            icon="sum"
            item={{ kind: "count", label: countLabel }}
            query={query}
            base={base}
            formulaEditor={formulaEditor}
            onSwap={onSwap}
            onAdd={onAdd}
          />,
        ]
      : []),
    ...metrics.map((metric) => (
      <DraggableField
        key={getItemKey(base, metric)}
        id={`summary-metric:${getItemKey(base, metric)}`}
        icon="metric"
        item={{
          kind: "metric",
          metric,
          label: getMetricLabel(base, metric),
        }}
        query={query}
        base={base}
        formulaEditor={formulaEditor}
        onSwap={onSwap}
        onAdd={onAdd}
      />
    )),
  ];
  const metricsSection =
    metricItems.length > 0
      ? renderSection(METRICS_SECTION_KEY, t`Metrics`, metricItems)
      : null;
  const columnSections = sections
    .filter((section) => section.columns.length > 0)
    .map((section) =>
      renderSection(
        `table:${section.name}`,
        section.name,
        section.columns.map((column) => (
          <DraggableField
            key={getItemKey(base, column)}
            id={`summary-column:${getItemKey(base, column)}`}
            icon={getColumnIcon(column)}
            item={{
              kind: "column",
              column,
              label: getColumnLabel(base, column),
            }}
            query={query}
            base={base}
            formulaEditor={formulaEditor}
            onSwap={onSwap}
            onAdd={onAdd}
          />
        )),
      ),
    );
  const hasItems = metricsSection != null || columnSections.length > 0;

  return (
    <Card
      ref={cardRef}
      className={cx(S.fieldListCard, {
        [S.fieldListIsPointedAt]: isPointMode && isPointerOverList,
      })}
      radius="lg"
      shadow="xs_outline"
      p="md"
    >
      <Box className={S.fieldList}>
        <TextInput
          className={S.searchField}
          classNames={{
            input: S.fieldListSearchInput,
            section: S.searchFieldIcon,
          }}
          variant="unstyled"
          size="xs"
          // the half-width card cuts off a longer placeholder; the label says what's searched
          placeholder={t`Search…`}
          aria-label={t`Search columns and metrics`}
          leftSection={<Icon name="search" />}
          // the icon's 16px plus the rows' 8px gap, so the text lines up with the field names
          leftSectionWidth={24}
          value={searchText}
          onChange={(event) => setSearchText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSearchText("");
            }
          }}
        />
        <Box className={S.fieldListScroll}>
          {hasItems ? (
            <>
              {metricsSection}
              {columnSections}
            </>
          ) : (
            <Text className={S.fieldListEmpty} c="text-secondary">
              {t`Nothing matches “${query}”.`}
            </Text>
          )}
        </Box>
        <Text className={S.fieldListHint}>
          {formulaEditor != null
            ? t`Click a field to insert it into the formula`
            : t`Click to swap, ${isMac() ? "⌥" : "Alt"}-click to add`}
        </Text>
      </Box>
    </Card>
  );
}

type CollapsibleSectionProps = {
  name: string;
  isExpanded: boolean;
  /** Absent while the section can't collapse, e.g. during a search. */
  onToggle?: () => void;
  children: ReactNode;
};

function CollapsibleSection({
  name,
  isExpanded,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <Box className={S.section}>
      <UnstyledButton
        className={cx(S.fieldGroupName, S.sectionToggle)}
        aria-expanded={isExpanded}
        disabled={onToggle == null}
        onClick={onToggle}
      >
        <Icon
          className={S.sectionChevron}
          name="chevronright"
          size={12}
          aria-hidden
        />
        {name}
      </UnstyledButton>
      {isExpanded && children}
    </Box>
  );
}

type DraggableFieldProps = {
  id: string;
  icon: IconName;
  item: SummaryFieldItem;
  /** Search text to highlight in the label. */
  query: string;
  base: SummaryBase;
  formulaEditor: ActiveFormulaEditor | null;
  onSwap: (item: SummaryFieldItem) => void;
  onAdd: (item: SummaryFieldItem) => void;
};

function DraggableField({
  id,
  icon,
  item,
  query,
  base,
  formulaEditor,
  onSwap,
  onAdd,
}: DraggableFieldProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: item,
  });
  const reference =
    formulaEditor != null
      ? getFieldReference(base, item, formulaEditor.expressionMode)
      : null;
  const referenceColorClassName =
    formulaEditor != null
      ? getFieldReferenceColorClassName(base, item, formulaEditor)
      : undefined;

  const pick = (isAdding: boolean) => {
    if (formulaEditor == null) {
      if (isAdding) {
        onAdd(item);
      } else {
        onSwap(item);
      }
    } else if (reference != null) {
      formulaEditor.insert(reference);
    }
  };

  return (
    <Box
      ref={setNodeRef}
      className={cx(S.fieldItem, referenceColorClassName, {
        [S.isDragging]: isDragging,
        [S.fieldItemReferenced]: referenceColorClassName != null,
        [S.fieldItemUnavailable]: formulaEditor != null && reference == null,
      })}
      data-testid="summary-field-item"
      {...attributes}
      {...listeners}
      // in point mode, pressing a field mustn't take the focus (and the cursor) from the formula
      onMouseDown={
        formulaEditor != null ? (event) => event.preventDefault() : undefined
      }
      // a drag that ends here doesn't click: dnd-kit swallows the click once a drag starts
      onClick={(event) => pick(event.altKey)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          pick(event.altKey);
        }
      }}
    >
      <Icon
        name={icon}
        c={referenceColorClassName != null ? "inherit" : "text-secondary"}
        aria-hidden
      />
      <MatchedLabel label={item.label} query={query} />
      <Icon name="grabber" className={S.grabber} aria-hidden />
    </Box>
  );
}
