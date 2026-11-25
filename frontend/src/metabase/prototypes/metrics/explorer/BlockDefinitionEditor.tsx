import cx from "classnames";
import { type ReactNode, useState } from "react";

import {
  ActionIcon,
  Box,
  FixedSizeIcon,
  Group,
  Menu,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";

import { MEASURES, formatNumber } from "../data";
import { METRICS, seriesOf } from "../tree/MetricTreePrototype";

import S from "./BlockDefinitionEditor.module.css";
import ES from "./Explorer.module.css";
import {
  type BarItem,
  DRAFT_PREFIX,
  DROPDOWN_WIDTH,
  SuggestionList,
  useSuggestionList,
} from "./TokenBar";
import {
  type FormulaToken,
  type MetricDraft,
  OP_ITEMS,
  type Op,
  findProblem,
  newKey,
  search,
} from "./formula";

type Term = Extract<FormulaToken, { kind: "term" }>;

/**
 * The definition as large blocks, like the Metric Tree's cards: one block per
 * measure with its filters as rows, operators as round buttons between them.
 */
export function BlockDefinitionEditor({
  draft,
  onChange,
  measureItems,
  measureName,
  filtersForTerm,
}: {
  draft: MetricDraft;
  onChange: (draft: MetricDraft) => void;
  measureItems: BarItem[];
  measureName: (id: string) => string;
  filtersForTerm: (
    measureId: string,
    query: string,
    exclude: string[],
  ) => BarItem[];
}) {
  const { formula } = draft;
  const setFormula = (next: FormulaToken[]) =>
    onChange({ ...draft, formula: next });
  const problem = findProblem(formula, measureName);

  const replace = (key: string, token: FormulaToken) =>
    setFormula(formula.map((t) => (t.key === key ? token : t)));

  /** Drops a block with the operator that joined it to its neighbor. */
  const removeTerm = (index: number) => {
    const opIndex =
      formula[index - 1]?.kind === "op"
        ? index - 1
        : formula[index + 1]?.kind === "op"
          ? index + 1
          : -1;
    setFormula(formula.filter((_, i) => i !== index && i !== opIndex));
  };

  const addTerm = (measureId: string) => {
    const term: Term = { key: newKey(), kind: "term", measureId, filters: [] };
    setFormula(
      formula.length === 0
        ? [term]
        : [...formula, { key: newKey(), kind: "op", op: "+" }, term],
    );
  };

  const measureInfo = (id: string) =>
    measureItems.find((item) => item.id === id);

  return (
    <Stack gap="sm">
      <Stack gap="xs" className={S.flow}>
        {formula.map((token, index) => {
          if (token.kind === "op") {
            return (
              <OperatorButton
                key={token.key}
                op={token.op}
                isError={problem?.keys.includes(token.key) ?? false}
                onChange={(op) => replace(token.key, { ...token, op })}
              />
            );
          }
          if (token.kind === "paren") {
            return (
              <UnstyledButton
                key={token.key}
                className={S.paren}
                aria-label="Remove group"
                onClick={() =>
                  setFormula(formula.filter((t) => t.key !== token.key))
                }
              >
                {token.side}
              </UnstyledButton>
            );
          }
          const info = measureInfo(token.measureId);
          const isMetric = token.measureId.startsWith("metric:");
          return (
            <Block
              key={token.key}
              name={measureName(token.measureId)}
              isMetric={isMetric}
              getMeasureItems={(query) => search(measureItems, query)}
              onPickMeasure={(item) =>
                replace(token.key, { ...token, measureId: item.id })
              }
              subtitle={info?.section}
              series={mockSeries(measureName(token.measureId), token.filters)}
              isError={problem?.keys.includes(token.key) ?? false}
              onRemove={() => removeTerm(index)}
              filters={token.filters}
              getFilterItems={(query, exclude) =>
                filtersForTerm(token.measureId, query, exclude)
              }
              onFiltersChange={(filters) =>
                replace(token.key, { ...token, filters })
              }
            />
          );
        })}
        <ItemPicker
          className={S.addBlockTarget}
          items={(query) => search(measureItems, query)}
          onPick={(item) => addTerm(item.id)}
        >
          <UnstyledButton className={S.addBlock}>
            <FixedSizeIcon name="add" size={14} />
            <Text c="inherit" fw={700}>
              {formula.length === 0 ? "Add a measure or metric" : "Add another"}
            </Text>
          </UnstyledButton>
        </ItemPicker>
      </Stack>
      {problem && (
        <Text size="sm" c="feedback-negative">
          {problem.message}
        </Text>
      )}
    </Stack>
  );
}

function Block({
  name,
  isMetric,
  getMeasureItems,
  onPickMeasure,
  subtitle,
  series,
  isError,
  onRemove,
  filters,
  getFilterItems,
  onFiltersChange,
}: {
  name: string;
  isMetric: boolean;
  getMeasureItems: (query: string) => BarItem[];
  onPickMeasure: (item: BarItem) => void;
  subtitle?: string;
  series: number[] | null;
  isError: boolean;
  onRemove: () => void;
  filters: string[];
  getFilterItems: (query: string, exclude: string[]) => BarItem[];
  onFiltersChange: (filters: string[]) => void;
}) {
  return (
    <Stack gap={0} className={cx(S.block, { [S.error]: isError })}>
      <Group gap={2} wrap="nowrap" className={S.blockActions}>
        <ItemPicker
          title="Filter by"
          items={(query) => getFilterItems(query, filters)}
          onPick={(item) => onFiltersChange([...filters, item.id])}
        >
          <Tooltip label="Add filter">
            <ActionIcon
              variant="subtle"
              c="text-secondary"
              aria-label="Add filter"
            >
              <FixedSizeIcon name="filter_plus" size={16} />
            </ActionIcon>
          </Tooltip>
        </ItemPicker>
        <Tooltip label="Remove">
          <ActionIcon
            variant="subtle"
            c="text-secondary"
            aria-label="Remove"
            onClick={onRemove}
          >
            <FixedSizeIcon name="trash" size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <ItemPicker items={getMeasureItems} onPick={onPickMeasure}>
        <UnstyledButton className={S.top}>
          {series && <BigNumber series={series} />}
          <Group
            gap="sm"
            pl="md"
            pr={series ? "md" : "5rem"}
            pt={series ? 4 : "sm"}
            pb="sm"
            wrap="nowrap"
          >
            <Text fz={17} fw={700} c="text-primary" truncate>
              {name}
            </Text>
            <Tooltip label={isMetric ? "Metric" : "Measure"}>
              <FixedSizeIcon
                name={isMetric ? "metric" : "ruler"}
                size={14}
                c="text-secondary"
              />
            </Tooltip>
          </Group>
        </UnstyledButton>
      </ItemPicker>
      {subtitle && (
        <Group className={S.row} px="md" gap="sm" wrap="nowrap">
          <FixedSizeIcon name="table" size={14} c="text-secondary" />
          <Text fz="sm" c="text-secondary" truncate>
            {subtitle}
          </Text>
        </Group>
      )}
      {filters.map((filter) => (
        <Group
          key={filter}
          className={cx(S.row, S.filterRow)}
          px="md"
          gap="sm"
          wrap="nowrap"
        >
          <FixedSizeIcon name="filter" size={14} c="text-filter" />
          <ItemPicker
            grow
            title="Filter by"
            initialQuery={filter}
            items={(query) =>
              getFilterItems(
                query,
                filters.filter((f) => f !== filter),
              )
            }
            onPick={(item) =>
              onFiltersChange(filters.map((f) => (f === filter ? item.id : f)))
            }
          >
            <UnstyledButton miw={0}>
              <Text fz="sm" fw={700} c="text-filter" truncate>
                {filter}
              </Text>
            </UnstyledButton>
          </ItemPicker>
          <ActionIcon
            size="sm"
            variant="subtle"
            c="text-secondary"
            className={S.rowRemove}
            aria-label="Remove filter"
            onClick={() => onFiltersChange(filters.filter((f) => f !== filter))}
          >
            <FixedSizeIcon name="close" size={12} />
          </ActionIcon>
        </Group>
      ))}
    </Stack>
  );
}

function OperatorButton({
  op,
  isError,
  onChange,
}: {
  op: Op;
  isError: boolean;
  onChange: (op: Op) => void;
}) {
  return (
    <Menu position="bottom">
      <Menu.Target>
        <UnstyledButton
          className={cx(S.operator, { [S.error]: isError })}
          aria-label="Change operator"
        >
          {op}
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {OP_ITEMS.map((item) => (
          <Menu.Item
            key={item.op}
            leftSection={
              <Text fw={700} w="1rem" ta="center">
                {item.op}
              </Text>
            }
            onClick={() => onChange(item.op)}
          >
            {item.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * A search box over the expression bar's suggestion list, in a popover. Like
 * the bar, a filter's column or operator fills the search instead of picking,
 * so the next step (operator, then value) shows up in the same list.
 */
function ItemPicker({
  items,
  onPick,
  children,
  grow = false,
  className,
  initialQuery = "",
  title,
}: {
  grow?: boolean;
  className?: string;
  initialQuery?: string;
  title?: string;
  items: (query: string) => BarItem[];
  onPick: (item: BarItem) => void;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const list = opened ? items(query) : [];
  const nav = useSuggestionList(list, query);
  const toggle = (next: boolean) => {
    setOpened(next);
    setQuery(initialQuery);
  };
  const pick = (item: BarItem) => {
    if (item.id.startsWith(DRAFT_PREFIX)) {
      setQuery(item.id.slice(DRAFT_PREFIX.length));
      return;
    }
    onPick(item);
    toggle(false);
  };

  return (
    <Popover
      opened={opened}
      onChange={toggle}
      position="bottom-start"
      shadow="md"
    >
      <Popover.Target>
        <Box
          onClick={() => toggle(!opened)}
          className={className}
          display="flex"
          miw={0}
          flex={grow ? 1 : undefined}
        >
          {children}
        </Box>
      </Popover.Target>
      <Popover.Dropdown p={0} w={DROPDOWN_WIDTH} className={ES.dropdown}>
        <Box p="xs" pb={0}>
          <TextInput
            autoFocus
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (!nav.handleKeyDown(event, pick) && event.key === "Escape") {
                toggle(false);
              }
            }}
          />
        </Box>
        <SuggestionList
          items={list}
          highlight={nav.highlight}
          isSearching={query.trim() !== ""}
          onHover={nav.setHighlight}
          onPick={pick}
          title={title}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

/** Mock monthly values, as the Metric Tree shows them, by the term's name. */
function mockSeries(name: string, filters: string[]): number[] | null {
  const measure = MEASURES.find((m) => m.name === name);
  if (measure) {
    return seriesOf(
      `measure:${measure.id}${filters.length > 0 ? `|${filters[0]}` : ""}`,
    );
  }
  const metric = Object.values(METRICS).find((m) => m.name === name);
  return metric ? seriesOf(metric.id) : null;
}

function BigNumber({ series }: { series: number[] }) {
  return (
    <Text
      ta="left"
      fz={32}
      lh={1.1}
      fw={700}
      c="text-primary"
      px="md"
      pt="md"
      pr="4.5rem"
    >
      {formatNumber(series.at(-1) ?? 0)}
    </Text>
  );
}
