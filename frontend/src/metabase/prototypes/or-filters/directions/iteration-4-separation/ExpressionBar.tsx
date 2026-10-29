import cx from "classnames";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

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
  toggleOperator,
  writeTokens,
} from "../expression-bar-2/tokens";
import {
  LogicColumnList,
  matchLogic,
} from "../expression-bar-drill/LogicColumnList";
import { compactLabel } from "../expression-bar-unified/ExpressionBar";
import UnifiedS from "../expression-bar-unified/ExpressionBar.module.css";
import { useSummaryZonePlacement } from "../expression-bar-unified/SummaryPills";
import { CompactReadingContext } from "../expression-bar-unified/settings";

import S from "./ExpressionBar.module.css";

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

/**
 * The drill-through bar that lays parentheses out as indented rows while you
 * edit, and folds back into one line on blur.
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
  // Arrow keys mean the next Enter picks from the list, not "apply".
  const [hasNavigated, setHasNavigated] = useState(false);
  const [draftColumn, setDraftColumn] = useState<Lib.ColumnMetadata>();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const shouldRefocusRef = useRef(false);
  const flashed = useFlashedLabels(query, stageIndex, committedTokens);
  const [hasFocus, setHasFocus] = useState(false);
  const isPointerInBarRef = useRef(false);
  const [openPillCount, setOpenPillCount] = useState(0);
  // The summary's filters keep to the right, like the split bar's summary zone.
  const trailingRef = useSummaryZonePlacement<HTMLSpanElement>();

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
  // Shorter comparisons while reading; editing shows the full labels.
  const isCompact =
    useContext(CompactReadingContext) && !isExpanded && !isDirty;
  // Plain AND-ed filters read as the QB's pills: no connectors between them until you edit.
  const isPlainAnd = tokens.every(
    (token) => token.type === "filter" || isAndToken(token),
  );
  const hidesAnds = isPlainAnd && !isExpanded;
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

  // Typing toward a keyword highlights it in the logic row, not a column.
  const typedMatch = hasNavigated ? undefined : matchLogic(text);
  const logicMatch =
    typedMatch && isTokenAllowed(typedMatch.token) ? typedMatch : undefined;
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

  // Arrow keys keep the popover as it is, so a closed one stays closed.
  const moveCaret = (index: number, { open = true } = {}) => {
    resetDraft();
    setCaret(index);
    if (open) {
      setIsOpen(true);
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

  const insert = (token: Token) => {
    if (!isTokenAllowed(token)) {
      return;
    }
    const next = insertToken(tokens, caretIndex, token);
    setTokens(next.tokens);
    setCaret(next.caret);
    resetDraft();
    focusInput();
  };

  const handlePickFilter = (filterable: Lib.Filterable) => {
    insert(filterToken(toFilterClause(query, stageIndex, filterable)));
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
    if (event.key === "ArrowUp" && isOpen && !hasNavigated) {
      event.preventDefault();
      close();
      return;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !isOpen) {
      const bar = barRef.current;
      const target =
        bar && getSlotOnAdjacentRow(bar, caretIndex, event.key === "ArrowUp");
      if (target != null) {
        event.preventDefault();
        moveCaret(target, { open: false });
        return;
      }
      // Up on the top row stays put; Down on the last row opens the list.
      if (event.key === "ArrowUp") {
        event.preventDefault();
        return;
      }
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
      } else if (isOpen) {
        close();
      } else {
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
      moveCaret(caretIndex - 1, { open: isOpen });
      return;
    }
    if (
      event.key === "ArrowRight" &&
      input.selectionEnd === text.length &&
      caretIndex < tokens.length
    ) {
      event.preventDefault();
      moveCaret(caretIndex + 1, { open: isOpen });
    }
  };

  // Anywhere in the bar that isn't a token, a control or the summary's filters puts the caret at the end.
  const handleBarClick = (event: MouseEvent<HTMLDivElement>) => {
    const { target, currentTarget } = event;
    const isOnControl =
      target instanceof Element &&
      (!currentTarget.contains(target) ||
        target.closest(
          `button, input, .${S.pill}, .${S.trailing}, [${SLOT_ATTR}]`,
        ) != null);
    if (!isOnControl) {
      moveCaret(
        getSlotNearPoint(currentTarget, event.clientX, event.clientY) ??
          tokens.length,
      );
    }
  };

  // Plain text at the caret; a pill only once a column is picked.
  const caretView = (
    <Popover
      opened={isOpen}
      position="bottom-start"
      trapFocus={false}
      returnFocus={false}
      transitionProps={{ duration: 0 }}
      // A click elsewhere in the bar only moves the caret; the popover stays.
      onChange={(opened) => !opened && !isPointerInBarRef.current && close()}
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
          <span
            className={cx(S.typing, {
              [S.typingIdle]: !isOpen,
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
            isTokenAllowed={isTokenAllowed}
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
        onFocus={() => setHasFocus(true)}
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
              <CaretSlot key="caret" index={caretIndex}>
                {caretView}
              </CaretSlot>
            ) : (
              <Gap
                key={`gap-${index}`}
                index={index}
                className={cx({
                  [S.gapHiddenAnd]: hidesAnds && isAndToken(token),
                })}
                onClick={() => moveCaret(index)}
              />
            ),
            hidesAnds && isAndToken(token) ? null : (
              <TokenView
                key={`token-${index}`}
                query={query}
                stageIndex={stageIndex}
                token={token}
                isInNotebook={isInNotebook}
                isCompact={isCompact}
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
                onRemove={() => {
                  const next = removeTokenAt(tokens, index);
                  setTokens(next);
                  setCaret(Math.min(caretIndex, next.length));
                }}
              />
            ),
          ]),
          ...rowStart(tokens.length),
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
          // After the end slot: the caret never gets past the summary's filters.
          ...(trailing
            ? [
                // Focusing these shouldn't unfold the bar.
                <Box
                  key="trailing"
                  ref={trailingRef}
                  component="span"
                  className={cx(S.trailing, UnifiedS.summaryZone)}
                  onFocus={(event) => event.stopPropagation()}
                >
                  {trailing}
                </Box>,
              ]
            : []),
        ]}
        {tokens.length === 0 && text === "" && draftColumn == null && (
          <span className={S.placeholder}>{t`Type to filter…`}</span>
        )}
        {/* The summary's filters take the free space when present, so these only push right without them. */}
        <Group
          gap="sm"
          ml={trailing ? undefined : "auto"}
          pl="md"
          wrap="nowrap"
        >
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

const isAndToken = (token: Token) => token.type === "op" && token.op === "and";

function RowBreak({ isBreak, indent }: { isBreak: boolean; indent: number }) {
  return (
    <>
      {isBreak && <span className={S.rowBreak} />}
      <span style={{ width: `${indent * INDENT_REM}rem`, flexShrink: 0 }} />
    </>
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

function Gap({
  index,
  className,
  onClick,
}: {
  index: number;
  className?: string;
  onClick: () => void;
}) {
  return (
    <span
      className={cx(S.gap, className)}
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
  isInNotebook: boolean;
  isCompact: boolean;
  depth: number;
  hasError: boolean;
  isFlashed: boolean;
  onReplace: (token: Token) => void;
  onRemove: () => void;
  onPopoverChange: (isOpened: boolean) => void;
};

function TokenView({
  query,
  stageIndex,
  token,
  isInNotebook,
  isCompact,
  depth,
  hasError,
  isFlashed,
  onReplace,
  onRemove,
  onPopoverChange,
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
      isInNotebook={isInNotebook}
      isCompact={isCompact}
      className={cx(errorClass, { [S.flash]: isFlashed })}
      onReplace={(filterable) =>
        onReplace(filterToken(toFilterClause(query, stageIndex, filterable)))
      }
      onRemove={onRemove}
      onPopoverChange={onPopoverChange}
    />
  );
}

type FilterTokenViewProps = {
  query: Lib.Query;
  stageIndex: number;
  clause: Lib.FilterClause;
  isInNotebook: boolean;
  isCompact: boolean;
  className?: string;
  onReplace: (filterable: Lib.Filterable) => void;
  onRemove: () => void;
  onPopoverChange: (isOpened: boolean) => void;
};

function FilterTokenView({
  query,
  stageIndex,
  clause,
  isInNotebook,
  isCompact,
  className,
  onReplace,
  onRemove,
  onPopoverChange,
}: FilterTokenViewProps) {
  const [isOpened, setIsOpenedState] = useState(false);
  const fullLabel = getFilterLabel(query, stageIndex, clause);
  const label = isCompact && !isOpened ? compactLabel(fullLabel) : fullLabel;
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
        <Box component="span" className={cx(S.pill, className)}>
          {isInNotebook ? (
            <NotebookCellItem
              color="core-filter"
              onClick={() => setIsOpened((opened) => !opened)}
            >
              {label}
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
              {label}
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
