import cx from "classnames";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Button,
  Group,
  HoverCard,
  Icon,
  Menu,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { getMeasure } from "../data";

import S from "./Explorer.module.css";
import { type BarItem, InlineSuggest, TokenBar } from "./TokenBar";
import { SEGMENT_PREFIX, filterLabel, segmentNameOf } from "./catalog";
import {
  FILTER_ITEMS,
  type FormulaProblem,
  type FormulaToken,
  KEY_TO_OP,
  LOGIC_OPTIONS,
  MEASURE_ITEMS,
  type MetricDraft,
  OP_OPTIONS,
  type WhereToken,
  endsOperand,
  findProblem,
  insertOp,
  insertOperand,
  newKey,
  search,
  toOp,
} from "./formula";

type Editing = { key: string; part: string };

/**
 * How a pill offers to filter its measure: an icon that slides out of the
 * pill on hover, a chip that floats under it on hover, or a menu that opens
 * when the pill is clicked.
 */
export type PillActions = "inline" | "chip" | "menu";

/**
 * The definition of a metric: math over measures in a keyboard-first bar,
 * plus filters on the whole metric. Controlled, so a modal can hold the draft.
 */
export function DefinitionEditor({
  draft,
  onChange,
  measureItems = MEASURE_ITEMS,
  measureName = (id) => getMeasure(id).name,
  layout = "stacked",
  whereFilters = (query, exclude) => search(FILTER_ITEMS, query, exclude),
  filtersForTerm = (_measureId, query, exclude) => whereFilters(query, exclude),
  extraProblem,
  pillActions = "inline",
  segmentFilter,
  canNameFilter,
  onNameFilter,
  aggregationItems = [],
  canSaveAsMeasure,
  onSaveAsMeasure,
  equivalentOf,
}: {
  draft: MetricDraft;
  onChange: (draft: MetricDraft) => void;
  /** What the bar offers as terms; the mock measures by default. */
  measureItems?: BarItem[];
  measureName?: (id: string) => string;
  /** "explorer": one box like the Explorer's bar, the Where row under it. */
  layout?: "stacked" | "explorer";
  /** Suggestions for a filter on the whole metric; the mock ones by default. */
  whereFilters?: (query: string, exclude: string[]) => BarItem[];
  /** Suggestions for a filter on one measure, like its table's columns. */
  filtersForTerm?: (
    measureId: string,
    query: string,
    exclude: string[],
  ) => BarItem[];
  /** A problem with the filters, shown once the formula itself is fine. */
  extraProblem?: FormulaProblem | null;
  pillActions?: PillActions;
  /** What a segment filters, for its tooltip. */
  segmentFilter?: (name: string) => string | undefined;
  /** Whether a typed-out filter on this pill can be named as a segment. */
  canNameFilter?: (measureId: string) => boolean;
  /** Called with the new segment; the pill then shows its name. */
  onNameFilter?: (measureId: string, filter: string, name: string) => void;
  /** Aggregations to type straight in, like Sum(Orders.Total); offered once typing. */
  aggregationItems?: BarItem[];
  /** Whether the pill is an inline aggregation that can be saved as a measure. */
  canSaveAsMeasure?: (measureId: string) => boolean;
  onSaveAsMeasure?: (measureId: string, name: string) => void;
  /** A saved measure that is the same aggregation, by its item id. */
  equivalentOf?: (measureId: string) => string | undefined;
}) {
  const { formula, where } = draft;
  const setFormula = (next: FormulaToken[]) =>
    onChange({ ...draft, formula: next });
  const setWhere = (next: WhereToken[]) => onChange({ ...draft, where: next });

  const formulaInput = useRef<HTMLInputElement>(null);
  const whereInput = useRef<HTMLInputElement>(null);
  const [filterHost, setFilterHost] = useState<string | null>(null);
  // The filter row under the bar: open while it has filters or was just opened.
  const [isWhereOpen, setIsWhereOpen] = useState(false);
  const showWhere = where.length > 0 || isWhereOpen;
  useEffect(() => {
    if (isWhereOpen) {
      whereInput.current?.focus();
    }
  }, [isWhereOpen]);
  const [editing, setEditing] = useState<Editing | null>(null);
  // The typed-out filter just added to a pill: its naming popup opens itself.
  const [naming, setNaming] = useState<{ key: string; filter: string } | null>(
    null,
  );

  const problem = findProblem(formula, measureName) ?? extraProblem ?? null;
  const searchTerms = (query: string) => [
    ...search(measureItems, query),
    ...(query.trim() === "" ? [] : search(aggregationItems, query)),
  ];
  const hasProblem = (key: string) => problem?.keys.includes(key) ?? false;

  const isEditing = (key: string, part: string) =>
    editing?.key === key && editing.part === part;

  /** Done with a pill part: Enter, Tab, Escape or Backspace. */
  const finish = (input = formulaInput) => {
    setEditing(null);
    input.current?.focus();
  };

  /** Left a pill part by clicking elsewhere: keep focus where it went. */
  const cancel = (isEscape: boolean, input = formulaInput) =>
    isEscape ? finish(input) : setEditing(null);

  const updateTerm = (key: string, filters: (current: string[]) => string[]) =>
    setFormula(
      formula.map((token) =>
        token.key === key && token.kind === "term"
          ? { ...token, filters: filters(token.filters) }
          : token,
      ),
    );

  const replaceToken = (key: string, token: FormulaToken) =>
    setFormula(formula.map((t) => (t.key === key ? token : t)));

  const removeToken = (key: string) =>
    setFormula(formula.filter((t) => t.key !== key));

  /** Attaches the caret to the pill, to type a filter on its measure. */
  const startFilter = (key: string) => {
    setFilterHost(key);
    // After the menu or the chip let go of the focus.
    requestAnimationFrame(() => formulaInput.current?.focus());
  };

  const getFormulaItems = (query: string, caret: number): BarItem[] => {
    const host = formula.find((token) => token.key === filterHost);
    if (host?.kind === "term") {
      return filtersForTerm(host.measureId, query, host.filters);
    }
    const before = formula[caret - 1];
    const afterOperand = endsOperand(before);
    const depth = formula
      .slice(0, caret)
      .reduce(
        (acc, token) =>
          token.kind === "paren" ? acc + (token.side === "(" ? 1 : -1) : acc,
        0,
      );
    const isAllowed = (key: string) => {
      if (key === "(") {
        return true;
      }
      if (key === ")") {
        return depth > 0 && afterOperand;
      }
      return afterOperand || before?.kind === "op";
    };
    const logic = LOGIC_OPTIONS.map(
      ({ key, label, description }): BarItem => ({
        id: `logic:${key}`,
        label,
        description,
        aliases: [key],
        section: "Logic",
        sectionIcon: "function",
        disabled: !isAllowed(key),
      }),
    );
    // At the bottom: filter any measure in the formula, the one before the
    // caret first. Typing "filter" (or "|") finds them.
    const terms = formula.filter(
      (token): token is Extract<FormulaToken, { kind: "term" }> =>
        token.kind === "term",
    );
    const ordered =
      before?.kind === "term"
        ? [before, ...terms.filter((t) => t.key !== before.key)]
        : terms;
    const filterOptions = ordered.map(
      (term): BarItem => ({
        id: `filter-term:${term.key}`,
        label: `Filter ${measureName(term.measureId)}`,
        description:
          term.filters.length > 0
            ? `| ${term.filters.map(filterLabel).join(", ")}`
            : undefined,
        icon: "filter",
        aliases: ["|", "filter", "where"],
        section: "Filter",
        sectionIcon: "filter",
      }),
    );
    return [
      ...searchTerms(query),
      ...search(logic, query),
      ...search(filterOptions, query),
    ];
  };

  const handleFormulaChar = (char: string, caret: number): number | null => {
    const op = KEY_TO_OP[char];
    if (op != null) {
      const result = insertOp(formula, caret, op);
      setFormula(result.tokens);
      return result.caret;
    }
    if (char === "(") {
      const result = insertOperand(formula, caret, {
        key: newKey(),
        kind: "paren",
        side: "(",
      });
      setFormula(result.tokens);
      return result.caret;
    }
    if (char === ")") {
      setFormula(
        formula.toSpliced(caret, 0, {
          key: newKey(),
          kind: "paren",
          side: ")",
        }),
      );
      return caret + 1;
    }
    if (char === "|") {
      const before = formula[caret - 1];
      if (before?.kind === "term") {
        setFilterHost(before.key);
      }
      return caret;
    }
    return null;
  };

  const pickFormulaItem = (item: BarItem, caret: number): number => {
    if (item.id.startsWith("filter-term:")) {
      setFilterHost(item.id.slice("filter-term:".length));
      return caret;
    }
    if (item.id.startsWith("logic:")) {
      return handleFormulaChar(item.id.slice("logic:".length), caret) ?? caret;
    }
    const host = formula.find((token) => token.key === filterHost);
    if (host != null) {
      updateTerm(host.key, (filters) => [...filters, item.id]);
      setFilterHost(null);
      const canName =
        host.kind === "term" &&
        onNameFilter != null &&
        (canNameFilter?.(host.measureId) ?? false);
      if (canName && segmentNameOf(item.id) == null) {
        setNaming({ key: host.key, filter: item.id });
      }
      return caret;
    }
    const result = insertOperand(formula, caret, {
      key: newKey(),
      kind: "term",
      measureId: item.id,
      filters: [],
    });
    setFormula(result.tokens);
    return result.caret;
  };

  const renderFormulaToken = (
    token: FormulaToken,
    {
      isSelected,
      isHost,
      selectedPart,
    }: { isSelected: boolean; isHost: boolean; selectedPart: string | null },
  ) => {
    const isError = hasProblem(token.key);

    if (token.kind === "paren") {
      return (
        <button
          className={cx(S.connector, S.connectorRemovable, {
            [S.selected]: isSelected,
            [S.error]: isError,
          })}
          aria-label="Remove"
          onClick={() => removeToken(token.key)}
        >
          <span className={S.connectorLabel}>{token.side}</span>
          <span className={S.connectorIcon}>
            <Icon name="close" size={12} />
          </span>
        </button>
      );
    }

    if (token.kind === "op") {
      if (isEditing(token.key, "op")) {
        return (
          <span className={cx(S.connector, S.connectorEditing)}>
            <InlineSuggest
              placeholder={token.op}
              getItems={(query) => search(OP_OPTIONS, query)}
              onPick={(item) => {
                replaceToken(token.key, { ...token, op: toOp(item.id) });
                finish();
              }}
              onCancel={(isEscape) => cancel(isEscape)}
              onBackspaceEmpty={() => {
                removeToken(token.key);
                finish();
              }}
            />
          </span>
        );
      }
      return (
        <button
          className={cx(S.connector, {
            [S.selected]: isSelected,
            [S.error]: isError,
          })}
          onClick={() => setEditing({ key: token.key, part: "op" })}
        >
          {token.op}
        </button>
      );
    }

    const name = measureName(token.measureId);
    const pill = (
      <span
        className={cx(S.pill, {
          [S.selected]: isSelected,
          [S.pillHost]: isHost,
          [S.error]: isError,
        })}
      >
        {isEditing(token.key, "measure") ? (
          <span className={cx(S.seg, S.segEditing)}>
            <InlineSuggest
              placeholder={name}
              getItems={searchTerms}
              onPick={(item) => {
                replaceToken(token.key, { ...token, measureId: item.id });
                finish();
              }}
              onCancel={(isEscape) => cancel(isEscape)}
              onBackspaceEmpty={() => {
                removeToken(token.key);
                finish();
              }}
            />
          </span>
        ) : pillActions === "menu" ? (
          <Menu position="bottom-start" offset={8}>
            <Menu.Target>
              <button
                className={cx(S.seg, S.segMeasure, {
                  [S.partSelected]: selectedPart === "measure",
                })}
              >
                {name}
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="filter" />}
                onClick={() => startFilter(token.key)}
              >
                {`Filter ${name}`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="refresh" />}
                onClick={() => setEditing({ key: token.key, part: "measure" })}
              >
                Replace
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="close" />}
                onClick={() => removeToken(token.key)}
              >
                Remove
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ) : (
          <button
            className={cx(S.seg, S.segMeasure, {
              [S.partSelected]: selectedPart === "measure",
            })}
            onClick={() => setEditing({ key: token.key, part: "measure" })}
          >
            {name}
          </button>
        )}
        {onSaveAsMeasure && canSaveAsMeasure?.(token.measureId) && (
          <SaveAsMeasure
            equivalent={equivalentOf?.(token.measureId)}
            equivalentName={measureName}
            onSave={(measureName) =>
              onSaveAsMeasure(token.measureId, measureName)
            }
            onUseEquivalent={(id) =>
              setFormula(
                formula.map((t) =>
                  t.kind === "term" && t.measureId === token.measureId
                    ? { ...t, measureId: id }
                    : t,
                ),
              )
            }
          />
        )}
        {token.filters.map((filter) =>
          isEditing(token.key, `filter:${filter}`) ? (
            <span key={filter} className={S.filterPart}>
              <span className={S.pipe}>|</span>
              <span className={cx(S.seg, S.segEditing)}>
                <InlineSuggest
                  placeholder={filterLabel(filter)}
                  initialQuery={filterLabel(filter)}
                  title={t`Filter by`}
                  getItems={(query) =>
                    filtersForTerm(
                      token.measureId,
                      query,
                      token.filters.filter((f) => f !== filter),
                    )
                  }
                  onPick={(item) => {
                    updateTerm(token.key, (filters) =>
                      filters.map((f) => (f === filter ? item.id : f)),
                    );
                    finish();
                  }}
                  onCancel={(isEscape) => cancel(isEscape)}
                  onBackspaceEmpty={() => {
                    updateTerm(token.key, (filters) =>
                      filters.filter((f) => f !== filter),
                    );
                    finish();
                  }}
                />
              </span>
            </span>
          ) : (
            <span key={filter} className={S.filterPart}>
              <span className={S.pipe}>|</span>
              <Tooltip
                label={segmentFilter?.(segmentNameOf(filter) ?? "")}
                disabled={segmentNameOf(filter) == null}
              >
                <button
                  className={cx(S.seg, S.segFilter, {
                    [S.partSelected]: selectedPart === `filter:${filter}`,
                  })}
                  onClick={() =>
                    setEditing({ key: token.key, part: `filter:${filter}` })
                  }
                >
                  {segmentNameOf(filter) != null && (
                    <Icon name="segment" size={12} />
                  )}
                  {filterLabel(filter)}
                </button>
              </Tooltip>
              {segmentNameOf(filter) == null &&
                onNameFilter &&
                canNameFilter?.(token.measureId) && (
                  <NameFilter
                    defaultOpen={
                      naming?.key === token.key && naming.filter === filter
                    }
                    onClose={() => setNaming(null)}
                    onSave={(segmentName) => {
                      onNameFilter(token.measureId, filter, segmentName);
                      updateTerm(token.key, (filters) =>
                        filters.map((f) =>
                          f === filter ? `${SEGMENT_PREFIX}${segmentName}` : f,
                        ),
                      );
                    }}
                  />
                )}
            </span>
          ),
        )}
        {pillActions === "inline" && (
          <Tooltip label={`Filter ${name}`}>
            <button
              className={S.addFilter}
              aria-label={`Filter ${name}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                startFilter(token.key);
              }}
            >
              <Icon name="filter" size={12} />
            </button>
          </Tooltip>
        )}
        <Icon
          name="close"
          size={12}
          className={S.removeIcon}
          aria-label="Remove"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            removeToken(token.key);
          }}
        />
      </span>
    );
    if (pillActions !== "chip") {
      return pill;
    }
    return (
      <HoverCard
        position="bottom-start"
        offset={2}
        openDelay={150}
        closeDelay={100}
        disabled={isHost || editing?.key === token.key}
      >
        <HoverCard.Target>{pill}</HoverCard.Target>
        <HoverCard.Dropdown className={S.filterChipDropdown}>
          <button
            className={S.filterChip}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => startFilter(token.key)}
          >
            <Icon name="filter_plus" size={12} />
            Filter
          </button>
        </HoverCard.Dropdown>
      </HoverCard>
    );
  };

  const renderWhereToken = (
    token: WhereToken,
    { isSelected }: { isSelected: boolean },
  ) => (
    <span
      className={cx(S.pill, {
        [S.selected]: isSelected,
        [S.error]: hasProblem(token.key),
      })}
    >
      {isEditing(token.key, "where") ? (
        <span className={cx(S.seg, S.segEditing)}>
          <InlineSuggest
            placeholder={token.filter}
            initialQuery={token.filter}
            title={t`Filter by`}
            getItems={(query) =>
              whereFilters(
                query,
                where.filter((w) => w.key !== token.key).map((w) => w.filter),
              )
            }
            onPick={(item) => {
              setWhere(
                where.map((w) =>
                  w.key === token.key ? { ...w, filter: item.id } : w,
                ),
              );
              finish(whereInput);
            }}
            onCancel={(isEscape) => cancel(isEscape, whereInput)}
            onBackspaceEmpty={() => {
              setWhere(where.filter((w) => w.key !== token.key));
              finish(whereInput);
            }}
          />
        </span>
      ) : (
        <button
          className={cx(S.seg, S.segFilter)}
          onClick={() => setEditing({ key: token.key, part: "where" })}
        >
          {token.filter}
        </button>
      )}
      <Icon
        name="close"
        size={12}
        className={S.removeIcon}
        aria-label="Remove"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          setWhere(where.filter((w) => w.key !== token.key));
        }}
      />
    </span>
  );

  const formulaBar = (
    <TokenBar
      tokens={formula}
      inputRef={formulaInput}
      placeholder={
        layout === "explorer"
          ? "Type a measure or metric, like Revenue − Cost"
          : "Type a measure, like Revenue"
      }
      hasError={formula.some((token) => hasProblem(token.key))}
      renderToken={renderFormulaToken}
      isConnector={(token) => token.kind !== "term"}
      getItems={getFormulaItems}
      onPick={pickFormulaItem}
      onKeyChar={handleFormulaChar}
      onDelete={(index) => {
        setFormula(formula.toSpliced(index, 1));
        return index;
      }}
      onOpenToken={(index) => {
        const token = formula[index];
        if (token.kind === "paren") {
          removeToken(token.key);
        } else {
          setEditing({
            key: token.key,
            part: token.kind === "term" ? "measure" : "op",
          });
        }
      }}
      getParts={(token) =>
        token.kind === "term"
          ? ["measure", ...token.filters.map((f) => `filter:${f}`)]
          : []
      }
      onOpenPart={(index, part) =>
        setEditing({ key: formula[index].key, part })
      }
      onDeletePart={(index, part) => {
        const token = formula[index];
        if (part === "measure") {
          removeToken(token.key);
          return index;
        }
        const filter = part.slice("filter:".length);
        updateTerm(token.key, (filters) => filters.filter((f) => f !== filter));
        // After the pill, so the next arrow steps back into it.
        return index + 1;
      }}
      inputHostKey={filterHost}
      title={filterHost != null ? t`Filter by` : undefined}
      hostPrefix={<span className={S.pipe}>|</span>}
      onExitHost={() => setFilterHost(null)}
    />
  );

  const whereBar = (
    <TokenBar
      tokens={where}
      inputRef={whereInput}
      placeholder={
        layout === "explorer"
          ? "Filter the whole metric"
          : "Add a filter or segment"
      }
      renderToken={renderWhereToken}
      title={t`Filter by`}
      getItems={(query) =>
        whereFilters(
          query,
          where.map((w) => w.filter),
        )
      }
      onPick={(item, caret) => {
        setWhere(where.toSpliced(caret, 0, { key: newKey(), filter: item.id }));
        return caret + 1;
      }}
      onDelete={(index) => {
        setWhere(where.toSpliced(index, 1));
        return index;
      }}
      onOpenToken={(index) =>
        setEditing({ key: where[index].key, part: "where" })
      }
      onBlur={() => setIsWhereOpen(false)}
    />
  );

  const problemText = problem && (
    <Text size="sm" c="feedback-negative">
      {problem.message}
    </Text>
  );

  if (layout === "explorer") {
    return (
      <Stack gap="xs">
        {/* The Metric Explorer's search box: the formula on top, the filters
            in their own tinted row under it. */}
        <Box className={S.explorerBox}>
          <Group gap="xs" wrap="nowrap" align="flex-start" pr="sm">
            <Box flex={1} miw={0}>
              {formulaBar}
            </Box>
            {!showWhere && (
              <Tooltip label="Filter the whole metric">
                <ActionIcon
                  mt="sm"
                  variant="subtle"
                  c="text-filter"
                  aria-label="Filter the whole metric"
                  onClick={() => setIsWhereOpen(true)}
                >
                  <Icon name="filter_plus" />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
          {showWhere && (
            <Box className={S.explorerFilters} bg="background_page-filter">
              {whereBar}
            </Box>
          )}
        </Box>
        {problemText}
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Text fw={700}>Definition</Text>
        {formulaBar}
        {problemText}
      </Stack>

      <Stack gap="sm">
        <Text fw={700}>Filter the whole metric</Text>
        {whereBar}
      </Stack>
    </Stack>
  );
}

/**
 * Gives a typed-out filter a name: it becomes a segment on the measure's
 * table, and the pill reads "Revenue | Large orders".
 */
function NameFilter({
  defaultOpen,
  onClose,
  onSave,
}: {
  /** Open from the start, for a filter that was just typed. */
  defaultOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  return (
    <NamePopover
      defaultOpen={defaultOpen}
      onClose={onClose}
      onSave={onSave}
      label="Name this filter"
      icon="label"
      placeholder="Like Large orders"
      actionLabel="Save segment"
    />
  );
}

/**
 * Turns an inline aggregation into a named measure on its table, so other
 * metrics can reuse it. Offers the saved measure it duplicates, if any.
 */
function SaveAsMeasure({
  equivalent,
  equivalentName,
  onSave,
  onUseEquivalent,
}: {
  equivalent?: string;
  equivalentName: (id: string) => string;
  onSave: (name: string) => void;
  onUseEquivalent: (id: string) => void;
}) {
  return (
    <NamePopover
      defaultOpen={false}
      onClose={() => undefined}
      onSave={onSave}
      label="Save as measure"
      icon="bookmark"
      placeholder="Like Revenue"
      actionLabel="Save measure"
      note={
        equivalent ? (
          <Group gap="xs" wrap="nowrap" justify="space-between">
            <Text size="sm" c="text-secondary">
              {`Same as ${equivalentName(equivalent)}.`}
            </Text>
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => onUseEquivalent(equivalent)}
            >
              {`Use ${equivalentName(equivalent)}`}
            </Button>
          </Group>
        ) : (
          <Text size="sm" c="text-secondary">
            Name it to reuse it in other metrics.
          </Text>
        )
      }
    />
  );
}

function NamePopover({
  defaultOpen,
  onClose,
  onSave,
  label,
  icon,
  placeholder,
  actionLabel,
  note,
}: {
  defaultOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  label: string;
  icon: IconName;
  placeholder: string;
  actionLabel: string;
  note?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const toggle = (next: boolean) => {
    setIsOpen(next);
    if (!next) {
      onClose();
    }
  };
  const save = () => {
    if (trimmed !== "") {
      onSave(trimmed);
      toggle(false);
    }
  };
  return (
    <Popover
      opened={isOpen}
      onChange={toggle}
      position="bottom-start"
      trapFocus
    >
      <Popover.Target>
        <Tooltip label={label} disabled={isOpen}>
          <button
            className={S.nameFilter}
            aria-label={label}
            onClick={() => toggle(!isOpen)}
          >
            <Icon name={icon} size={12} />
          </button>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm" p="md" w="18rem">
          {note}
          <TextInput
            data-autofocus
            placeholder={placeholder}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                save();
              }
            }}
          />
          <Group justify="flex-end">
            <Button
              variant="filled"
              size="compact-md"
              disabled={trimmed === ""}
              onClick={save}
            >
              {actionLabel}
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
