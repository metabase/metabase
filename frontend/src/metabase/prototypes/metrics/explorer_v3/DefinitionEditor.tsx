import cx from "classnames";
import { useEffect, useRef, useState } from "react";

import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import S from "./Explorer.module.css";
import { type BarItem, InlineSuggest, TokenBar } from "./TokenBar";
import {
  type FormulaProblem,
  type FormulaToken,
  KEY_TO_OP,
  LOGIC_OPTIONS,
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
import { NEW_SEGMENT_PREFIX } from "./segments";

type Editing = { key: string; part: string };

/**
 * Where a pill's segments live: by name inside the pill ("inline"), or in the
 * panel under the bar when the pill is selected, the pill showing a count ("panel").
 */
export type SegmentPlacement = "inline" | "panel";

type Term = Extract<FormulaToken, { kind: "term" }>;

/**
 * The definition of a metric: math over measures in a keyboard-first bar,
 * each pill filtered only by segments, plus filters on the whole metric.
 */
export function DefinitionEditor({
  draft,
  onChange,
  measureItems,
  measureName,
  whereFilters,
  segmentsForTerm,
  segmentName,
  onNewSegment,
  extraProblem,
  placement,
}: {
  draft: MetricDraft;
  onChange: (draft: MetricDraft) => void;
  measureItems: BarItem[];
  measureName: (id: string) => string;
  /** Suggestions for a filter on the whole metric. */
  whereFilters: (query: string, exclude: string[]) => BarItem[];
  /** The segments a pill can use, then New segment. */
  segmentsForTerm: (
    measureId: string,
    query: string,
    exclude: string[],
  ) => BarItem[];
  segmentName: (id: string) => string;
  /** Opens the New segment flow for the pill, with a suggested name. */
  onNewSegment: (termKey: string, name: string) => void;
  extraProblem?: FormulaProblem | null;
  placement: SegmentPlacement;
}) {
  const { formula, where } = draft;
  const isPanel = placement === "panel";
  const setFormula = (next: FormulaToken[]) =>
    onChange({ ...draft, formula: next });
  const setWhere = (next: WhereToken[]) => onChange({ ...draft, where: next });

  const formulaInput = useRef<HTMLInputElement>(null);
  const whereInput = useRef<HTMLInputElement>(null);
  const segmentInput = useRef<HTMLInputElement>(null);
  const [filterHost, setFilterHost] = useState<string | null>(null);
  // The row under the bar: open while it has filters or was just opened.
  const [isWhereOpen, setIsWhereOpen] = useState(false);
  // Panel placement: the pill whose segments the row under the bar shows.
  const [panelTermKey, setPanelTermKey] = useState<string | null>(null);
  const panelTerm = formula.find(
    (token): token is Term =>
      token.kind === "term" && token.key === panelTermKey,
  );
  const showWhere = where.length > 0 || isWhereOpen;
  useEffect(() => {
    if (isWhereOpen) {
      whereInput.current?.focus();
    }
  }, [isWhereOpen]);
  useEffect(() => {
    if (panelTermKey != null) {
      segmentInput.current?.focus();
    }
  }, [panelTermKey]);
  const [editing, setEditing] = useState<Editing | null>(null);

  const problem = findProblem(formula, measureName) ?? extraProblem ?? null;
  const hasProblem = (key: string) => problem?.keys.includes(key) ?? false;

  const isEditing = (key: string, part: string) =>
    editing?.key === key && editing.part === part;

  const finish = (input = formulaInput) => {
    setEditing(null);
    input.current?.focus();
  };

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

  const removeToken = (key: string) => {
    setFormula(formula.filter((t) => t.key !== key));
    if (key === panelTermKey) {
      setPanelTermKey(null);
    }
  };

  /** Inline: the caret attaches to the pill. Panel: the pill's segments open below. */
  const startFilter = (key: string) => {
    if (isPanel) {
      setPanelTermKey(key);
      return;
    }
    setFilterHost(key);
    requestAnimationFrame(() => formulaInput.current?.focus());
  };

  /** A segment picked for a pill: add it, or open New segment. */
  const addSegment = (termKey: string, item: BarItem) => {
    if (item.id.startsWith(NEW_SEGMENT_PREFIX)) {
      onNewSegment(termKey, item.id.slice(NEW_SEGMENT_PREFIX.length));
      return;
    }
    updateTerm(termKey, (filters) => [...filters, item.id]);
  };

  const getFormulaItems = (query: string, caret: number): BarItem[] => {
    const host = formula.find((token) => token.key === filterHost);
    if (host?.kind === "term") {
      return segmentsForTerm(host.measureId, query, host.filters);
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
    const terms = formula.filter(
      (token): token is Term => token.kind === "term",
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
            ? `· ${term.filters.map(segmentName).join(" · ")}`
            : undefined,
        icon: "segment",
        aliases: ["|", "filter", "where", "segment"],
        section: "Segments",
        sectionIcon: "segment",
      }),
    );
    return [
      ...search(measureItems, query),
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
        startFilter(before.key);
      }
      return caret;
    }
    return null;
  };

  const pickFormulaItem = (item: BarItem, caret: number): number => {
    if (item.id.startsWith("filter-term:")) {
      startFilter(item.id.slice("filter-term:".length));
      return caret;
    }
    if (item.id.startsWith("logic:")) {
      return handleFormulaChar(item.id.slice("logic:".length), caret) ?? caret;
    }
    const host = formula.find((token) => token.key === filterHost);
    if (host != null) {
      addSegment(host.key, item);
      setFilterHost(null);
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
    const isPanelTerm = isPanel && token.key === panelTermKey;
    return (
      <span
        className={cx(S.pill, {
          [S.selected]: isSelected || isPanelTerm,
          [S.pillHost]: isHost,
          [S.error]: isError,
        })}
      >
        {isEditing(token.key, "measure") ? (
          <span className={cx(S.seg, S.segEditing)}>
            <InlineSuggest
              placeholder={name}
              getItems={(query) => search(measureItems, query)}
              onPick={(item) => {
                replaceToken(token.key, { ...token, measureId: item.id });
                finish();
              }}
              onCancel={(isEscape) => cancel(isEscape)}
            />
          </span>
        ) : isPanel ? (
          <button
            className={cx(S.seg, S.segMeasure, {
              [S.partSelected]: selectedPart === "measure",
            })}
            onClick={() => setPanelTermKey(isPanelTerm ? null : token.key)}
          >
            {name}
            {token.filters.length > 0 && (
              <span className={S.segmentCount}>
                <Icon name="filter" size={10} />
                {token.filters.length}
              </span>
            )}
          </button>
        ) : (
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
                leftSection={<Icon name="segment" />}
                onClick={() => startFilter(token.key)}
              >
                Add a segment
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
        )}
        {!isPanel &&
          token.filters.map((id) =>
            isEditing(token.key, `filter:${id}`) ? (
              <span key={id} className={cx(S.seg, S.segEditing)}>
                <span className={S.pipe}>·</span>
                <InlineSuggest
                  placeholder={segmentName(id)}
                  title="Segment"
                  getItems={(query) =>
                    segmentsForTerm(
                      token.measureId,
                      query,
                      token.filters.filter((f) => f !== id),
                    )
                  }
                  onPick={(item) => {
                    if (item.id.startsWith(NEW_SEGMENT_PREFIX)) {
                      updateTerm(token.key, (filters) =>
                        filters.filter((f) => f !== id),
                      );
                      onNewSegment(
                        token.key,
                        item.id.slice(NEW_SEGMENT_PREFIX.length),
                      );
                      setEditing(null);
                      return;
                    }
                    updateTerm(token.key, (filters) =>
                      filters.map((f) => (f === id ? item.id : f)),
                    );
                    finish();
                  }}
                  onCancel={(isEscape) => cancel(isEscape)}
                  onBackspaceEmpty={() => {
                    updateTerm(token.key, (filters) =>
                      filters.filter((f) => f !== id),
                    );
                    finish();
                  }}
                />
              </span>
            ) : (
              <button
                key={id}
                className={cx(S.seg, S.segFilter, {
                  [S.partSelected]: selectedPart === `filter:${id}`,
                })}
                onClick={() =>
                  setEditing({ key: token.key, part: `filter:${id}` })
                }
              >
                <span className={S.pipe}>·</span>
                {segmentName(id)}
              </button>
            ),
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
            title="Filter by"
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

  const renderSegmentToken = (
    token: { key: string },
    { isSelected }: { isSelected: boolean },
  ) => (
    <span className={cx(S.pill, { [S.selected]: isSelected })}>
      <span className={cx(S.seg, S.segFilter)}>
        <Icon name="segment" size={12} />
        {segmentName(token.key)}
      </span>
      <Icon
        name="close"
        size={12}
        className={S.removeIcon}
        aria-label="Remove"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          if (panelTerm) {
            updateTerm(panelTerm.key, (filters) =>
              filters.filter((f) => f !== token.key),
            );
          }
        }}
      />
    </span>
  );

  const formulaBar = (
    <TokenBar
      tokens={formula}
      inputRef={formulaInput}
      placeholder="Type a measure or metric, like Revenue − Cost"
      hasError={formula.some((token) => hasProblem(token.key))}
      renderToken={renderFormulaToken}
      isConnector={(token) => token.kind !== "term"}
      getItems={getFormulaItems}
      onPick={pickFormulaItem}
      onKeyChar={handleFormulaChar}
      onDelete={(index) => {
        removeToken(formula[index].key);
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
        token.kind === "term" && !isPanel
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
        return index + 1;
      }}
      inputHostKey={filterHost}
      title={filterHost != null ? "Add a segment" : undefined}
      hostPrefix={<span className={S.pipe}>·</span>}
      onExitHost={() => setFilterHost(null)}
    />
  );

  const whereBar = (
    <TokenBar
      tokens={where}
      inputRef={whereInput}
      placeholder="Filter the whole metric"
      renderToken={renderWhereToken}
      title="Filter by"
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

  const panelName = panelTerm ? measureName(panelTerm.measureId) : "";
  const segmentBar = panelTerm && (
    <TokenBar
      key={panelTerm.key}
      tokens={panelTerm.filters.map((id) => ({ key: id }))}
      inputRef={segmentInput}
      placeholder={`Add a segment to ${panelName}`}
      renderToken={renderSegmentToken}
      title="Add a segment"
      getItems={(query) =>
        segmentsForTerm(panelTerm.measureId, query, panelTerm.filters)
      }
      onPick={(item, caret) => {
        addSegment(panelTerm.key, item);
        return caret + 1;
      }}
      onDelete={(index) => {
        updateTerm(panelTerm.key, (filters) => filters.toSpliced(index, 1));
        return index;
      }}
      onOpenToken={() => undefined}
    />
  );

  const problemText = problem && (
    <Text size="sm" c="feedback-negative">
      {problem.message}
    </Text>
  );

  const filterButton = !showWhere && !panelTerm && (
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
  );

  return (
    <Stack gap="xs">
      <Box className={S.explorerBox}>
        <Group gap="xs" wrap="nowrap" align="flex-start" pr="sm">
          <Box flex={1} miw={0}>
            {formulaBar}
          </Box>
          {filterButton}
        </Group>
        {panelTerm ? (
          <Box className={S.explorerFilters} bg="background_page-filter">
            <Group gap="xs" wrap="nowrap" align="center" pl="md" pr="sm">
              <Text size="sm" fw="bold" c="text-secondary" className={S.nowrap}>
                {`Segments on ${panelName}`}
              </Text>
              <Box flex={1} miw={0}>
                {segmentBar}
              </Box>
              <Tooltip label="Back to filters on the whole metric">
                <ActionIcon
                  variant="subtle"
                  c="text-secondary"
                  aria-label="Close"
                  onClick={() => setPanelTermKey(null)}
                >
                  <Icon name="close" />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Box>
        ) : (
          showWhere && (
            <Box className={S.explorerFilters} bg="background_page-filter">
              {whereBar}
            </Box>
          )
        )}
      </Box>
      {problemText}
    </Stack>
  );
}
