import cx from "classnames";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLatest } from "react-use";
import { t } from "ttag";
import { noop } from "underscore";

import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { NotebookCellItem } from "metabase/querying/notebook/components/NotebookCell";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Menu,
  Popover,
  Text,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel, toFilterClause } from "../../harness/clauses";
import { matchLogic } from "../expression-bar-drill/LogicColumnList";
import { compactLabel } from "../expression-bar-unified/ExpressionBar";
import {
  getAggregationColumns,
  useSummaryStage,
} from "../expression-bar-unified/summary";
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
} from "../expression-bar-unified/tokens";

import S from "./ExpressionBar.module.css";
import {
  type FilterToken,
  type KeyOf,
  applyRememberedOrder,
  freshIndexes,
  relocateSummaryFilters,
  rememberOrder,
} from "./conjuncts";
import {
  type CancelReason,
  type ColumnKeyState,
  DraftFilterPill,
} from "./draft-pill/DraftFilterPill";
import type { DraftColumn } from "./draft-pill/types";
import { type ColumnGroup, getDraftColumn } from "./draft-pill/utils";

export type ExpressionBarProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
  /** Sits flush inside a notebook cell: no borders, no outer padding. */
  isInNotebook?: boolean;
  /** Pills after the expression, outside it: the summary's own filters. */
  trailing?: ReactNode;
  /** How deep the parentheses must nest before editing lays them out as rows. */
  rowsFromNesting?: number;
  /** AND / OR as small bordered circles, closer to the pills. */
  hasRoundOps?: boolean;
  /** Pressing this key anywhere outside a text field puts the caret at the end of the bar. */
  focusKey?: string;
  /**
   * Once the stage has a summary, the bar also holds the filters on it (the
   * next stage's) as darker pills in the same stream, wherever the user puts
   * them. Off for a bar that edits one stage, like a notebook step.
   */
  withSummary?: boolean;
};

const INDENT_REM = 1.5;
const FRESH_MS = 1500;

/** What the bar says after it carried a summary filter to the end. */
type Callout = {
  /** The moved pill the callout hangs under. */
  tokenKey: string;
  message: string;
  undo: { tokens: Token[]; caret: number };
};

const TOKEN_KEY_ATTR = "data-token-key";

/** The logic row above the columns in the pill's chooser. */
const LOGIC_KEYWORDS = [
  { label: "AND", token: opToken("and") },
  { label: "OR", token: opToken("or") },
  { label: "(", token: OPEN_PAREN },
  { label: ")", token: CLOSE_PAREN },
];

/**
 * The drill-through bar that lays parentheses out as indented rows while you
 * edit, and folds back into one line on blur. The Metabot icon opens a
 * menu of (non-working) actions without unfolding the bar.
 *
 * High-fidelity take on the expression bar, sitting where the QB filter panel
 * sits. You type in the bar itself; the popover under the caret is the app's
 * filter column list with a "Logic" section (and, or, parentheses) on top,
 * and the best match is highlighted as you type. Only a picked column turns
 * into a pill, while its value is set.
 */
export function ExpressionBar({
  query,
  stageIndex,
  onChange,
  isInNotebook = false,
  trailing,
  rowsFromNesting = 1,
  hasRoundOps = false,
  focusKey,
  withSummary = false,
}: ExpressionBarProps) {
  const summaryStageIndex = stageIndex + 1;
  const summaryStage = useSummaryStage(query, stageIndex);
  const summary = withSummary ? summaryStage : undefined;
  const hasSummary = summary != null;
  // Tokens read from the query may sit on the summary stage even when the bar
  // does not offer it; they still need that stage's query.
  const summaryQuery = summaryStage?.query ?? query;
  const queryFor = useCallback(
    (tokenStageIndex: number) =>
      tokenStageIndex === summaryStageIndex ? summaryQuery : query,
    [query, summaryQuery, summaryStageIndex],
  );
  const keyOf = useCallback<KeyOf>(
    (token) => getTokenKey(token, queryFor),
    [queryFor],
  );
  const committedTokens = useMemo(
    () =>
      applyRememberedOrder(
        readTokens(query, stageIndex, { withSummary: hasSummary }).filter(
          (token): token is Token => token.type !== "not",
        ),
        keyOf,
      ),
    [query, stageIndex, hasSummary, keyOf],
  );
  // Names the summary gave its aggregations: a filter on one of them is a
  // filter on a measure, which can never be or-ed; a filter on a breakout can.
  const measureNames = useMemo(
    () =>
      new Set(
        summaryStage == null
          ? []
          : getAggregationColumns(query, stageIndex, summaryStage).map(
              (column) =>
                Lib.displayInfo(
                  summaryStage.query,
                  summaryStage.stageIndex,
                  column,
                ).name,
            ),
      ),
    [query, stageIndex, summaryStage],
  );
  const isMeasureFilter = useCallback(
    (token: FilterToken) => {
      const tokenQuery = queryFor(token.stageIndex);
      const column = Lib.filterParts(
        tokenQuery,
        token.stageIndex,
        token.clause,
      )?.column;
      return (
        column != null &&
        measureNames.has(
          Lib.displayInfo(tokenQuery, token.stageIndex, column).name,
        )
      );
    },
    [queryFor, measureNames],
  );
  // The summary's aggregations in the pill's column chooser, after the columns.
  const summaryColumnGroups = useMemo(
    (): ColumnGroup[] =>
      summary == null
        ? []
        : [
            {
              label: t`Summary`,
              columns: getAggregationColumns(query, stageIndex, summary).map(
                (column) => ({
                  ...getDraftColumn(summary.query, summary.stageIndex, column),
                  summary,
                }),
              ),
              segments: [],
            },
          ],
    [query, stageIndex, summary],
  );
  const [tokens, setTokens] = useState(committedTokens);
  const [callout, setCallout] = useState<Callout>();
  // Tokens a relocation just created (parentheses, an "and") and the pill it moved.
  const [fresh, setFresh] = useState<ReadonlySet<number>>(() => new Set());
  const [movedKey, setMovedKey] = useState<string>();
  const freshTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const flip = useFlip();
  const [caret, setCaret] = useState(committedTokens.length);
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  // Bumped to give the caret a fresh pill, back at its column step.
  const [pillKey, setPillKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Focusing the idle caret opens the pill, except right after the pill closed.
  const skipOpenOnFocusRef = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const shouldRefocusRef = useRef(false);
  const flashed = useFlashedKeys(committedTokens, keyOf);
  const [hasFocus, setHasFocus] = useState(false);
  const isPointerInBarRef = useRef(false);
  const [openPillCount, setOpenPillCount] = useState(0);

  // External query changes (drills, examples) reset the draft; our own
  // notebook commits keep the caret where it is. Adjusted during render rather
  // than in an effect: an effect would leave one pass where the draft is stale
  // but not edited, and the notebook auto-commit below would write that stale
  // draft back over the new query, which the reset then undoes, forever.
  const isSelfCommitRef = useRef(false);
  const [syncedTokens, setSyncedTokens] = useState(committedTokens);
  if (syncedTokens !== committedTokens) {
    setSyncedTokens(committedTokens);
    setTokens(committedTokens);
    setCallout(undefined);
    if (isSelfCommitRef.current) {
      isSelfCommitRef.current = false;
    } else {
      setCaret(committedTokens.length);
    }
  }

  const focusInput = () => {
    shouldRefocusRef.current = true;
  };
  useLayoutEffect(() => {
    if (shouldRefocusRef.current) {
      shouldRefocusRef.current = false;
      inputRef.current?.focus();
    }
  });

  // Removing tokens can leave the caret past the end; clamp it.
  const caretIndex = Math.min(caret, tokens.length);
  const isDirty = tokens !== committedTokens;
  const parsed = useMemo(() => parseTokens(tokens), [tokens]);
  const errorPosition = parsed.ok ? undefined : parsed.position;
  const parenDepths = useMemo(() => getParenDepths(tokens), [tokens]);
  const isExpanded = hasFocus || isOpen || openPillCount > 0;
  const nesting = Math.max(
    0,
    ...tokens.map((token, index) =>
      token.type === "paren" && token.side === "open"
        ? parenDepths[index] + 1
        : 0,
    ),
  );
  const hasGroups = nesting >= rowsFromNesting;
  const rowStart = (index: number) => {
    const isOpenParen = (token?: Token) =>
      token?.type === "paren" && token.side === "open";
    const isCloseParen = (token?: Token) =>
      token?.type === "paren" && token.side === "close";
    if (!isExpanded || !hasGroups) {
      return [];
    }
    if (isOpenParen(tokens[index])) {
      return [
        <RowBreak
          key={`row-${index}`}
          isBreak={index > 0}
          indent={parenDepths[index] + 1}
        />,
      ];
    }
    if (isCloseParen(tokens[index - 1])) {
      return [
        <RowBreak
          key={`row-${index}`}
          isBreak
          indent={parenDepths[index - 1]}
        />,
      ];
    }
    return [];
  };

  // Two operators can't sit side by side, so next to one the logic row offers none.
  const isOp = (token?: Token) => token?.type === "op";
  const isTokenAllowed = (token: Token) =>
    !isOp(token) ||
    (!isOp(tokens[caretIndex - 1]) && !isOp(tokens[caretIndex]));

  // The text typed in the pill's column step, for the logic row: a typed
  // keyword lights up, and Space or Enter enters it, unless the arrow keys
  // moved into the column list.
  const [typed, setTyped] = useState("");
  const [hasNavigated, setHasNavigated] = useState(false);
  // The shared matcher spells its tokens in the rows-only model; the bar's own keywords carry the stage-aware ones.
  const typedLogicLabel = matchLogic(typed)?.label;
  const typedLogic = LOGIC_KEYWORDS.find(
    (keyword) => keyword.label === typedLogicLabel,
  );
  const logicMatch =
    typedLogic && isTokenAllowed(typedLogic.token) && !hasNavigated
      ? typedLogic
      : undefined;
  const isLogicRowVisible = typed.trim().length === 0 || typedLogic != null;

  const handleTypedChange = (newTyped: string) => {
    setTyped(newTyped);
    setHasNavigated(false);
    if (newTyped.length > 0) {
      setCallout(undefined);
    }
  };

  const resetDraft = () => {
    setText("");
    setTyped("");
    setHasNavigated(false);
    setPillKey((key) => key + 1);
  };

  // Closing keeps the caret focused, so typing or an arrow key reopens it.
  const close = ({ keepFocus = false } = {}) => {
    resetDraft();
    setIsOpen(false);
    if (keepFocus) {
      skipOpenOnFocusRef.current = true;
      focusInput();
    }
  };

  // Arrow keys keep the popover as it is, so a closed one stays closed.
  const moveCaret = (index: number, { open = true } = {}) => {
    resetDraft();
    setCallout(undefined);
    setCaret(index);
    setIsOpen(open);
    if (!open) {
      skipOpenOnFocusRef.current = true;
    }
    focusInput();
  };

  // The shortcut reads the latest caret helper without re-subscribing every render.
  const focusAtEndRef = useLatest(() => moveCaret(tokens.length));
  useEffect(() => {
    if (focusKey == null) {
      return;
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        event.key !== focusKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      focusAtEndRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusKey, focusAtEndRef]);

  /**
   * Every edit lands here. A summary filter stays exactly where the user put
   * it as long as the expression is a plain AND chain; the moment the stream
   * is complete and one sits inside a group, it is carried to the end, the
   * pills glide, and a callout under the moved pill says why, with Undo.
   */
  const applyTokens = (nextTokens: Token[], nextCaret: number): boolean => {
    const relocation = hasSummary
      ? relocateSummaryFilters(nextTokens, stageIndex, isMeasureFilter)
      : undefined;
    if (relocation == null) {
      setTokens(nextTokens);
      setCaret(nextCaret);
      setCallout(undefined);
      return false;
    }
    flip.capture(barRef.current);
    const moved = relocation.moved[relocation.moved.length - 1];
    const movedLabel = compactLabel(
      getFilterLabel(
        queryFor(moved.stageIndex),
        moved.stageIndex,
        moved.clause,
      ),
    );
    const rest = describeTokens(
      relocation.tokens.slice(
        0,
        relocation.tokens.length - 2 * relocation.moved.length,
      ),
      queryFor,
    );
    // The caret keeps its place in the expression: after the token it followed.
    const anchor = nextTokens[nextCaret - 1];
    const anchorIndex = anchor ? relocation.tokens.indexOf(anchor) : -1;
    setTokens(relocation.tokens);
    setCaret(anchorIndex === -1 ? 0 : anchorIndex + 1);
    setFresh(freshIndexes(nextTokens, relocation.tokens, keyOf));
    setMovedKey(keyOf(moved));
    clearTimeout(freshTimeoutRef.current);
    freshTimeoutRef.current = setTimeout(() => {
      setFresh(new Set());
      setMovedKey(undefined);
    }, FRESH_MS);
    setCallout({
      tokenKey: keyOf(moved),
      message: relocation.hadOr
        ? t`${movedLabel} filters the summarized result, so it can't be inside an "or". It now applies after ${rest}.`
        : t`${movedLabel} filters the summarized result, so it can't be grouped with filters on rows. It now applies after ${rest}.`,
      undo: { tokens, caret: caretIndex },
    });
    return true;
  };

  // Back to before the pick; an operator the pick was completing goes too.
  const undoRelocation = () => {
    if (callout) {
      const { tokens: previous, caret: previousCaret } = callout.undo;
      const last = previous[previous.length - 1];
      const restored =
        last?.type === "op" && previousCaret === previous.length
          ? previous.slice(0, -1)
          : previous;
      setTokens(restored);
      setCaret(Math.min(previousCaret, restored.length));
      setCallout(undefined);
      focusInput();
    }
  };

  const insert = (token: Token) => {
    if (!isTokenAllowed(token)) {
      return;
    }
    const next = insertToken(tokens, caretIndex, token);
    // After a relocation the pill stays closed, so its dropdown doesn't cover the note.
    if (applyTokens(next.tokens, next.caret)) {
      close({ keepFocus: true });
    } else {
      resetDraft();
      focusInput();
    }
  };

  // A column of the summary makes a filter on the summary's own stage.
  const handlePickFilter = (
    filterable: Lib.Filterable,
    column?: DraftColumn,
  ) => {
    const stage = column?.summary ?? { query, stageIndex };
    insert(
      filterToken(
        toFilterClause(stage.query, stage.stageIndex, filterable),
        stage.stageIndex,
      ),
    );
  };

  // The AI's filters from one request go in as "a and b and …" at the caret.
  const handlePickFilters = (filterables: Lib.Filterable[]) => {
    let next = { tokens, caret: caretIndex };
    filterables.forEach((filterable, index) => {
      if (index > 0) {
        next = insertToken(next.tokens, next.caret, opToken("and"));
      }
      next = insertToken(
        next.tokens,
        next.caret,
        filterToken(toFilterClause(query, stageIndex, filterable), stageIndex),
      );
    });
    if (applyTokens(next.tokens, next.caret)) {
      close({ keepFocus: true });
    } else {
      resetDraft();
      focusInput();
    }
  };

  const handlePillCancel = (reason: CancelReason) => {
    if (reason === "click-outside") {
      // A click in the bar moves the caret; one elsewhere closes the pill.
      if (!isPointerInBarRef.current) {
        close();
      }
      return;
    }
    close({ keepFocus: true });
  };

  const removeTokenBeforeCaret = () => {
    if (caretIndex > 0) {
      applyTokens(removeTokenAt(tokens, caretIndex - 1), caretIndex - 1);
      resetDraft();
    }
  };

  const moveToAdjacentRow = (isUp: boolean) => {
    const bar = barRef.current;
    const target = bar && getSlotOnAdjacentRow(bar, caretIndex, isUp);
    if (target != null) {
      moveCaret(target);
    }
    return target != null;
  };

  // The notebook has no Apply: every valid expression goes straight to its draft query.
  const lastAutoCommitRef = useRef<Token[]>();
  useEffect(() => {
    const isNew = tokens !== lastAutoCommitRef.current;
    if (isInNotebook && isDirty && parsed.ok && isNew) {
      lastAutoCommitRef.current = tokens;
      isSelfCommitRef.current = true;
      rememberOrder(tokens, keyOf);
      onChange(
        writeTokens(query, stageIndex, tokens, { withSummary: hasSummary }),
      );
    }
  }, [
    isInNotebook,
    isDirty,
    parsed.ok,
    query,
    stageIndex,
    tokens,
    hasSummary,
    keyOf,
    onChange,
  ]);

  const commit = () => {
    if (parsed.ok && isDirty) {
      rememberOrder(tokens, keyOf);
      onChange(
        writeTokens(query, stageIndex, tokens, { withSummary: hasSummary }),
      );
    }
    close();
    inputRef.current?.blur();
  };

  // The bar's own keys in the pill's column step: logic tokens, caret moves
  // between tokens and rows, Apply on Enter, and Escape to close.
  const handleColumnKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    { text: typed, hasSelectedOption }: ColumnKeyState,
  ) => {
    const input = event.currentTarget;

    if (event.key === "(" || event.key === ")") {
      insert(event.key === "(" ? OPEN_PAREN : CLOSE_PAREN);
      return true;
    }
    if (event.key === " " && logicMatch) {
      insert(logicMatch.token);
      return true;
    }
    if (event.key === "Enter") {
      if (logicMatch) {
        insert(logicMatch.token);
        return true;
      }
      if (hasSelectedOption) {
        return false;
      }
      if (typed.trim().length === 0) {
        commit();
        return true;
      }
      return false;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      // Up and Down move between the rows of a nested expression; with no
      // row there, they move in the column list.
      if (
        !hasSelectedOption &&
        typed.length === 0 &&
        moveToAdjacentRow(event.key === "ArrowUp")
      ) {
        return true;
      }
      setHasNavigated(true);
      return false;
    }
    if (event.key === "Escape") {
      if (typed.length > 0) {
        resetDraft();
      } else {
        close({ keepFocus: true });
      }
      return true;
    }
    if (event.key === "Backspace" && typed.length === 0) {
      removeTokenBeforeCaret();
      return true;
    }
    if (
      event.key === "ArrowLeft" &&
      input.selectionStart === 0 &&
      caretIndex > 0
    ) {
      moveCaret(caretIndex - 1);
      return true;
    }
    if (
      event.key === "ArrowRight" &&
      input.selectionEnd === typed.length &&
      caretIndex < tokens.length
    ) {
      moveCaret(caretIndex + 1);
      return true;
    }
    return false;
  };

  // The idle caret, after the pill closed: the same moves, and any key opens the pill.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;

    if (event.key === "(" || event.key === ")") {
      event.preventDefault();
      insert(event.key === "(" ? OPEN_PAREN : CLOSE_PAREN);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (
        !moveToAdjacentRow(event.key === "ArrowUp") &&
        event.key === "ArrowDown"
      ) {
        setIsOpen(true);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      input.blur();
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      removeTokenBeforeCaret();
      return;
    }
    if (event.key === "ArrowLeft" && caretIndex > 0) {
      event.preventDefault();
      moveCaret(caretIndex - 1, { open: false });
      return;
    }
    if (event.key === "ArrowRight" && caretIndex < tokens.length) {
      event.preventDefault();
      moveCaret(caretIndex + 1, { open: false });
    }
  };

  // Anywhere in the bar that isn't a token or a control puts the caret at the end.
  const handleBarClick = (event: MouseEvent<HTMLDivElement>) => {
    const { target, currentTarget } = event;
    const isOnControl =
      target instanceof Element &&
      (!currentTarget.contains(target) ||
        target.closest(
          `button, input, .${S.pill}, .${S.callout}, [${SLOT_ATTR}]`,
        ) != null);
    if (!isOnControl) {
      moveCaret(
        getSlotNearPoint(currentTarget, event.clientX, event.clientY) ??
          tokens.length,
      );
    }
  };

  // The caret is the draft pill while it's open: the column chooser with the
  // logic tokens on top, then the operator and the values, all inline. Closed,
  // it's a plain text caret that reopens the pill on any key.
  const caretView = isOpen ? (
    <DraftFilterPill
      key={`${caretIndex}:${pillKey}`}
      query={query}
      stageIndex={stageIndex}
      initialText={text}
      extraColumnGroups={summaryColumnGroups}
      columnHeader={
        isLogicRowVisible && (
          <Group gap="xs" className={S.logicRow} py="xs">
            <Text size="sm" fw="bold" c="text-secondary" mr="auto">
              {t`Logic`}
            </Text>
            {LOGIC_KEYWORDS.map((keyword) => {
              const isAllowed = isTokenAllowed(keyword.token);
              return (
                <button
                  key={keyword.label}
                  type="button"
                  disabled={!isAllowed}
                  className={cx(S.logicKeyword, {
                    [S.logicKeywordOr]: keyword.label === "OR",
                    [S.logicKeywordParen]: keyword.token.type === "paren",
                    [S.logicKeywordActive]:
                      isAllowed && keyword.label === logicMatch?.label,
                  })}
                  onClick={() => insert(keyword.token)}
                >
                  {keyword.label}
                </button>
              );
            })}
          </Group>
        )
      }
      isColumnHighlightPaused={logicMatch != null}
      onColumnTextChange={handleTypedChange}
      onColumnKeyDown={handleColumnKeyDown}
      onDraftChange={noop}
      onSubmit={handlePickFilter}
      onSubmitFilters={handlePickFilters}
      onDone={resetDraft}
      onCancel={handlePillCancel}
      onRemove={() => close({ keepFocus: true })}
    />
  ) : (
    <span
      className={cx(S.typing, S.typingIdle, {
        [S.typingText]: text.length > 0,
      })}
    >
      <input
        ref={inputRef}
        className={S.input}
        style={{ width: `calc(${text.length}ch + 2px)` }}
        value={text}
        aria-label={t`Filter expression`}
        onChange={(event) => {
          setText(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (skipOpenOnFocusRef.current) {
            skipOpenOnFocusRef.current = false;
          } else {
            setIsOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
      />
    </span>
  );

  return (
    <Box className={cx({ [S.barNotebookRoot]: isInNotebook })}>
      <Box
        ref={barRef}
        className={cx(S.bar, {
          [S.barInvalid]: !parsed.ok,
          [S.barExpanded]: isExpanded && hasGroups,
          [S.barNotebook]: isInNotebook,
          [S.barRoundOps]: hasRoundOps,
        })}
        onClick={handleBarClick}
        onMouseDown={(event) => {
          isPointerInBarRef.current = true;
          window.addEventListener(
            "mouseup",
            () => (isPointerInBarRef.current = false),
            { once: true },
          );
          // Keep focus in the bar, so it doesn't fold mid-click and move the click target.
          if (!(event.target instanceof HTMLInputElement)) {
            event.preventDefault();
          }
        }}
        onFocus={(event) => {
          // The Metabot menu is an aside; focusing it shouldn't unfold the bar.
          if (
            !(event.target as HTMLElement).closest(`[${METABOT_MENU_ATTR}]`)
          ) {
            setHasFocus(true);
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setHasFocus(false);
            setCallout(undefined);
          }
        }}
        data-testid="qb-filters-panel"
      >
        {/* One keyed array holds the caret so React moves it instead of remounting it. */}
        {[
          ...tokens.flatMap((token, index) => [
            ...rowStart(index),
            index === caretIndex ? (
              <CaretSlot key="caret" index={caretIndex}>
                {caretView}
              </CaretSlot>
            ) : (
              <Gap
                key={`gap-${index}`}
                index={index}
                onClick={() => moveCaret(index)}
              />
            ),
            <TokenView
              key={`token-${index}`}
              queryFor={queryFor}
              stageIndex={stageIndex}
              token={token}
              tokenKey={keyOf(token)}
              isInNotebook={isInNotebook}
              depth={parenDepths[index]}
              hasError={index === errorPosition}
              isFlashed={token.type === "filter" && flashed.has(keyOf(token))}
              isFresh={fresh.has(index)}
              isMoved={movedKey != null && keyOf(token) === movedKey}
              onReplace={(next) =>
                applyTokens(replaceTokenAt(tokens, index, next), caretIndex)
              }
              onPopoverChange={(isOpened) =>
                setOpenPillCount((count) => count + (isOpened ? 1 : -1))
              }
              onRemove={() => {
                const next = removeTokenAt(tokens, index);
                applyTokens(next, Math.min(caretIndex, next.length));
              }}
            />,
          ]),
          ...rowStart(tokens.length),
          // Before the end slot, so a click past the last pill puts the caret after them.
          ...(trailing
            ? [
                // Like the Metabot menu, focusing these shouldn't unfold the bar.
                <Box
                  key="trailing"
                  component="span"
                  className={S.trailing}
                  onFocus={(event) => event.stopPropagation()}
                >
                  {trailing}
                </Box>,
              ]
            : []),
          caretIndex === tokens.length ? (
            <CaretSlot key="caret" index={caretIndex}>
              {caretView}
            </CaretSlot>
          ) : (
            <Gap
              key="gap-end"
              index={tokens.length}
              onClick={() => moveCaret(tokens.length)}
            />
          ),
        ]}
        {tokens.length === 0 && text === "" && !isOpen && (
          <span className={S.placeholder}>{t`Type to filter…`}</span>
        )}
        <Group gap="sm" ml="auto" pl="md" wrap="nowrap">
          {!parsed.ok && (
            <Text size="sm" c="feedback-negative" lh="1">
              {parsed.error}
            </Text>
          )}
          {isDirty && !isInNotebook && (
            <Button
              size="compact-sm"
              variant="filled"
              disabled={!parsed.ok}
              onClick={commit}
            >
              {t`Apply`}
            </Button>
          )}
          <Box className={S.metabot}>
            <MetabotMenu />
          </Box>
        </Group>
        {callout && (
          <RelocationCallout
            key={callout.tokenKey}
            barRef={barRef}
            tokenKey={callout.tokenKey}
            message={callout.message}
            onUndo={undoRelocation}
            onClose={() => setCallout(undefined)}
          />
        )}
      </Box>
    </Box>
  );
}

/** One key per token: a filter by its stage and label, so pills can be matched across a reorder. */
function getTokenKey(
  token: Token,
  queryFor: (stageIndex: number) => Lib.Query,
): string {
  switch (token.type) {
    case "op":
      return `op:${token.op}`;
    case "paren":
      return `paren:${token.side}`;
    case "filter":
      return `filter:${token.stageIndex}:${getFilterLabel(
        queryFor(token.stageIndex),
        token.stageIndex,
        token.clause,
      )}`;
  }
}

const REST_MAX_LENGTH = 72;

/** The expression as short text for the callout: "(Total > 100 or Tax > 2)". */
function describeTokens(
  tokens: readonly Token[],
  queryFor: (stageIndex: number) => Lib.Query,
): string {
  const text = tokens
    .map((token) => {
      switch (token.type) {
        case "op":
          return token.op;
        case "paren":
          return token.side === "open" ? "(" : ")";
        case "filter":
          return compactLabel(
            getFilterLabel(
              queryFor(token.stageIndex),
              token.stageIndex,
              token.clause,
            ),
          );
      }
    })
    .join(" ")
    .replaceAll("( ", "(")
    .replaceAll(" )", ")");
  return text.length > REST_MAX_LENGTH
    ? `${text.slice(0, REST_MAX_LENGTH - 1)}…`
    : text;
}

/**
 * FLIP for the pills: `capture` records where each pill is before the tokens
 * change; after the next render every pill that moved is set back to its old
 * place with a transform, then released to glide to its new one.
 */
function useFlip() {
  const snapshotRef = useRef<{
    bar: HTMLElement;
    rects: Map<string, DOMRect>;
  }>();

  const capture = (bar: HTMLElement | null) => {
    if (!bar) {
      return;
    }
    const rects = new Map<string, DOMRect>();
    bar
      .querySelectorAll<HTMLElement>(`[${TOKEN_KEY_ATTR}]`)
      .forEach((element) => {
        const key = element.getAttribute(TOKEN_KEY_ATTR);
        if (key != null) {
          rects.set(key, element.getBoundingClientRect());
        }
      });
    snapshotRef.current = { bar, rects };
  };

  useLayoutEffect(() => {
    const snapshot = snapshotRef.current;
    if (!snapshot) {
      return;
    }
    snapshotRef.current = undefined;
    const moving: HTMLElement[] = [];
    snapshot.bar
      .querySelectorAll<HTMLElement>(`[${TOKEN_KEY_ATTR}]`)
      .forEach((element) => {
        const key = element.getAttribute(TOKEN_KEY_ATTR);
        const before = key != null ? snapshot.rects.get(key) : undefined;
        if (!before) {
          return;
        }
        const after = element.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (dx !== 0 || dy !== 0) {
          element.style.transition = "none";
          element.style.transform = `translate(${dx}px, ${dy}px)`;
          moving.push(element);
        }
      });
    if (moving.length === 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      moving.forEach((element) => {
        element.style.transition =
          "transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        element.style.transform = "";
      });
    });
    const timeout = setTimeout(() => {
      moving.forEach((element) => {
        element.style.transition = "";
      });
    }, 500);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  });

  return { capture };
}

type RelocationCalloutProps = {
  barRef: RefObject<HTMLDivElement>;
  tokenKey: string;
  message: string;
  onUndo: () => void;
  onClose: () => void;
};

/** The note under a pill the bar just moved, positioned inside the bar once the pill has landed. */
function RelocationCallout({
  barRef,
  tokenKey,
  message,
  onUndo,
  onClose,
}: RelocationCalloutProps) {
  const [position, setPosition] = useState<{ left: number; top: number }>();

  useLayoutEffect(() => {
    const bar = barRef.current;
    const pills = bar
      ? Array.from(
          bar.querySelectorAll<HTMLElement>(
            `[${TOKEN_KEY_ATTR}="${CSS.escape(tokenKey)}"]`,
          ),
        )
      : [];
    const pill = pills[pills.length - 1];
    if (!pill) {
      return;
    }
    const place = () =>
      setPosition({
        left: pill.offsetLeft,
        top: pill.offsetTop + pill.offsetHeight + 6,
      });
    place();
    const observer = new ResizeObserver(place);
    if (bar) {
      observer.observe(bar);
    }
    return () => observer.disconnect();
  }, [barRef, tokenKey]);

  if (!position) {
    return null;
  }

  return (
    <div
      className={S.callout}
      style={position}
      role="status"
      // Keeps the caret focused: the bar prevents default on mousedown too, but
      // the Undo button must not blur the input before it runs.
      onMouseDown={(event) => event.preventDefault()}
    >
      <span className={S.calloutDot} />
      <span>{message}</span>
      <button type="button" className={S.calloutUndo} onClick={onUndo}>
        {t`Undo`}
      </button>
      <ActionIcon
        size="xs"
        variant="subtle"
        c="text-secondary"
        aria-label={t`Dismiss`}
        onClick={onClose}
      >
        <Icon name="close" size={10} />
      </ActionIcon>
    </div>
  );
}

function RowBreak({ isBreak, indent }: { isBreak: boolean; indent: number }) {
  return (
    <>
      {isBreak && <span className={S.rowBreak} />}
      <span style={{ width: `${indent * INDENT_REM}rem`, flexShrink: 0 }} />
    </>
  );
}

const METABOT_MENU_ATTR = "data-metabot-menu";

/** Placeholder actions: they only close the menu. */
function MetabotMenu() {
  const markAttr = { [METABOT_MENU_ATTR]: true };
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          aria-label={t`Metabot`}
          {...markAttr}
          onClick={(event: MouseEvent) => event.stopPropagation()}
        >
          <Icon name="metabot" c="icon-brand" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown {...markAttr}>
        <Menu.Item>{t`Generate filters`}</Menu.Item>
        <Menu.Item>{t`Summarize`}</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

const SLOT_ATTR = "data-caret-slot";

function CaretSlot({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  return (
    <span className={S.caretSlot} {...{ [SLOT_ATTR]: index }}>
      {children}
    </span>
  );
}

function Gap({ index, onClick }: { index: number; onClick: () => void }) {
  return (
    <span
      className={S.gap}
      {...{ [SLOT_ATTR]: index }}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    />
  );
}

/** A key pressed here is text, not a shortcut. */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** The caret position on the clicked row, nearest horizontally. */
function getSlotNearPoint(
  bar: HTMLElement,
  x: number,
  y: number,
): number | undefined {
  const slots = Array.from(
    bar.querySelectorAll<HTMLElement>(`[${SLOT_ATTR}]`),
  ).map((element) => ({
    index: Number(element.getAttribute(SLOT_ATTR)),
    rect: element.getBoundingClientRect(),
  }));
  if (slots.length === 0) {
    return undefined;
  }
  const distanceY = (rect: DOMRect) => Math.abs(rect.top + rect.height / 2 - y);
  const rowDistance = Math.min(...slots.map((slot) => distanceY(slot.rect)));
  const row = slots.filter(
    (slot) => distanceY(slot.rect) <= rowDistance + slot.rect.height / 2,
  );
  return row.reduce((best, slot) =>
    Math.abs(slot.rect.left - x) < Math.abs(best.rect.left - x) ? slot : best,
  ).index;
}

/** The caret position on the row above or below, nearest horizontally. */
function getSlotOnAdjacentRow(
  bar: HTMLElement,
  caretIndex: number,
  isUp: boolean,
): number | undefined {
  const slots = Array.from(
    bar.querySelectorAll<HTMLElement>(`[${SLOT_ATTR}]`),
  ).map((element) => ({
    index: Number(element.getAttribute(SLOT_ATTR)),
    rect: element.getBoundingClientRect(),
  }));
  const current = slots.find((slot) => slot.index === caretIndex);
  if (!current) {
    return undefined;
  }
  const centerY = (rect: DOMRect) => rect.top + rect.height / 2;
  const currentY = centerY(current.rect);
  const candidates = slots.filter((slot) =>
    isUp
      ? centerY(slot.rect) < current.rect.top
      : centerY(slot.rect) > current.rect.bottom,
  );
  if (candidates.length === 0) {
    return undefined;
  }
  const rowY = candidates
    .map((slot) => centerY(slot.rect))
    .reduce((best, y) =>
      Math.abs(y - currentY) < Math.abs(best - currentY) ? y : best,
    );
  const row = candidates.filter(
    (slot) => Math.abs(centerY(slot.rect) - rowY) < slot.rect.height / 2 + 1,
  );
  const currentX = current.rect.left;
  return row.reduce((best, slot) =>
    Math.abs(slot.rect.left - currentX) < Math.abs(best.rect.left - currentX)
      ? slot
      : best,
  ).index;
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
 * Keys of filters that just appeared from outside the bar (a drill), so
 * they can flash once and show where they landed.
 */
function useFlashedKeys(tokens: Token[], keyOf: KeyOf): Set<string> {
  const labels = useMemo(
    () =>
      tokens.flatMap((token) =>
        token.type === "filter" ? [keyOf(token)] : [],
      ),
    [tokens, keyOf],
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
  queryFor: (stageIndex: number) => Lib.Query;
  /** The bar's own stage; a filter token on another stage is a filter on the summary. */
  stageIndex: number;
  token: Token;
  tokenKey: string;
  isInNotebook: boolean;
  depth: number;
  hasError: boolean;
  isFlashed: boolean;
  /** A relocation just created the token: it fades in. */
  isFresh: boolean;
  /** A relocation just carried the pill here: it pulses once. */
  isMoved: boolean;
  onReplace: (token: Token) => void;
  onRemove: () => void;
  onPopoverChange: (isOpened: boolean) => void;
};

function TokenView({
  queryFor,
  stageIndex,
  token,
  tokenKey,
  isInNotebook,
  depth,
  hasError,
  isFlashed,
  isFresh,
  isMoved,
  onReplace,
  onRemove,
  onPopoverChange,
}: TokenViewProps) {
  const errorClass = cx({ [S.tokenError]: hasError, [S.tokenFresh]: isFresh });

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

  const tokenQuery = queryFor(token.stageIndex);
  return (
    <FilterTokenView
      query={tokenQuery}
      stageIndex={token.stageIndex}
      tokenKey={tokenKey}
      clause={token.clause}
      isInNotebook={isInNotebook}
      isSummary={token.stageIndex !== stageIndex}
      className={cx(errorClass, {
        [S.flash]: isFlashed,
        [S.pillMoved]: isMoved,
      })}
      onReplace={(filterable) =>
        onReplace(
          filterToken(
            toFilterClause(tokenQuery, token.stageIndex, filterable),
            token.stageIndex,
          ),
        )
      }
      onRemove={onRemove}
      onPopoverChange={onPopoverChange}
    />
  );
}

type FilterTokenViewProps = {
  query: Lib.Query;
  stageIndex: number;
  tokenKey: string;
  clause: Lib.FilterClause;
  isInNotebook: boolean;
  /** A filter on the summary: the filter color, a shade darker. */
  isSummary: boolean;
  className?: string;
  onReplace: (filterable: Lib.Filterable) => void;
  onRemove: () => void;
  onPopoverChange: (isOpened: boolean) => void;
};

function FilterTokenView({
  query,
  stageIndex,
  tokenKey,
  clause,
  isInNotebook,
  isSummary,
  className,
  onReplace,
  onRemove,
  onPopoverChange,
}: FilterTokenViewProps) {
  const [isOpened, setIsOpenedState] = useState(false);
  const setIsOpened = (next: boolean | ((opened: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(isOpened) : next;
    if (value !== isOpened) {
      onPopoverChange(value);
    }
    setIsOpenedState(value);
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <Box
          component="span"
          className={cx(S.pill, { [S.pillSummary]: isSummary }, className)}
          title={isSummary ? t`Applies after summarizing` : undefined}
          {...{ [TOKEN_KEY_ATTR]: tokenKey }}
        >
          {isInNotebook ? (
            <NotebookCellItem
              color="core-filter"
              onClick={() => setIsOpened((opened) => !opened)}
            >
              {getFilterLabel(query, stageIndex, clause)}
              <Icon
                className={S.notebookPillClose}
                name="close"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove();
                }}
              />
            </NotebookCellItem>
          ) : (
            <FilterPill
              onClick={() => setIsOpened((opened) => !opened)}
              onRemoveClick={onRemove}
            >
              {getFilterLabel(query, stageIndex, clause)}
            </FilterPill>
          )}
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

function getHiddenSearch(listRef: RefObject<HTMLDivElement>) {
  return listRef.current?.querySelector("input") ?? undefined;
}

/**
 * Types the bar's text into the list's hidden search box, then highlights
 * the best match so Enter picks it.
 */
export function useSearchSync(
  listRef: RefObject<HTMLDivElement>,
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
export function forwardKey(listRef: RefObject<HTMLDivElement>, key: string) {
  getHiddenSearch(listRef)?.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true }),
  );
}
