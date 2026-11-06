import { type MouseEvent, type ReactNode, useMemo } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Card,
  Flex,
  Icon,
  Menu,
  Text,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

import S from "./SummarySidebar.module.css";
import { SummaryWellInput } from "./SummaryWellInput";
import type {
  SummaryField,
  SummaryFieldSection,
  SummaryValueItem,
  SummaryWellId,
} from "./types";
import {
  changeValueOperator,
  getDimensionItems,
  getValueItems,
  getWellFieldSections,
} from "./utils";

type SummaryWellsProps = {
  query: Lib.Query;
  stageIndex: number;
  /** Every field the summary can be built from; each well offers its own part. */
  sections: SummaryFieldSection[];
  /** A field was picked in a well's typeahead. */
  onPick: (wellId: SummaryWellId, field: SummaryField) => void;
  /** A chip was removed or changed. */
  onChange: (nextQuery: Lib.Query) => void;
};

/**
 * Summarize by and Group by: the stage's aggregations and breakouts as chips, each with a
 * typeahead to add more. Opens ready to type into Summarize by.
 */
export function SummaryWells({
  query,
  stageIndex,
  sections,
  onPick,
  onChange,
}: SummaryWellsProps) {
  const valueItems = useMemo(
    () => getValueItems(query, stageIndex),
    [query, stageIndex],
  );
  const dimensionItems = useMemo(
    () => getDimensionItems(query, stageIndex),
    [query, stageIndex],
  );
  const valueSections = useMemo(
    () => getWellFieldSections(sections, "values"),
    [sections],
  );
  const columnSections = useMemo(
    () => getWellFieldSections(sections, "columns"),
    [sections],
  );

  const handleRemove = (clause: Lib.AggregationClause | Lib.BreakoutClause) =>
    onChange(Lib.removeClause(query, stageIndex, clause));

  return (
    <Box className={S.wells} data-testid="summary-wells">
      <SummaryWell wellId="values" title={t`Summarize by`}>
        <SummaryWellInput
          wellId="values"
          sections={valueSections}
          hasItems={valueItems.length > 0}
          autoFocus
          onPick={(field) => onPick("values", field)}
          onRemoveLast={() => {
            const lastItem = valueItems.at(-1);
            if (lastItem) {
              handleRemove(lastItem.clause);
            }
          }}
        >
          {valueItems.map((item) => (
            <ValueChip
              key={item.key}
              query={query}
              stageIndex={stageIndex}
              item={item}
              onChange={onChange}
              onRemove={() => handleRemove(item.clause)}
            />
          ))}
        </SummaryWellInput>
      </SummaryWell>
      <SummaryWell wellId="columns" title={t`Group by`}>
        <SummaryWellInput
          wellId="columns"
          sections={columnSections}
          hasItems={dimensionItems.length > 0}
          onPick={(field) => onPick("columns", field)}
          onRemoveLast={() => {
            const lastItem = dimensionItems.at(-1);
            if (lastItem) {
              handleRemove(lastItem.clause);
            }
          }}
        >
          {dimensionItems.map((item) => (
            <WellChip
              key={item.key}
              label={item.label}
              onRemove={() => handleRemove(item.clause)}
            >
              <span className={S.chipLabel}>{item.label}</span>
            </WellChip>
          ))}
        </SummaryWellInput>
      </SummaryWell>
    </Box>
  );
}

// clicks on these keep their own behavior instead of focusing the well's field
const INTERACTIVE_SELECTOR =
  "button, input, a, [role='button'], [contenteditable='true']";

type SummaryWellProps = {
  wellId: SummaryWellId;
  title: string;
  children: ReactNode;
};

/** A card that's one big input: clicking anywhere outside its chips focuses its field. */
function SummaryWell({ wellId, title, children }: SummaryWellProps) {
  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof Element) ||
      event.target.closest(INTERACTIVE_SELECTOR)
    ) {
      return;
    }
    const field = event.currentTarget.querySelector("input");
    if (field) {
      // keep the mousedown from blurring the field we're about to focus
      event.preventDefault();
      field.focus();
    }
  };

  return (
    <Card
      className={S.well}
      radius="lg"
      shadow="xs_outline"
      p="md"
      data-testid={`summary-well-${wellId}`}
      onMouseDown={handleMouseDown}
    >
      <Flex className={S.wellHeader}>
        <Text className={S.wellTitle}>{title}</Text>
      </Flex>
      {children}
    </Card>
  );
}

type WellChipProps = {
  label: string;
  children: ReactNode;
  onRemove: () => void;
};

function WellChip({ label, children, onRemove }: WellChipProps) {
  return (
    <Box className={S.chip} data-testid="summary-well-item">
      {children}
      <ActionIcon
        className={S.chipRemove}
        size="sm"
        variant="subtle"
        c="inherit"
        aria-label={t`Remove ${label}`}
        onClick={onRemove}
      >
        <Icon name="close" size={12} />
      </ActionIcon>
    </Box>
  );
}

const VALUE_ICONS: Record<
  Exclude<SummaryValueItem["kind"], "column">,
  IconName
> = {
  count: "sum",
  metric: "metric",
  measure: "ruler",
  expression: "function",
};

type ValueChipProps = {
  query: Lib.Query;
  stageIndex: number;
  item: SummaryValueItem;
  onChange: (nextQuery: Lib.Query) => void;
  onRemove: () => void;
};

function ValueChip({
  query,
  stageIndex,
  item,
  onChange,
  onRemove,
}: ValueChipProps) {
  return (
    <WellChip label={item.label} onRemove={onRemove}>
      {item.kind === "column" ? (
        <ColumnValueMenu
          query={query}
          stageIndex={stageIndex}
          item={item}
          onChange={onChange}
        />
      ) : (
        <>
          <Icon name={VALUE_ICONS[item.kind]} size={12} />
          <span className={S.chipLabel}>{item.label}</span>
        </>
      )}
    </WellChip>
  );
}

type ColumnValueMenuProps = {
  query: Lib.Query;
  stageIndex: number;
  item: Extract<SummaryValueItem, { kind: "column" }>;
  onChange: (nextQuery: Lib.Query) => void;
};

/** A column value's chip: picks how the column is aggregated. */
function ColumnValueMenu({
  query,
  stageIndex,
  item,
  onChange,
}: ColumnValueMenuProps) {
  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <UnstyledButton
          className={S.chipButton}
          aria-label={t`Change how ${item.label} is calculated`}
        >
          <span className={S.chipLabel}>{item.label}</span>
          <Icon name="chevrondown" size={10} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {item.operatorOptions.map((option) => (
          <Menu.Item
            key={option.shortName}
            rightSection={
              option.isSelected ? <Icon name="check" aria-hidden /> : null
            }
            onClick={() =>
              onChange(
                changeValueOperator(query, stageIndex, item, option.operator),
              )
            }
          >
            {option.displayName}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
