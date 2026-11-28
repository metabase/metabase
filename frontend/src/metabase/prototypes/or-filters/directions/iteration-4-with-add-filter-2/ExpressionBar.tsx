import cx from "classnames";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
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
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import { NotebookCellItem } from "metabase/querying/notebook/components/NotebookCell";
import { Box, Button, Group, Icon, Popover, Text } from "metabase/ui";
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
  writeTokens,
} from "../expression-bar-2/tokens";
import { matchLogic } from "../expression-bar-drill/LogicColumnList";

import S from "./ExpressionBar.module.css";
import {
  type CancelReason,
  type ColumnKeyState,
  DraftFilterPill,
  EXTRA_OPTION_PREFIX,
  getFilterPlaceholder,
} from "./draft-pill/DraftFilterPill";
import type { SuggestionGroup } from "./draft-pill/types";

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
};

const INDENT_REM = 1.5;

const EXTRA_OPTION = (name: string) => `${EXTRA_OPTION_PREFIX}${name}:`;
const LOGIC_OPTION_PREFIX = EXTRA_OPTION("logic");
const SERIES_OPTION_PREFIX = EXTRA_OPTION("series");

const LOGIC_LABELS: Record<string, string> = {
  OR: "OR",
  "(": "( Start a group",
  ")": ") End the group",
};

/** The logic keywords a typed word can turn into. */
const LOGIC_KEYWORDS = [
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
}: ExpressionBarProps) {
  const committedTokens = useMemo(
    () => readTokens(query, stageIndex),
    [query, stageIndex],
  );
  const [tokens, setTokens] = useState(committedTokens);
  const [caret, setCaret] = useState(committedTokens.length);
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  // Bumped to give the caret a fresh pill, back at its column step.
  const [pillKey, setPillKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const shouldRefocusRef = useRef(false);
  const flashed = useFlashedLabels(query, stageIndex, committedTokens);
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
    if (isSelfCommitRef.current) {
      isSelfCommitRef.current = false;
    } else {
      setCaret(committedTokens.length);
    }
  }

  const pillToFocusRef = useRef<number>();
  const focusInput = () => {
    shouldRefocusRef.current = true;
  };
  useLayoutEffect(() => {
    if (shouldRefocusRef.current) {
      shouldRefocusRef.current = false;
      inputRef.current?.focus();
    }
    if (pillToFocusRef.current != null) {
      barRef.current
        ?.querySelector<HTMLElement>(
          `[${PILL_ATTR}="${pillToFocusRef.current}"]`,
        )
        ?.focus();
      pillToFocusRef.current = undefined;
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
    // ANDs are hidden, so the row after a group starts at the next visible token.
    if (isHiddenAndToken(tokens[index])) {
      return [];
    }
    const closeIndex = isHiddenAndToken(tokens[index - 1])
      ? index - 2
      : index - 1;
    if (isCloseParen(tokens[closeIndex])) {
      return [
        <RowBreak
          key={`row-${index}`}
          isBreak
          indent={parenDepths[closeIndex]}
        />,
      ];
    }
    return [];
  };

  // A hidden AND takes no room, so the caret steps over it with its neighbor.
  const caretLeftOf = (index: number) =>
    isHiddenAndToken(tokens[index - 1]) && index > 1 ? index - 2 : index - 1;
  const caretRightOf = (index: number) =>
    isHiddenAndToken(tokens[index]) && index + 1 < tokens.length
      ? index + 2
      : index + 1;

  // Between caret positions, the arrow keys stop on the filter pill they pass.
  const pillLeftOf = (index: number) => {
    const at = isHiddenAndToken(tokens[index - 1]) ? index - 2 : index - 1;
    return tokens[at]?.type === "filter" ? at : undefined;
  };
  const pillRightOf = (index: number) => {
    const at = isHiddenAndToken(tokens[index]) ? index + 1 : index;
    return tokens[at]?.type === "filter" ? at : undefined;
  };

  // Two operators can't sit side by side, so next to one the logic row offers none.
  // ANDs are implicit here: an OR may take the place of one next to the caret.
  const isOp = (token?: Token) => token?.type === "op";
  const isAnd = (token?: Token) => token?.type === "op" && token.op === "and";
  const isTokenAllowed = (token: Token) =>
    !isAnd(token) &&
    (!isOp(token) ||
      ((!isOp(tokens[caretIndex - 1]) || isAnd(tokens[caretIndex - 1])) &&
        (!isOp(tokens[caretIndex]) || isAnd(tokens[caretIndex]))));

  // The text typed in the pill's column step, for the logic row: a typed
  // keyword lights up, and Space or Enter enters it, unless the arrow keys
  // moved into the column list.
  const [typed, setTyped] = useState("");
  const [hasNavigated, setHasNavigated] = useState(false);
  const typedLogic = matchLogic(typed);
  const logicMatch =
    typedLogic && isTokenAllowed(typedLogic.token) && !hasNavigated
      ? typedLogic
      : undefined;
  const logicGroups: SuggestionGroup[] = logicMatch
    ? [
        {
          isUnfiltered: true,
          options: [
            {
              value: `${LOGIC_OPTION_PREFIX}${logicMatch.label}`,
              label: LOGIC_LABELS[logicMatch.label] ?? logicMatch.label,
              description: t`Logic`,
            },
          ],
        },
      ]
    : [];
  const seriesColumns = useMemo(() => getSeriesColumns(query), [query]);
  const seriesGroups: SuggestionGroup[] =
    seriesColumns.length > 0
      ? [
          {
            section: t`Chart series`,
            options: seriesColumns.map((series, index) => ({
              value: `${SERIES_OPTION_PREFIX}${index}`,
              label: series.label,
              icon: "sum",
            })),
          },
        ]
      : [];
  const [pickedSeries, setPickedSeries] = useState<number>();

  const handleSelectExtra = (value: string) => {
    if (value.startsWith(LOGIC_OPTION_PREFIX)) {
      const label = value.slice(LOGIC_OPTION_PREFIX.length);
      const keyword = LOGIC_KEYWORDS.find((option) => option.label === label);
      if (keyword) {
        insert(keyword.token);
      }
    } else if (value.startsWith(SERIES_OPTION_PREFIX)) {
      setPickedSeries(Number(value.slice(SERIES_OPTION_PREFIX.length)));
    }
  };

  const handleTypedChange = (newTyped: string) => {
    setTyped(newTyped);
    setHasNavigated(false);
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
      focusInput();
    }
  };

  // Wherever the caret lands, the pill opens there.
  const moveCaret = (index: number, { open = true } = {}) => {
    resetDraft();
    setCaret(index);
    setIsOpen(open);
    focusInput();
  };

  // A selected pill takes the focus from the caret, which idles where it was.
  const selectPill = (index: number) => {
    resetDraft();
    setIsOpen(false);
    pillToFocusRef.current = index;
  };

  const moveLeft = () => {
    const pill = pillLeftOf(caretIndex);
    if (pill != null) {
      selectPill(pill);
    } else {
      moveCaret(caretLeftOf(caretIndex));
    }
  };
  const moveRight = () => {
    const pill = pillRightOf(caretIndex);
    if (pill != null) {
      selectPill(pill);
    } else {
      moveCaret(caretRightOf(caretIndex));
    }
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

  const insert = (token: Token) => {
    if (!isTokenAllowed(token)) {
      return;
    }
    const isReplacingAnd = isOp(token);
    const isAndBefore = isReplacingAnd && isAnd(tokens[caretIndex - 1]);
    const isAndAfter = isReplacingAnd && isAnd(tokens[caretIndex]);
    const at = isAndBefore ? caretIndex - 1 : caretIndex;
    const without = tokens.filter(
      (_token, index) =>
        !(isAndBefore && index === caretIndex - 1) &&
        !(isAndAfter && index === caretIndex),
    );
    const next = insertToken(without, at, token);
    setTokens(next.tokens);
    setCaret(next.caret);
    resetDraft();
    focusInput();
  };

  const handlePickFilter = (filterable: Lib.Filterable) => {
    insert(filterToken(toFilterClause(query, stageIndex, filterable)));
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
        filterToken(toFilterClause(query, stageIndex, filterable)),
      );
    });
    setTokens(next.tokens);
    setCaret(next.caret);
    resetDraft();
    focusInput();
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
      setTokens(removeTokenAt(tokens, caretIndex - 1));
      setCaret(caretIndex - 1);
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
      onChange(writeTokens(query, stageIndex, tokens));
    }
  }, [isInNotebook, isDirty, parsed.ok, query, stageIndex, tokens, onChange]);

  const commit = () => {
    if (parsed.ok && isDirty) {
      onChange(writeTokens(query, stageIndex, tokens));
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
        // Focus reopens the picker, so Escape leaves the bar instead.
        close();
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
      moveLeft();
      return true;
    }
    if (
      event.key === "ArrowRight" &&
      input.selectionEnd === typed.length &&
      caretIndex < tokens.length
    ) {
      moveRight();
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
    if (event.key === "Backspace" && text.length === 0) {
      event.preventDefault();
      removeTokenBeforeCaret();
      return;
    }
    if (event.key === "ArrowLeft" && caretIndex > 0) {
      event.preventDefault();
      moveLeft();
      return;
    }
    if (event.key === "ArrowRight" && caretIndex < tokens.length) {
      event.preventDefault();
      moveRight();
    }
  };

  // Anywhere in the bar that isn't a token or a control puts the caret at the end.
  const handleBarClick = (event: MouseEvent<HTMLDivElement>) => {
    const { target, currentTarget } = event;
    const isOnControl =
      target instanceof Element &&
      (!currentTarget.contains(target) ||
        target.closest(`button, input, .${S.pill}, [${SLOT_ATTR}]`) != null);
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
  const series = pickedSeries != null ? seriesColumns[pickedSeries] : undefined;
  // At the end, the idle caret says what can be typed, like the empty bar does.
  const idlePlaceholder = getFilterPlaceholder();
  const isPlaceholderShown = text === "" && caretIndex === tokens.length;
  const caretView = series ? (
    <SeriesFilterDraft
      series={series}
      onApply={(nextQuery) => {
        setPickedSeries(undefined);
        close({ keepFocus: true });
        onChange(nextQuery);
      }}
      onClose={() => {
        setPickedSeries(undefined);
        close({ keepFocus: true });
      }}
    />
  ) : isOpen ? (
    <DraftFilterPill
      key={`${caretIndex}:${pillKey}`}
      query={query}
      hasPlaceholder={caretIndex === tokens.length}
      stageIndex={stageIndex}
      initialText={text}
      leadingGroups={logicGroups}
      trailingGroups={seriesGroups}
      onSelectExtra={handleSelectExtra}
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
        style={{
          width: isPlaceholderShown
            ? `${idlePlaceholder.length}ch`
            : `calc(${text.length}ch + 2px)`,
        }}
        placeholder={isPlaceholderShown ? idlePlaceholder : undefined}
        value={text}
        aria-label={t`Filter expression`}
        onChange={(event) => {
          setText(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
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
          }
        }}
        data-testid="qb-filters-panel"
      >
        {/* One keyed array holds the caret so React moves it instead of remounting it. */}
        {[
          ...tokens.flatMap((token, index) => [
            ...rowStart(index),
            index === caretIndex ? (
              <CaretSlot
                key="caret"
                index={caretIndex}
                isAtEnd={caretIndex === tokens.length}
              >
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
              index={index}
              query={query}
              stageIndex={stageIndex}
              token={token}
              isInNotebook={isInNotebook}
              depth={parenDepths[index]}
              hasError={index === errorPosition}
              isFlashed={
                token.type === "filter" &&
                flashed.has(getFilterLabel(query, stageIndex, token.clause))
              }
              onReplace={(next) =>
                setTokens(replaceTokenAt(tokens, index, next))
              }
              onPopoverChange={(isOpened) =>
                setOpenPillCount((count) => count + (isOpened ? 1 : -1))
              }
              onLeave={(isLeft) => moveCaret(isLeft ? index : index + 1)}
              onRemove={() => {
                const next = removeTokenAt(tokens, index);
                setTokens(next);
                setCaret(Math.min(caretIndex, next.length));
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
            <CaretSlot
              key="caret"
              index={caretIndex}
              isAtEnd={caretIndex === tokens.length}
            >
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
        {tokens.length === 0 &&
          !trailing &&
          text === "" &&
          !isOpen &&
          !hasFocus && (
            <span className={S.placeholder}>{getFilterPlaceholder()}</span>
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
        </Group>
      </Box>
    </Box>
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

const SLOT_ATTR = "data-caret-slot";
const PILL_ATTR = "data-pill-index";

type SeriesColumn = {
  label: string;
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
};

/**
 * The series the chart draws: the aggregations of the last stage that has
 * any, filtered on the stage after it. Earlier summaries aren't offered.
 */
function getSeriesColumns(query: Lib.Query): SeriesColumn[] {
  const aggregatedStages = Array.from(
    { length: Lib.stageCount(query) },
    (_, stageIndex) => stageIndex,
  ).filter((stageIndex) => Lib.aggregations(query, stageIndex).length > 0);
  const lastAggregatedStage = aggregatedStages.at(-1);
  if (lastAggregatedStage == null) {
    return [];
  }
  const names = new Set(
    Lib.returnedColumns(query, lastAggregatedStage)
      .map((column) => Lib.displayInfo(query, lastAggregatedStage, column))
      .filter((info) => info.isAggregation)
      .map((info) => info.name),
  );
  const stageIndex = lastAggregatedStage + 1;
  const summaryQuery =
    Lib.stageCount(query) > stageIndex ? query : Lib.appendStage(query);
  return Lib.filterableColumns(summaryQuery, stageIndex)
    .map((column) => ({
      column,
      info: Lib.displayInfo(summaryQuery, stageIndex, column),
    }))
    .filter(({ info }) => names.has(info.name))
    .map(({ column, info }) => ({
      label: info.displayName,
      query: summaryQuery,
      stageIndex,
      column,
    }));
}

type SeriesFilterDraftProps = {
  series: SeriesColumn;
  onApply: (query: Lib.Query) => void;
  onClose: () => void;
};

/** A series picked in the column list: its pill, with the app's own filter picker. */
function SeriesFilterDraft({
  series,
  onApply,
  onClose,
}: SeriesFilterDraftProps) {
  const { query, stageIndex, column } = series;
  return (
    <Popover
      opened
      position="bottom-start"
      onChange={(opened) => !opened && onClose()}
    >
      <Popover.Target>
        <Box component="span" className={S.pill}>
          <FilterPill onClick={noop} onRemoveClick={onClose}>
            {series.label}
          </FilterPill>
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPickerBody
          query={query}
          stageIndex={stageIndex}
          column={column}
          onChange={(clause) =>
            onApply(
              Lib.filter(
                query,
                stageIndex,
                toFilterClause(query, stageIndex, clause),
              ),
            )
          }
        />
      </Popover.Dropdown>
    </Popover>
  );
}

function isHiddenAndToken(token?: Token) {
  return token?.type === "op" && token.op === "and";
}

function CaretSlot({
  index,
  isAtEnd,
  children,
}: {
  index: number;
  isAtEnd: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(S.caretSlot, S.caretSlotSpaced, {
        [S.caretSlotMid]: !isAtEnd,
      })}
      {...{ [SLOT_ATTR]: index }}
    >
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
  index: number;
  query: Lib.Query;
  stageIndex: number;
  token: Token;
  isInNotebook: boolean;
  depth: number;
  hasError: boolean;
  isFlashed: boolean;
  onReplace: (token: Token) => void;
  onRemove: () => void;
  onPopoverChange: (isOpened: boolean) => void;
  onLeave: (isLeft: boolean) => void;
};

function TokenView({
  index,
  query,
  stageIndex,
  token,
  isInNotebook,
  depth,
  hasError,
  isFlashed,
  onReplace,
  onRemove,
  onPopoverChange,
  onLeave,
}: TokenViewProps) {
  const errorClass = hasError ? S.tokenError : undefined;

  // ANDs stay implicit: just the gaps around them, like pills side by side.
  if (token.type === "op" && token.op === "and") {
    return null;
  }

  if (token.type === "op") {
    return (
      <button
        type="button"
        className={cx(S.op, S.opOr, errorClass)}
        title={t`Click to remove`}
        onClick={() => onReplace(opToken("and"))}
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
      index={index}
      query={query}
      stageIndex={stageIndex}
      clause={token.clause}
      isInNotebook={isInNotebook}
      className={cx(errorClass, { [S.flash]: isFlashed })}
      onReplace={(filterable) =>
        onReplace(filterToken(toFilterClause(query, stageIndex, filterable)))
      }
      onRemove={onRemove}
      onPopoverChange={onPopoverChange}
      onLeave={onLeave}
    />
  );
}

type FilterTokenViewProps = {
  index: number;
  query: Lib.Query;
  stageIndex: number;
  clause: Lib.FilterClause;
  isInNotebook: boolean;
  className?: string;
  onReplace: (filterable: Lib.Filterable) => void;
  onRemove: () => void;
  onPopoverChange: (isOpened: boolean) => void;
  onLeave: (isLeft: boolean) => void;
};

function FilterTokenView({
  index,
  query,
  stageIndex,
  clause,
  isInNotebook,
  className,
  onReplace,
  onRemove,
  onPopoverChange,
  onLeave,
}: FilterTokenViewProps) {
  const [isOpened, setIsOpenedState] = useState(false);
  const setIsOpened = (next: boolean | ((opened: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(isOpened) : next;
    if (value !== isOpened) {
      onPopoverChange(value);
    }
    setIsOpenedState(value);
  };

  // Opened from the keyboard, the pill takes the focus back once its editor
  // closes, unless a click already moved it elsewhere.
  const pillRef = useRef<HTMLSpanElement>(null);
  const isOpenedFromKeyRef = useRef(false);
  useEffect(() => {
    if (!isOpened && isOpenedFromKeyRef.current) {
      isOpenedFromKeyRef.current = false;
      const isFocusLost =
        document.activeElement == null ||
        document.activeElement === document.body;
      if (isFocusLost) {
        pillRef.current?.focus();
      }
    }
  }, [isOpened]);

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      isOpenedFromKeyRef.current = true;
      setIsOpened(true);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onLeave(event.key === "ArrowLeft");
    }
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
          ref={pillRef}
          component="span"
          className={cx(S.pill, className)}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          {...{ [PILL_ATTR]: index }}
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
