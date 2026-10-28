import cx from "classnames";
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Modal,
  Popover,
  Text,
  Textarea,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel, toFilterClause } from "../../harness/clauses";
import {
  CLOSE_PAREN,
  OPEN_PAREN,
  type Token,
  filterToken,
  insertToken,
  opToken,
  parseTokens,
  readTokens,
  removeTokenAt,
  replaceTokenAt,
  toggleOperator,
  writeTokens,
} from "../expression-bar-2/tokens";
import type { ExpressionBarProps } from "../expression-bar-drill/ExpressionBar";
import {
  LogicColumnList,
  matchLogic,
} from "../expression-bar-drill/LogicColumnList";

import S from "./ExpressionBar.module.css";
import {
  CANNED_METABOT_PROMPT,
  FAKE_LLM_DELAY_MS,
  type Summary,
  type TokenRange,
  countFilters,
  generateSummaryLabel,
  getAutoRanges,
  normalizeRange,
  withMetabotFilters,
} from "./summaries";

type SummarizeMode = "select" | "auto";

/** Drag across filters, then "Summarize" in the floating toolbar. */
export function SelectSummarizeBar(props: ExpressionBarProps) {
  return <ExpressionBar {...props} mode="select" />;
}

/** One "Summarize" button by Apply; Metabot picks the groups. */
export function AutoSummarizeBar(props: ExpressionBarProps) {
  return <ExpressionBar {...props} mode="auto" />;
}

const MIN_DRAG_DISTANCE = 4;
const MIN_FILTERS_TO_AUTO_SUMMARIZE = 4;

/**
 * High-fidelity take on the expression bar, sitting where the QB filter panel
 * sits. You type in the bar itself; the popover under the caret is the app's
 * filter column list with a "Logic" section (and, or, parentheses) on top,
 * and the best match is highlighted as you type. Only a picked column turns
 * into a pill, while its value is set.
 */
function ExpressionBar({
  query,
  stageIndex,
  onChange,
  mode,
}: ExpressionBarProps & { mode: SummarizeMode }) {
  const committedTokens = useMemo(
    () => readTokens(query, stageIndex),
    [query, stageIndex],
  );
  const [tokens, setTokens] = useState(committedTokens);
  const [caret, setCaret] = useState(committedTokens.length);
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  // Arrow keys mean the next Enter picks from the list, not "apply".
  const [hasNavigated, setHasNavigated] = useState(false);
  const [draftColumn, setDraftColumn] = useState<Lib.ColumnMetadata>();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const shouldRefocusRef = useRef(false);
  const flashed = useFlashedLabels(query, stageIndex, committedTokens);

  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const summarizer = useSummaries(query, stageIndex, tokensRef);
  const { summaries, setSummaries } = summarizer;

  // External query changes (drills, examples) reset the draft. Summaries
  // follow their tokens by position, since applying re-reads every clause.
  useEffect(() => {
    const previous = tokensRef.current;
    setSummaries((summaries) =>
      summaries.flatMap((summary) => {
        const next = summary.tokens
          .map((token) => committedTokens[previous.indexOf(token)])
          .filter((token) => token != null);
        return next.length > 0 ? [{ ...summary, tokens: next }] : [];
      }),
    );
    setTokens(committedTokens);
    setCaret(committedTokens.length);
  }, [committedTokens, setSummaries]);

  const ranges = useMemo(
    () => getCollapsedRanges(tokens, summaries),
    [tokens, summaries],
  );
  const selection = useDragSelection(tokens, mode === "select");

  const focusInput = () => {
    shouldRefocusRef.current = true;
  };
  useLayoutEffect(() => {
    if (shouldRefocusRef.current) {
      shouldRefocusRef.current = false;
      inputRef.current?.focus();
    }
  });

  // Removing tokens can leave the caret past the end; clamp it. A caret
  // inside a collapsed summary sits right after it.
  const caretIndex = getVisibleCaret(Math.min(caret, tokens.length), ranges);
  const isDirty = tokens !== committedTokens;
  const parsed = useMemo(() => parseTokens(tokens), [tokens]);
  const errorPosition = parsed.ok ? undefined : parsed.position;
  const parenDepths = useMemo(() => getParenDepths(tokens), [tokens]);

  // Typing toward a keyword highlights it in the logic row, not a column.
  const logicMatch = hasNavigated ? undefined : matchLogic(text);
  useSearchSync(listRef, text, isOpen && draftColumn == null, !logicMatch);

  const resetDraft = () => {
    setText("");
    setHasNavigated(false);
    setDraftColumn(undefined);
  };

  const close = () => {
    resetDraft();
    setIsOpen(false);
  };

  const moveCaret = (index: number) => {
    resetDraft();
    setCaret(index);
    setIsOpen(true);
    focusInput();
  };

  const insert = (token: Token) => {
    const next = insertToken(tokens, caretIndex, token);
    setTokens(next.tokens);
    setCaret(next.caret);
    resetDraft();
    focusInput();
  };

  const handlePickFilter = (filterable: Lib.Filterable) => {
    insert(filterToken(toFilterClause(query, stageIndex, filterable)));
  };

  const commit = () => {
    if (parsed.ok && isDirty) {
      onChange(writeTokens(query, stageIndex, tokens));
    }
    close();
    inputRef.current?.blur();
    if (mode === "select") {
      summarizer.collapseAll();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;

    if (event.key === "(" || event.key === ")") {
      event.preventDefault();
      insert(event.key === "(" ? OPEN_PAREN : CLOSE_PAREN);
      return;
    }
    if (event.key === " " && logicMatch) {
      event.preventDefault();
      insert(logicMatch.token);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (logicMatch) {
        insert(logicMatch.token);
      } else if (isOpen && (text.trim().length > 0 || hasNavigated)) {
        forwardKey(listRef, "Enter");
      } else {
        commit();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setHasNavigated(true);
      forwardKey(listRef, event.key);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (text.length > 0) {
        resetDraft();
      } else {
        close();
        input.blur();
      }
      return;
    }
    if (event.key === "Backspace" && text.length === 0 && caretIndex > 0) {
      event.preventDefault();
      setTokens(removeTokenAt(tokens, caretIndex - 1));
      setCaret(caretIndex - 1);
      return;
    }
    if (
      event.key === "ArrowLeft" &&
      input.selectionStart === 0 &&
      caretIndex > 0
    ) {
      event.preventDefault();
      moveCaret(caretIndex - 1);
      return;
    }
    if (
      event.key === "ArrowRight" &&
      input.selectionEnd === text.length &&
      caretIndex < tokens.length
    ) {
      event.preventDefault();
      moveCaret(caretIndex + 1);
    }
  };

  const handleBarClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      moveCaret(tokens.length);
    }
  };

  const removeRange = ({ start, end }: TokenRange) => {
    // Take one neighbouring connector along, so the expression stays valid.
    const hasOpBefore = tokens[start - 1]?.type === "op";
    const from = hasOpBefore ? start - 1 : start;
    const to = !hasOpBefore && tokens[end + 1]?.type === "op" ? end + 1 : end;
    setTokens(tokens.filter((_, index) => index < from || index > to));
    setCaret(from);
  };

  const handleSummarizeSelection = () => {
    if (selection.range) {
      summarizer.summarize([selection.range], tokens);
      selection.clear();
    }
  };

  const hasCollapsed = ranges.length > 0;
  const hasExpanded = summaries.some((summary) => summary.isExpanded);
  // Expanded summaries fold back on blur in the select direction; in the
  // auto one the Summarize button does it (and rewrites the phrases).
  useCollapseOnBlur(
    selection.containerRef,
    mode === "select" && hasExpanded,
    summarizer.collapseAll,
  );
  const canAutoSummarize =
    mode === "auto" &&
    (!hasCollapsed || hasExpanded) &&
    countFilters(tokens) >= MIN_FILTERS_TO_AUTO_SUMMARIZE;

  // Plain text at the caret; a pill only once a column is picked.
  const caretView = (
    <Popover
      opened={isOpen}
      position="bottom-start"
      trapFocus={false}
      returnFocus={false}
      transitionProps={{ duration: 0 }}
      onChange={(opened) => !opened && close()}
    >
      <Popover.Target>
        {draftColumn ? (
          <span className={S.typingPill}>
            <span className={S.typingColumn}>
              {Lib.displayInfo(query, stageIndex, draftColumn).longDisplayName}
            </span>
            <Icon
              name="close"
              size={12}
              className={S.typingClose}
              aria-label={t`Cancel`}
              onClick={() => {
                resetDraft();
                focusInput();
              }}
            />
          </span>
        ) : (
          <span className={cx(S.typing, { [S.typingIdle]: !isOpen })}>
            <input
              ref={inputRef}
              className={S.input}
              style={{ width: `calc(${text.length}ch + 2px)` }}
              value={text}
              aria-label={t`Filter expression`}
              onChange={(event) => {
                setText(event.target.value);
                setHasNavigated(false);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
            />
          </span>
        )}
      </Popover.Target>
      <Popover.Dropdown data-testid="filter-picker-dropdown">
        {draftColumn ? (
          <FilterPickerBody
            query={query}
            stageIndex={stageIndex}
            column={draftColumn}
            isNew
            onChange={(filter) => handlePickFilter(filter)}
            onBack={() => {
              setDraftColumn(undefined);
              focusInput();
            }}
          />
        ) : (
          <LogicColumnList
            listRef={listRef}
            query={query}
            stageIndex={stageIndex}
            onFocusSteal={() => inputRef.current?.focus()}
            text={text}
            isLogicHighlightable={logicMatch != null}
            onPickToken={insert}
            onPickColumn={(column) => {
              setText("");
              setDraftColumn(column);
            }}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );

  return (
    <Box pos="relative" ref={selection.containerRef}>
      <Box
        className={cx(S.bar, { [S.barInvalid]: !parsed.ok })}
        onClick={handleBarClick}
        {...selection.barHandlers}
        data-testid="qb-filters-panel"
      >
        {/* One keyed array holds the caret so React moves it instead of remounting it. */}
        {[
          ...tokens.flatMap((token, index) => {
            const range = ranges.find(
              ({ start, end }) => index >= start && index <= end,
            );
            if (range && index !== range.start) {
              return [];
            }
            const end = range?.end ?? index;
            return [
              index === caretIndex ? (
                <CaretSlot key="caret">{caretView}</CaretSlot>
              ) : (
                <Gap
                  key={`gap-${index}`}
                  isSelected={
                    selection.isSelected(index - 1) &&
                    selection.isSelected(index)
                  }
                  onClick={() => moveCaret(index)}
                />
              ),
              <span
                key={`token-${index}`}
                className={cx(S.tokenWrap, {
                  [S.tokenSelected]: selection.isSelected(index),
                })}
                data-token-index={index}
                data-token-end={end}
              >
                {range ? (
                  <SummaryPill
                    summary={range.summary}
                    tokens={tokens.slice(range.start, range.end + 1)}
                    onExpand={() =>
                      summarizer.setExpanded(range.summary.id, true)
                    }
                    onRemove={() => removeRange(range)}
                  />
                ) : (
                  <TokenView
                    query={query}
                    stageIndex={stageIndex}
                    token={token}
                    depth={parenDepths[index]}
                    hasError={index === errorPosition}
                    isFlashed={
                      token.type === "filter" &&
                      flashed.has(
                        getFilterLabel(query, stageIndex, token.clause),
                      )
                    }
                    onReplace={(next) =>
                      setTokens(replaceTokenAt(tokens, index, next))
                    }
                    onRemove={() => {
                      const next = removeTokenAt(tokens, index);
                      setTokens(next);
                      setCaret(Math.min(caretIndex, next.length));
                    }}
                  />
                )}
              </span>,
            ];
          }),
          caretIndex === tokens.length ? (
            <CaretSlot key="caret">{caretView}</CaretSlot>
          ) : (
            <Gap
              key="gap-end"
              isSelected={false}
              onClick={() => moveCaret(tokens.length)}
            />
          ),
        ]}
        {tokens.length === 0 && text === "" && draftColumn == null && (
          <span className={S.placeholder}>{t`Type to filter…`}</span>
        )}
        {(!parsed.ok || isDirty || mode === "auto" || mode === "select") && (
          <Group gap="sm" ml="auto" pl="md" wrap="nowrap">
            {mode === "select" && (
              <MetabotFilterButton
                query={query}
                stageIndex={stageIndex}
                onChange={onChange}
              />
            )}
            {canAutoSummarize && (
              <MetabotButton
                onClick={() =>
                  summarizer.summarize(
                    getAutoRanges(query, stageIndex, tokens),
                    tokens,
                  )
                }
              />
            )}
            {mode === "auto" && hasCollapsed && (
              <Button
                size="compact-sm"
                variant="subtle"
                onClick={() => setSummaries([])}
              >
                {t`Show all filters`}
              </Button>
            )}
            {!parsed.ok && (
              <Text size="sm" c="feedback-negative" lh="1">
                {parsed.error}
              </Text>
            )}
            {isDirty && (
              <Button
                size="compact-sm"
                variant="filled"
                disabled={!parsed.ok}
                onClick={commit}
              >
                {t`Apply`}
              </Button>
            )}
          </Group>
        )}
      </Box>
      {selection.anchor && (
        <Box
          className={S.floating}
          style={{ left: selection.anchor.left, top: selection.anchor.top }}
        >
          <Box className={S.floatingMenu}>
            <button
              type="button"
              className={S.floatingRow}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleSummarizeSelection}
            >
              <Icon name="metabot" c="icon-brand" />
              {t`Summarize`}
            </button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function MetabotButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="compact-sm"
      variant="default"
      leftSection={<Icon name="metabot" c="icon-brand" />}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      {t`Summarize`}
    </Button>
  );
}

type CollapsedRange = TokenRange & { summary: Summary };

/** Every member still there, and nothing new between them. */
function isUnedited(tokens: Token[], members: Token[]): boolean {
  const start = tokens.indexOf(members[0]);
  return (
    start >= 0 &&
    members.every((member, offset) => tokens[start + offset] === member)
  );
}

function getCollapsedRanges(
  tokens: Token[],
  summaries: Summary[],
): CollapsedRange[] {
  return summaries.flatMap((summary) => {
    if (summary.isExpanded) {
      return [];
    }
    const members = new Set(summary.tokens);
    const indexes = tokens.flatMap((token, index) =>
      members.has(token) ? [index] : [],
    );
    return indexes.length > 0
      ? [{ summary, start: Math.min(...indexes), end: Math.max(...indexes) }]
      : [];
  });
}

function getVisibleCaret(caret: number, ranges: TokenRange[]): number {
  const range = ranges.find(({ start, end }) => caret > start && caret <= end);
  return range ? range.end + 1 : caret;
}

function useSummaries(
  query: Lib.Query,
  stageIndex: number,
  tokensRef: RefObject<Token[]>,
) {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const nextIdRef = useRef(0);

  const summarize = (ranges: TokenRange[], tokens: Token[]) => {
    const created = ranges.map((range) => ({
      id: nextIdRef.current++,
      tokens: tokens.slice(range.start, range.end + 1),
    }));
    const covered = new Set(created.flatMap((summary) => summary.tokens));
    setSummaries((summaries) => [
      // A new summary swallows any summary it overlaps.
      ...summaries.filter(
        (summary) => !summary.tokens.some((token) => covered.has(token)),
      ),
      ...created,
    ]);
    created.forEach((summary, index) => {
      // Staggered, as if the answers stream back one by one.
      setTimeout(
        () =>
          setSummaries((summaries) =>
            summaries.map((existing) =>
              existing.id === summary.id
                ? {
                    ...existing,
                    label: generateSummaryLabel(
                      query,
                      stageIndex,
                      summary.tokens,
                    ),
                  }
                : existing,
            ),
          ),
        FAKE_LLM_DELAY_MS + index * 350,
      );
    });
  };

  // An expanded summary whose filters were edited stays expanded for good:
  // its phrase no longer describes them.
  const collapseAll = useCallback(
    () =>
      setSummaries((summaries) =>
        summaries.flatMap((summary) => {
          if (!summary.isExpanded) {
            return [summary];
          }
          return isUnedited(tokensRef.current ?? [], summary.tokens)
            ? [{ ...summary, isExpanded: false }]
            : [];
        }),
      ),
    [tokensRef],
  );

  const setExpanded = (id: number, isExpanded: boolean) =>
    setSummaries((summaries) =>
      summaries.map((summary) =>
        summary.id === id ? { ...summary, isExpanded } : summary,
      ),
    );

  return { summaries, setSummaries, summarize, setExpanded, collapseAll };
}

/** Clicks outside the bar (portalled pickers excluded) count as blur. */
function useCollapseOnBlur(
  containerRef: RefObject<HTMLDivElement | null>,
  isActive: boolean,
  onBlur: () => void,
) {
  useEffect(() => {
    if (!isActive) {
      return;
    }
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      const isInside =
        target instanceof Element &&
        (containerRef.current?.contains(target) ||
          target.closest("[data-portal]") != null);
      if (!isInside) {
        onBlur();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [containerRef, isActive, onBlur]);
}

function MetabotFilterButton({
  query,
  stageIndex,
  onChange,
}: ExpressionBarProps) {
  const [isOpened, setIsOpened] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const close = () => {
    setIsOpened(false);
    setPrompt("");
    setIsGenerating(false);
  };

  const handleGenerate = () => {
    // Built up front so a failure shows now, not inside the fake delay.
    const nextQuery = withMetabotFilters(query, stageIndex);
    setIsGenerating(true);
    setTimeout(() => {
      onChange(nextQuery);
      close();
    }, FAKE_LLM_DELAY_MS);
  };

  return (
    <>
      <ActionIcon
        variant="subtle"
        aria-label={t`Filter with Metabot`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpened(true);
        }}
      >
        <Icon name="metabot" c="icon-brand" />
      </ActionIcon>
      <Modal
        opened={isOpened}
        title={t`Tell Metabot how you want to filter`}
        size="lg"
        onClose={close}
      >
        <Textarea
          autosize
          minRows={4}
          placeholder={t`e.g. only big orders that were discounted…`}
          value={prompt}
          disabled={isGenerating}
          // The prototype types the prompt for you on first click.
          onClick={() => prompt === "" && setPrompt(CANNED_METABOT_PROMPT())}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <Group justify="flex-end" mt="lg">
          <Button variant="subtle" onClick={close}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            leftSection={
              isGenerating ? <Loader size="xs" /> : <Icon name="metabot" />
            }
            disabled={prompt.trim() === "" || isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? t`Adding filters…` : t`Add filters`}
          </Button>
        </Group>
      </Modal>
    </>
  );
}

type DragState = {
  x: number;
  y: number;
  anchor?: TokenRange;
  isDragging: boolean;
};

/**
 * Text-selection-style dragging across tokens. A drag that moved suppresses
 * the click it ends with, so pills don't open their popovers.
 */
function useDragSelection(tokens: Token[], isEnabled: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | undefined>(undefined);
  const didDragRef = useRef(false);
  const [range, setRange] = useState<TokenRange>();
  const [isDragging, setIsDragging] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number }>();

  const clear = () => setRange(undefined);

  const hitTest = (x: number, y: number): TokenRange | undefined => {
    const element = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-token-index]");
    if (!element || !containerRef.current?.contains(element)) {
      return undefined;
    }
    return {
      start: Number(element.dataset.tokenIndex),
      end: Number(element.dataset.tokenEnd),
    };
  };

  // Clicking anywhere else, or Escape, drops the selection.
  useEffect(() => {
    if (!range || isDragging) {
      return;
    }
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const isInside =
        event.target instanceof Node &&
        containerRef.current?.contains(event.target);
      if (!isInside) {
        setRange(undefined);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setRange(undefined);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [range, isDragging]);

  // The toolbar floats centred above the first selected row.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!range || isDragging || !container) {
      setAnchor(undefined);
      return;
    }
    const rects = Array.from(
      container.querySelectorAll<HTMLElement>("[data-token-index]"),
    )
      .filter((element) => {
        const index = Number(element.dataset.tokenIndex);
        return index >= range.start && index <= range.end;
      })
      .map((element) => element.getBoundingClientRect());
    if (rects.length === 0) {
      setAnchor(undefined);
      return;
    }
    const box = container.getBoundingClientRect();
    const top = Math.min(...rects.map((rect) => rect.top));
    const firstRow = rects.filter((rect) => rect.top < top + 4);
    const left = Math.min(...firstRow.map((rect) => rect.left));
    const right = Math.max(...firstRow.map((rect) => rect.right));
    setAnchor({ left: (left + right) / 2 - box.left, top: top - box.top });
  }, [range, isDragging]);

  const isSelectable =
    range != null && countFilters(tokens.slice(range.start, range.end + 1)) > 1;

  const barHandlers = isEnabled
    ? {
        onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
          if (event.button !== 0 || isFromPortal(event)) {
            return;
          }
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            anchor: hitTest(event.clientX, event.clientY),
            isDragging: false,
          };
          setRange(undefined);
        },
        onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
          const drag = dragRef.current;
          if (!drag || (event.buttons & 1) === 0) {
            return;
          }
          const distance = Math.hypot(
            event.clientX - drag.x,
            event.clientY - drag.y,
          );
          if (!drag.isDragging && distance < MIN_DRAG_DISTANCE) {
            return;
          }
          if (!drag.isDragging) {
            drag.isDragging = true;
            setIsDragging(true);
          }
          const hit = hitTest(event.clientX, event.clientY);
          if (!hit) {
            return;
          }
          drag.anchor ??= hit;
          setRange(
            normalizeRange(tokens, {
              start: Math.min(drag.anchor.start, hit.start),
              end: Math.max(drag.anchor.end, hit.end),
            }),
          );
        },
        onPointerUp: () => {
          didDragRef.current = dragRef.current?.isDragging ?? false;
          dragRef.current = undefined;
          setIsDragging(false);
        },
        onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
          if (didDragRef.current && !isFromPortal(event)) {
            didDragRef.current = false;
            event.stopPropagation();
            event.preventDefault();
          }
        },
      }
    : {};

  return {
    containerRef,
    barHandlers,
    range: isSelectable ? range : undefined,
    anchor: isSelectable ? anchor : undefined,
    clear,
    isSelected: (index: number) =>
      range != null && index >= range.start && index <= range.end,
  };
}

/**
 * React bubbles events from portals (the Metabot modal, pickers) through the
 * bar; only the bar's own DOM should drive the selection.
 */
function isFromPortal(event: MouseEvent<HTMLDivElement>): boolean {
  return !(
    event.target instanceof Node && event.currentTarget.contains(event.target)
  );
}

type SummaryPillProps = {
  summary: Summary;
  tokens: Token[];
  onExpand: () => void;
  onRemove: () => void;
};

/** Several filters behind one Metabot-written phrase; click to lay them out. */
function SummaryPill({
  summary,
  tokens,
  onExpand,
  onRemove,
}: SummaryPillProps) {
  const isGenerating = summary.label == null;
  const count = countFilters(tokens);

  return (
    <span
      role="button"
      tabIndex={0}
      className={cx(S.summaryPill, { [S.summaryGenerating]: isGenerating })}
      title={isGenerating ? undefined : t`Click to edit these ${count} filters`}
      onClick={() => !isGenerating && onExpand()}
    >
      {isGenerating ? <Loader size="xs" /> : <Icon name="metabot" size={14} />}
      <span>{summary.label ?? t`Summarizing ${count} filters…`}</span>
      {!isGenerating && (
        <>
          <span className={S.summaryCount}>{count}</span>
          <Icon
            name="close"
            size={12}
            aria-label={t`Remove`}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          />
        </>
      )}
    </span>
  );
}

function CaretSlot({ children }: { children: ReactNode }) {
  return <span className={S.caretSlot}>{children}</span>;
}

function Gap({
  isSelected,
  onClick,
}: {
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <span
      className={cx(S.gap, { [S.tokenSelected]: isSelected })}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    />
  );
}

function getHiddenSearch(listRef: RefObject<HTMLDivElement | null>) {
  return listRef.current?.querySelector("input") ?? undefined;
}

/**
 * Types the bar's text into the list's hidden search box, then highlights
 * the best match so Enter picks it.
 */
function useSearchSync(
  listRef: RefObject<HTMLDivElement | null>,
  text: string,
  isActive: boolean,
  shouldHighlight: boolean,
) {
  useEffect(() => {
    if (!isActive) {
      return;
    }
    // The dropdown renders in a portal; wait a tick for it to mount.
    let highlightTimeout: ReturnType<typeof setTimeout>;
    const syncTimeout = setTimeout(() => {
      const input = getHiddenSearch(listRef);
      const value = text.trim();
      if (!input || input.value === value) {
        return;
      }
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (value.length > 0 && shouldHighlight) {
        // The list resets its cursor on search; move it once the reset has rendered.
        highlightTimeout = setTimeout(() => forwardKey(listRef, "ArrowDown"));
      }
    });
    return () => {
      clearTimeout(syncTimeout);
      clearTimeout(highlightTimeout);
    };
  }, [listRef, text, isActive, shouldHighlight]);
}

/** Arrow keys and Enter in the bar drive the list's own keyboard navigation. */
function forwardKey(listRef: RefObject<HTMLDivElement | null>, key: string) {
  getHiddenSearch(listRef)?.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true }),
  );
}

/** Nesting depth per token, so nested parens fade. */
function getParenDepths(tokens: Token[]): number[] {
  let depth = 0;
  return tokens.map((token) => {
    if (token.type !== "paren") {
      return depth;
    }
    if (token.side === "open") {
      return depth++;
    }
    depth = Math.max(depth - 1, 0);
    return depth;
  });
}

/**
 * Labels of filters that just appeared from outside the bar (a drill), so
 * they can flash once and show where they landed.
 */
function useFlashedLabels(
  query: Lib.Query,
  stageIndex: number,
  tokens: Token[],
): Set<string> {
  const labels = useMemo(
    () =>
      tokens.flatMap((token) =>
        token.type === "filter"
          ? [getFilterLabel(query, stageIndex, token.clause)]
          : [],
      ),
    [query, stageIndex, tokens],
  );
  const previousRef = useRef<string[]>(labels);
  const [flashed, setFlashed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const previous = new Set(previousRef.current);
    previousRef.current = labels;
    const added = labels.filter((label) => !previous.has(label));
    if (added.length === 0) {
      return;
    }
    setFlashed(new Set(added));
    const timeout = setTimeout(() => setFlashed(new Set()), 1600);
    return () => clearTimeout(timeout);
  }, [labels]);

  return flashed;
}

type TokenViewProps = {
  query: Lib.Query;
  stageIndex: number;
  token: Token;
  depth: number;
  hasError: boolean;
  isFlashed: boolean;
  onReplace: (token: Token) => void;
  onRemove: () => void;
};

function TokenView({
  query,
  stageIndex,
  token,
  depth,
  hasError,
  isFlashed,
  onReplace,
  onRemove,
}: TokenViewProps) {
  const errorClass = hasError ? S.tokenError : undefined;

  if (token.type === "op") {
    return (
      <button
        type="button"
        className={cx(S.op, { [S.opOr]: token.op === "or" }, errorClass)}
        title={t`Click to switch to ${toggleOperator(token.op).toUpperCase()}`}
        onClick={() => onReplace(opToken(toggleOperator(token.op)))}
      >
        {token.op}
      </button>
    );
  }

  if (token.type === "paren") {
    return (
      <button
        type="button"
        className={cx(S.paren, errorClass)}
        style={{ opacity: Math.max(1 - depth * 0.25, 0.5) }}
        title={t`Click to remove`}
        onClick={onRemove}
      >
        {token.side === "open" ? "(" : ")"}
      </button>
    );
  }

  return (
    <FilterTokenView
      query={query}
      stageIndex={stageIndex}
      clause={token.clause}
      className={cx(errorClass, { [S.flash]: isFlashed })}
      onReplace={(filterable) =>
        onReplace(filterToken(toFilterClause(query, stageIndex, filterable)))
      }
      onRemove={onRemove}
    />
  );
}

type FilterTokenViewProps = {
  query: Lib.Query;
  stageIndex: number;
  clause: Lib.FilterClause;
  className?: string;
  onReplace: (filterable: Lib.Filterable) => void;
  onRemove: () => void;
};

function FilterTokenView({
  query,
  stageIndex,
  clause,
  className,
  onReplace,
  onRemove,
}: FilterTokenViewProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <Box component="span" className={cx(S.pill, className)}>
          <FilterPill
            onClick={() => setIsOpened((opened) => !opened)}
            onRemoveClick={onRemove}
          >
            {getFilterLabel(query, stageIndex, clause)}
          </FilterPill>
        </Box>
      </Popover.Target>
      <Popover.Dropdown data-testid="filter-picker-dropdown">
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={clause}
          onSelect={(filterable) => {
            onReplace(filterable);
            setIsOpened(false);
          }}
          onClose={() => setIsOpened(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
