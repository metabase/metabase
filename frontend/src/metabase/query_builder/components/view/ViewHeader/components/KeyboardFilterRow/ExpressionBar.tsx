import { useUncontrolled } from "@mantine/hooks";
import cx from "classnames";
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  type SyntheticEvent,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLatest, usePrevious } from "react-use";
import { t } from "ttag";
import { noop } from "underscore";

import { getColumnIcon } from "metabase/common/utils/columns";
import {
  ExpressionWidget,
  ExpressionWidgetHeader,
  prefetchExpressionWidget,
} from "metabase/querying/components/expressions";
import { TYPING_PAUSE_MS } from "metabase/querying/filters/components/FilterPicker/FilterAutoApplyContext";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Popover,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { areQueriesEqual } from "../../../FilterAutoApply/utils";

import {
  type CancelReason,
  type ColumnKeyState,
  type DraftChangeSource,
  DraftFilterPill,
  EXTRA_OPTION_PREFIX,
  getFilterPlaceholder,
} from "./DraftFilterPill";
import S from "./ExpressionBar.module.css";
import { type FilterPillPart, FilterPillParts } from "./FilterPillParts";
import RowS from "./KeyboardFilterRow.module.css";
import { PopoverFilterPill } from "./PopoverFilterPill";
import { useLayoutAnimation } from "./layout-animation";
import {
  CLOSE_PAREN,
  LOGIC_KEYWORDS,
  OPEN_PAREN,
  type Token,
  type TokenRange,
  closeUnclosedGroups,
  endsOperand,
  filterToken,
  getFilterLabel,
  getLogicTokens,
  getParenDepths,
  getSummaryStageIndex,
  groupRange,
  hasTopLevelOr,
  insertParen,
  insertToken,
  isOpToken,
  isParenToken,
  matchLogic,
  opToken,
  parseTokens,
  readTokens,
  removeParenPair,
  removePill,
  removePillAt,
  removeRange,
  removeTokenAt,
  replaceTokenAt,
  settleConnectors,
  startsOperand,
  toFilterClause,
  writeTokens,
} from "./tokens";
import type { DraftState, SuggestionGroup } from "./types";
import { getDraftColumn, getDraftStateFromFilter } from "./utils";

export type ExpressionBarProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
  /** Every valid expression commits at once; there is no Apply button. */
  isAutoApply: boolean;
  /** Bumped by the parent (the F shortcut, the header button): the caret goes to the end, open. */
  openKey?: number | null;
  /** The bar folded: it lost the focus and closed its pill. */
  onFold?: () => void;
  /** Pills after the expression, outside it: the summary's own filters. */
  trailing?: ReactNode;
  /**
   * A bar inside another bar's trailing slot, like the summary's filters: no
   * frame of its own, no summaries in its chooser, and every valid edit
   * goes straight to `onChange`.
   */
  isNested?: boolean;
  /** The trailing bar's unapplied edits: Apply writes this bar's filters on top of it. */
  draftQuery?: Lib.Query;
  /** Takes a summary filter picked in the chooser, to apply with the rest. */
  onDraftChange?: (query: Lib.Query) => void;
  /** The trailing bar's parse error: this bar shows it and can't apply. */
  trailingError?: string;
  /** A nested bar reports its parse error to the bar around it instead of showing it. */
  onErrorChange?: (error: string | undefined) => void;
  /** The chooser offers the summary's columns too, after a "then". Off where one stage has its own bar. */
  hasSummaries?: boolean;
  /** Pills styled like the notebook's cells: the step colour, square corners, larger. */
  variant?: ExpressionBarVariant;
  /** The text of the empty bar and of the idle caret at its end. */
  placeholder?: string;
  /**
   * Removes every filter, also the summary's after "then". With it, the bar
   * shows a Clear button at its right end while it has anything to clear.
   */
  onClear?: () => void;
  /**
   * Whether nested parentheses lay out as indented rows. The bar keeps this
   * itself unless a parent shares it with the bars in the trailing slot.
   */
  isRowLayoutOn?: boolean;
  onRowLayoutChange?: (isOn: boolean) => void;
  /** A nested bar reports its nested parentheses to the bar around it, which has the toggle. */
  onHasGroupsChange?: (hasGroups: boolean) => void;
  /** The trailing bars have nested parentheses, so this bar offers the toggle for them. */
  trailingHasGroups?: boolean;
};

export type ExpressionBarVariant = "header" | "notebook";

/** How deep the parentheses must nest before the bar offers to lay them out as rows. */
const ROWS_FROM_NESTING = 2;
const INDENT_REM = 1.5;
const FLASH_MS = 1600;

/**
 * Prototype: on the question page, an empty bar tells how to start, and a bar
 * with pills says "Add a filter..." after the last pill. The notebook keeps
 * its placeholder.
 */
function getPlaceholder(
  placeholder: string | undefined,
  variant: ExpressionBarVariant,
  hasTokens: boolean,
) {
  if (placeholder != null) {
    return placeholder;
  }
  if (variant !== "header") {
    return getFilterPlaceholder();
  }
  if (hasTokens) {
    return t`Add a filter...`;
  }
  return t`Start typing to add a filter...`;
}

/**
 * "Add a filter..." after the pills on the question page, while the bar is
 * idle. Only in a bar of row filters with no summary filters after it: the end
 * of that bar is the end of the row. A click on it goes to the bar, which puts
 * the caret at the end. Focused, the caret's input shows the same text there.
 */
function TrailingPlaceholder({
  variant,
  tokenCount,
  isNested,
  canExitRight,
  text,
  isOpen,
  hasFocus,
  placeholder,
}: {
  variant: ExpressionBarVariant;
  tokenCount: number;
  isNested: boolean;
  canExitRight: boolean;
  text: string;
  isOpen: boolean;
  hasFocus: boolean;
  placeholder: string;
}) {
  const isLastBar = !isNested && !canExitRight;
  const isIdle = text === "" && !isOpen && !hasFocus;
  if (variant !== "header" || tokenCount === 0 || !isLastBar || !isIdle) {
    return null;
  }
  return (
    <span className={cx(S.placeholder, S.trailingPlaceholder)}>
      {placeholder}
    </span>
  );
}

const EXTRA_OPTION = (name: string) => `${EXTRA_OPTION_PREFIX}${name}:`;
const LOGIC_OPTION_PREFIX = EXTRA_OPTION("logic");
const SERIES_OPTION_PREFIX = EXTRA_OPTION("series");
const CUSTOM_EXPRESSION_OPTION = EXTRA_OPTION("custom-expression");

const LOGIC_LABELS: Record<string, string> = {
  AND: "AND",
  OR: "OR",
  "(": "( Start a group",
  ")": ") End the group",
};

const SLOT_ATTR = "data-caret-slot";
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);
const BAR_ATTR = "data-expression-bar";
const PILL_ATTR = "data-pill-index";
/** Prototype: a stable identity per token, so a token that moved can glide there. */
const TOKEN_KEY_ATTR = "data-token-key";
/** Prototype: how long a new connector's fade-in runs; its class comes off after. */
const FRESH_MS = 400;
/** Prototype: how long a token takes to glide to its new place. */
const GLIDE_MS = 420;
const ENTER_AT_START_EVENT = "expression-bar-enter-start";
const ENTER_AT_END_EVENT = "expression-bar-enter-end";
const MOVE_CARET_EVENT = "expression-bar-move-caret";

/** A filter pill that the user edits in place, and the token it replaces if they cancel. */
type PillEdit = {
  index: number;
  original: Token;
  initialState: DraftState;
  part: FilterPillPart;
};

/**
 * While the bar is in use, connectors change only when the user changes them: a
 * removed one leaves a gap, and ANDs show next to an OR or a typed AND. Leaving
 * the bar settles them, so that all of them show if there is an OR, and none
 * otherwise, which is also how the query reads back after a reload.
 */
function useConnectors({
  tokens,
  isExpanded,
  setTokens,
  setCaret,
}: {
  tokens: Token[];
  isExpanded: boolean;
  setTokens: (tokens: Token[]) => void;
  setCaret: (caret: number) => void;
}) {
  const [hasTypedAnd, setHasTypedAnd] = useState(false);
  const hasAnd = tokens.some((token) => isOpToken(token, "and"));
  if (hasTypedAnd && !hasAnd) {
    setHasTypedAnd(false);
  }
  const [wasExpanded, setWasExpanded] = useState(isExpanded);
  if (wasExpanded !== isExpanded) {
    setWasExpanded(isExpanded);
    if (!isExpanded) {
      setHasTypedAnd(false);
      const settled = settleConnectors(tokens);
      if (settled !== tokens) {
        setTokens(settled);
        setCaret(settled.length);
      }
    }
  }
  const hasOr = tokens.some((token) => isOpToken(token, "or"));
  return {
    areAndsVisible: hasOr || hasTypedAnd,
    onTypeAnd: () => setHasTypedAnd(true),
  };
}

/**
 * The bar stays on one line until the toggle or Shift+Enter asks for rows. The
 * choice outlives the focus, and ends when the parentheses stop nesting. The
 * button shows for nested parentheses, and while the rows are on without them.
 */
function useRowLayout({
  hasGroups,
  trailingHasGroups = false,
  isRowLayoutOn,
  onRowLayoutChange,
  onHasGroupsChange,
}: {
  hasGroups: boolean;
  trailingHasGroups?: boolean;
  isRowLayoutOn?: boolean;
  onRowLayoutChange?: (isOn: boolean) => void;
  onHasGroupsChange?: (hasGroups: boolean) => void;
}) {
  const isNesting = hasGroups || trailingHasGroups;
  const wasNesting = usePrevious(isNesting);
  const [isOn, setIsOn] = useUncontrolled({
    value: isRowLayoutOn,
    defaultValue: false,
    onChange: onRowLayoutChange,
  });
  useEffect(() => {
    onHasGroupsChange?.(hasGroups);
  }, [hasGroups, onHasGroupsChange]);
  // Only when the nesting ends, as rows without nesting are a valid choice. A
  // nested bar has no `onRowLayoutChange`, so only the bar with the toggle
  // turns the rows off.
  useEffect(() => {
    if (isOn && wasNesting && !isNesting) {
      setIsOn(false);
    }
  }, [isOn, wasNesting, isNesting, setIsOn]);

  // In the capture phase, so that no input or popover in the bar, also those
  // in a portal or the summary's bar, takes it as a plain Enter.
  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      setIsOn(!isOn);
    }
  };

  return {
    isAvailable: isNesting || isOn,
    isOn,
    layout: isOn ? ("rows" as const) : ("line" as const),
    toggle: () => setIsOn(!isOn),
    handleKeyDownCapture,
  };
}

/**
 * Prototype: the stage's filters as one expression. You type in the bar
 * itself; the popover under the caret is the pill's column list with a
 * "Logic" option (or, parentheses) on top. ANDs are implicit: pills side by
 * side. Nested parentheses can lay out as indented rows, with the toggle or
 * Shift+Enter, and go back to one line when they are no longer nested.
 */
export function ExpressionBar({
  query: queryProp,
  stageIndex,
  onChange,
  isAutoApply,
  openKey,
  onFold,
  trailing,
  isNested = false,
  draftQuery,
  onDraftChange,
  trailingError,
  onErrorChange,
  hasSummaries = true,
  variant = "header",
  placeholder: placeholderProp,
  onClear,
  isRowLayoutOn: isRowLayoutOnProp,
  onRowLayoutChange,
  onHasGroupsChange,
  trailingHasGroups,
}: ExpressionBarProps) {
  const query = useStableQuery(queryProp, stageIndex);
  const committedTokens = useMemo(
    () => readTokens(query, stageIndex),
    [query, stageIndex],
  );
  const [tokens, setTokensState] = useState(committedTokens);
  const placeholder = getPlaceholder(
    placeholderProp,
    variant,
    tokens.length > 0,
  );
  const [caret, setCaret] = useState(committedTokens.length);
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  // Prototype: tokens that a drag or Shift + an arrow key selected, between
  // two caret positions. It belongs to the tokens it was made on, so any
  // other change of the tokens drops it.
  const [selectionState, setSelectionState] = useState<{
    anchor: number;
    focus: number;
    tokens: Token[];
  }>();
  const selection: TokenRange | undefined =
    selectionState?.tokens === tokens
      ? {
          start: Math.min(selectionState.anchor, selectionState.focus),
          end: Math.max(selectionState.anchor, selectionState.focus),
        }
      : undefined;
  const dragRef = useRef<{ anchor: TokenRange; element: Element }>(undefined);
  const didDragRef = useRef(false);
  // Bumped to give the caret a fresh pill, back at its column step.
  const [pillKey, setPillKey] = useState(0);
  const [pillEdit, setPillEdit] = useState<PillEdit>();
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Prototype: every change of the tokens goes through the glide, so that the
  // tokens around an added or removed one slide to their new place.
  const { capture } = useGlide(barRef);
  const setTokens = useCallback(
    (next: SetStateAction<Token[]>) => {
      capture();
      setTokensState(next);
    },
    [capture],
  );
  const tokenKeys = useMemo(
    () =>
      getTokenKeys(tokens, (clause) =>
        getFilterLabel(query, stageIndex, clause),
      ),
    [tokens, query, stageIndex],
  );
  const freshKeys = useFreshConnectorKeys(tokens, tokenKeys);
  const shouldRefocusRef = useRef(false);
  const [hasFocus, setHasFocus] = useState(false);
  const isPointerInBarRef = useRef(false);
  const [openPillCount, setOpenPillCount] = useState(0);
  const isExpanded = hasFocus || isOpen || openPillCount > 0;
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(typingTimeoutRef.current), []);

  // External query changes (drills, the notebook) reset the draft; our own
  // commits keep the caret where it is. Adjusted during render rather than in
  // an effect: an effect would leave one pass where the draft is stale but
  // not edited, and the auto-commit below would write that stale draft back
  // over the new query, which the reset then undoes, forever.
  const isSelfCommitRef = useRef(false);
  const lastAutoCommitRef = useRef<Token[]>(undefined);
  const skipFlashRef = useRef(false);
  // A draft shows no error while it is typed. An apply that fails turns
  // validation on: the error shows and follows every edit until the next
  // successful apply.
  const [isValidating, setIsValidating] = useState(false);
  const [syncedTokens, setSyncedTokens] = useState(committedTokens);
  if (syncedTokens !== committedTokens) {
    setSyncedTokens(committedTokens);
    setIsValidating(false);
    if (isSelfCommitRef.current) {
      isSelfCommitRef.current = false;
      skipFlashRef.current = true;
    } else {
      setTokens(committedTokens);
      setCaret(committedTokens.length);
      setPillEdit(undefined);
    }
  }
  const flashed = useFlashedLabels(
    query,
    stageIndex,
    committedTokens,
    skipFlashRef,
  );

  const pillToFocusRef = useRef<number>(undefined);
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
  const isDirty = ![committedTokens, lastAutoCommitRef.current].includes(
    tokens,
  );
  const baseQuery = draftQuery ?? query;
  const canApply = isDirty || draftQuery != null;
  const parsed = useMemo(() => parseTokens(tokens), [tokens]);
  const ownError = parsed.ok ? undefined : parsed.error;
  const error = ownError ?? trailingError;
  const shownError = isValidating ? error : undefined;
  const shownErrorPositions = useMemo(
    () => new Set(isValidating && !parsed.ok ? parsed.positions : []),
    [isValidating, parsed],
  );
  useEffect(() => {
    onErrorChange?.(ownError);
  }, [ownError, onErrorChange]);
  const parenDepths = useMemo(() => getParenDepths(tokens), [tokens]);
  const nesting = Math.max(
    0,
    ...tokens.map((token, index) =>
      isParenToken(token, "open") ? parenDepths[index] + 1 : 0,
    ),
  );
  const hasGroups = nesting >= ROWS_FROM_NESTING;
  const rowLayout = useRowLayout({
    hasGroups,
    trailingHasGroups,
    isRowLayoutOn: isRowLayoutOnProp,
    onRowLayoutChange,
    onHasGroupsChange,
  });
  useLayoutAnimation(barRef, rowLayout.layout);
  const { areAndsVisible, onTypeAnd } = useConnectors({
    tokens,
    isExpanded,
    setTokens,
    setCaret,
  });
  const isHiddenAnd = (token: Token | undefined) =>
    !areAndsVisible && isOpToken(token, "and");
  const rowStart = (index: number) => {
    if (rowLayout.layout !== "rows") {
      return [];
    }
    if (isParenToken(tokens[index], "open")) {
      return [
        <RowBreak
          key={`row-${index}`}
          isBreak={index > 0}
          indent={parenDepths[index] + 1}
        />,
      ];
    }
    // A hidden AND takes no room, so the row after a group starts at the next visible token.
    if (isHiddenAnd(tokens[index])) {
      return [];
    }
    const closeIndex = isHiddenAnd(tokens[index - 1]) ? index - 2 : index - 1;
    if (isParenToken(tokens[closeIndex], "close")) {
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

  // Two operands with no connector between them, like after an AND was
  // removed: the slot there keeps them apart until one is typed.
  const isMissingConnectorAt = (index: number) =>
    endsOperand(tokens[index - 1]) && startsOperand(tokens[index]);

  // A hidden AND takes no room, so the caret steps over it with its neighbor.
  const caretLeftOf = (index: number) =>
    isHiddenAnd(tokens[index - 1]) && index > 1 ? index - 2 : index - 1;
  const caretRightOf = (index: number) =>
    isHiddenAnd(tokens[index]) && index + 1 < tokens.length
      ? index + 2
      : index + 1;

  // Between caret positions, the arrow keys stop on the token they pass: a
  // pill, a connector or a parenthesis. A hidden AND is stepped over.
  const pillLeftOf = (index: number) => {
    const at = isHiddenAnd(tokens[index - 1]) ? index - 2 : index - 1;
    return tokens[at] != null && !isHiddenAnd(tokens[at]) ? at : undefined;
  };
  const pillRightOf = (index: number) => {
    const at = isHiddenAnd(tokens[index]) ? index + 1 : index;
    return tokens[at] != null && !isHiddenAnd(tokens[at]) ? at : undefined;
  };

  // Next to one connector a typed one takes its place; between two there is
  // no room for another.
  const isTokenAllowed = (token: Token) => {
    if (!isOpToken(token)) {
      return true;
    }
    return !(
      isOpToken(tokens[caretIndex - 1]) && isOpToken(tokens[caretIndex])
    );
  };

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
  const seriesColumns = useMemo(
    () => (isNested || !hasSummaries ? [] : getSeriesColumns(baseQuery)),
    [baseQuery, isNested, hasSummaries],
  );
  // A summary filter always lands after the "then", AND-ed on to every row
  // filter. Picked at the end, an "or" before it gets its parentheses for
  // free; picked inside an "or" or a group, it couldn't stay where the
  // caret is, so it can't be picked there at all.
  const caretDepth = tokens
    .slice(0, caretIndex)
    .reduce(
      (depth, token) =>
        token.type === "paren"
          ? depth + (token.side === "open" ? 1 : -1)
          : depth,
      0,
    );
  const isSummaryAllowed =
    caretDepth === 0 &&
    !isOpToken(tokens[caretIndex - 1], "or") &&
    !isOpToken(tokens[caretIndex], "or") &&
    (caretIndex === tokens.length || !hasTopLevelOr(tokens));
  const seriesGroups: SuggestionGroup[] =
    seriesColumns.length > 0
      ? [
          {
            section: t`Summaries`,
            sectionIcon: "sum",
            options: seriesColumns.map((series, index) => ({
              value: `${SERIES_OPTION_PREFIX}${index}`,
              label: series.label,
              icon: getColumnIcon(series.column),
              disabled: !isSummaryAllowed,
              description: isSummaryAllowed ? undefined : t`Not inside an OR`,
            })),
          },
        ]
      : [];
  // Prototype: the logic operators as a section at the bottom of the column
  // list. A keyword that the user is typing shows above the columns
  // (`logicGroups`), so it isn't listed twice.
  const logicSectionGroup: SuggestionGroup = {
    section: t`Logic`,
    sectionIcon: "calculator",
    options: LOGIC_KEYWORDS.filter(
      (keyword) => keyword.label !== logicMatch?.label,
    ).map((keyword) => ({
      value: `${LOGIC_OPTION_PREFIX}${keyword.label}`,
      label: keyword.label,
      disabled: !isTokenAllowed(keyword.token),
    })),
  };
  const customExpressionGroup: SuggestionGroup = {
    hasDivider: true,
    isUnfiltered: true,
    options: [
      {
        value: CUSTOM_EXPRESSION_OPTION,
        label: t`Custom expression`,
        leftSection: <Icon className={RowS.sectionIcon} name="function" />,
      },
    ],
  };
  const trailingGroups = [...seriesGroups, logicSectionGroup];
  const lastGroups = [customExpressionGroup];
  const [pickedSeries, setPickedSeries] = useState<number>();
  const [isCustomExpressionOpen, setIsCustomExpressionOpen] = useState(false);

  // The widget is a separate chunk. Fetching it while the list is open, and
  // switching in a transition, keeps the list on screen until the widget is ready.
  useEffect(() => {
    if (isOpen) {
      prefetchExpressionWidget();
    }
  }, [isOpen]);

  const handleSelectExtra = (value: string) => {
    if (value === CUSTOM_EXPRESSION_OPTION) {
      startTransition(() => setIsCustomExpressionOpen(true));
    } else if (value.startsWith(LOGIC_OPTION_PREFIX)) {
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
    setIsCustomExpressionOpen(false);
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

  const fold = () => {
    setHasFocus(false);
    onFold?.();
  };

  // Wherever the caret lands, the pill opens there.
  const moveCaret = (index: number, { open = true } = {}) => {
    resetDraft();
    setPillEdit(undefined);
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

  // The summary's bar sits inside this one's trailing slot: the arrow keys
  // cross the "then" from one bar into the other.
  const canExitLeft = isNested;
  const canExitRight = trailing != null && trailing !== false;
  const exitLeft = () => {
    close();
    barRef.current?.parentElement
      ?.closest(`[${BAR_ATTR}]`)
      ?.dispatchEvent(new CustomEvent(ENTER_AT_END_EVENT));
  };
  const exitRight = () => {
    close();
    barRef.current
      ?.querySelector(`.${S.trailing} [${BAR_ATTR}]`)
      ?.dispatchEvent(new CustomEvent(ENTER_AT_START_EVENT));
  };

  const moveLeft = () => {
    const pill = pillLeftOf(caretIndex);
    if (pill != null) {
      selectPill(pill);
    } else if (caretIndex === 0) {
      exitLeft();
    } else {
      moveCaret(caretLeftOf(caretIndex));
    }
  };
  const moveRight = () => {
    const pill = pillRightOf(caretIndex);
    if (pill != null) {
      selectPill(pill);
    } else if (caretIndex === tokens.length) {
      exitRight();
    } else {
      moveCaret(caretRightOf(caretIndex));
    }
  };

  const enterAtStartRef = useLatest(() => moveCaret(0));
  const focusAtEndRef = useLatest(() => moveCaret(tokens.length));
  const moveCaretRef = useLatest(moveCaret);
  useEffect(() => {
    const bar = barRef.current;
    const enterAtStart = () => enterAtStartRef.current();
    const enterAtEnd = () => focusAtEndRef.current();
    const moveCaretTo = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "number") {
        moveCaretRef.current(event.detail);
      }
    };
    bar?.addEventListener(ENTER_AT_START_EVENT, enterAtStart);
    bar?.addEventListener(ENTER_AT_END_EVENT, enterAtEnd);
    bar?.addEventListener(MOVE_CARET_EVENT, moveCaretTo);
    return () => {
      bar?.removeEventListener(ENTER_AT_START_EVENT, enterAtStart);
      bar?.removeEventListener(ENTER_AT_END_EVENT, enterAtEnd);
      bar?.removeEventListener(MOVE_CARET_EVENT, moveCaretTo);
    };
  });

  // The parent asks for a new filter: the caret goes to the end, open.
  useEffect(() => {
    if (openKey != null) {
      focusAtEndRef.current();
    }
  }, [openKey, focusAtEndRef]);

  const insert = (token: Token) => {
    if (!isTokenAllowed(token)) {
      return;
    }
    const isReplacingOp = isOpToken(token);
    const isOpBefore = isReplacingOp && isOpToken(tokens[caretIndex - 1]);
    const isOpAfter = isReplacingOp && isOpToken(tokens[caretIndex]);
    const at = isOpBefore ? caretIndex - 1 : caretIndex;
    const without = tokens.filter(
      (_token, index) =>
        !(isOpBefore && index === caretIndex - 1) &&
        !(isOpAfter && index === caretIndex),
    );
    const next =
      token.type === "paren"
        ? insertParen(tokens, caretIndex, token.side)
        : insertToken(without, at, token);
    setTokens(next.tokens);
    setCaret(next.caret);
    if (isOpToken(token, "and")) {
      onTypeAnd();
    }
    resetDraft();
    focusInput();
  };

  const handlePickFilter = (filterable: Lib.Filterable) => {
    insert(filterToken(toFilterClause(query, stageIndex, filterable)));
  };

  // The AI's filters from one request go in as "a and b and …" at the caret.
  const handlePickFilters = (filterables: Lib.Filterable[], logic?: string) => {
    const filterTokens = filterables.map((filterable) =>
      filterToken(toFilterClause(query, stageIndex, filterable)),
    );
    // Prototype: the AI can combine its filters with OR. Without a valid
    // logic, the filters apply together with AND.
    const logicTokens =
      logic != null ? getLogicTokens(logic, filterTokens) : undefined;
    const newTokens =
      logicTokens ??
      filterTokens.flatMap((token, index) =>
        index > 0 ? [opToken("and"), token] : [token],
      );
    // An OR next to other filters goes in parentheses, so that it does not
    // change what the other filters mean.
    const groupedTokens =
      tokens.length > 0 && hasTopLevelOr(newTokens)
        ? [OPEN_PAREN, ...newTokens, CLOSE_PAREN]
        : newTokens;
    let next = { tokens, caret: caretIndex };
    groupedTokens.forEach((token) => {
      next = insertToken(next.tokens, next.caret, token);
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
        // Closing removes the focused input, which fires no blur: fold the bar here.
        fold();
      }
      return;
    }
    close({ keepFocus: true });
  };

  const selectTokens = (anchor: number, focus: number) => {
    const start = Math.min(anchor, focus);
    const end = Math.max(anchor, focus);
    const hasFilter = tokens
      .slice(start, end)
      .some((token) => token.type === "filter");
    setSelectionState(hasFilter ? { anchor, focus, tokens } : undefined);
  };

  /** The next caret position to the left or the right, past a hidden AND. */
  const stepPosition = (position: number, isLeft: boolean) => {
    if (isLeft) {
      const next = position - 1;
      return next > 0 && isHiddenAnd(tokens[next])
        ? next - 1
        : Math.max(next, 0);
    }
    const next = position + 1;
    return isHiddenAnd(tokens[position]) && next < tokens.length
      ? next + 1
      : Math.min(next, tokens.length);
  };

  /**
   * Prototype: the keys for the selected tokens. Backspace or Delete removes
   * them, a parenthesis puts them in a group, and Shift with an arrow key
   * changes the selection. True when the key was for the selection.
   */
  const handleSelectionKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      event.shiftKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      const isLeft = event.key === "ArrowLeft";
      const anchor = selectionState?.anchor ?? caretIndex;
      const focus = selectionState?.focus ?? caretIndex;
      const nextFocus = stepPosition(
        selection != null ? focus : caretIndex,
        isLeft,
      );
      selectTokens(selection != null ? anchor : caretIndex, nextFocus);
      // The keys go to the idle caret, and the picker closes.
      close({ keepFocus: true });
      return true;
    }
    // Shift, Control, Alt and Meta come before the key that they change.
    if (selection == null || MODIFIER_KEYS.has(event.key)) {
      return false;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      const next = removeRange(tokens, selection);
      setTokens(next.tokens);
      setCaret(next.caret);
      setSelectionState(undefined);
      return true;
    }
    if (event.key === "(" || event.key === ")") {
      const grouped = groupRange(tokens, selection);
      if (grouped != null) {
        setTokens(grouped.tokens);
        setSelectionState({
          anchor: grouped.range.start,
          focus: grouped.range.end,
          tokens: grouped.tokens,
        });
      }
      return true;
    }
    if (event.key === "Escape") {
      setSelectionState(undefined);
      return true;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      setSelectionState(undefined);
      moveCaret(event.key === "ArrowLeft" ? selection.start : selection.end, {
        open: false,
      });
      return true;
    }
    // Any other key, like typing, works on the caret as before.
    setSelectionState(undefined);
    return false;
  };

  /** The tokens under an element of this bar: a pill, or a caret position. */
  const getTokenRangeAt = (target: EventTarget | null) => {
    if (
      !(target instanceof Element) ||
      target.closest(`[${BAR_ATTR}]`) !== barRef.current
    ) {
      return undefined;
    }
    const pill = target.closest(`[${PILL_ATTR}]`);
    if (pill != null) {
      const index = Number(pill.getAttribute(PILL_ATTR));
      return { range: { start: index, end: index + 1 }, element: pill };
    }
    const slot = target.closest(`[${SLOT_ATTR}]`);
    if (slot != null) {
      const index = Number(slot.getAttribute(SLOT_ATTR));
      return { range: { start: index, end: index }, element: slot };
    }
    return undefined;
  };

  /** Prototype: a drag across the pills selects them. */
  const startDragSelection = (event: MouseEvent<HTMLDivElement>) => {
    if (!event.shiftKey) {
      setSelectionState(undefined);
    }
    if (
      event.button !== 0 ||
      (event.target instanceof Element &&
        event.target.closest("input, [data-testid='draft-filter-pill']"))
    ) {
      return;
    }
    const at = getTokenRangeAt(event.target);
    if (at == null) {
      return;
    }
    // Shift and a click select from the highlighted pill, the selection or
    // the caret, to the clicked pill.
    if (event.shiftKey) {
      const highlighted = getTokenRangeAt(document.activeElement);
      const anchorRange =
        selection ??
        (highlighted?.element.hasAttribute(PILL_ATTR)
          ? highlighted.range
          : { start: caretIndex, end: caretIndex });
      const isForward = at.range.end > anchorRange.end;
      selectTokens(
        isForward ? anchorRange.start : anchorRange.end,
        isForward ? at.range.end : at.range.start,
      );
      didDragRef.current = true;
      close({ keepFocus: true });
      return;
    }
    dragRef.current = { anchor: at.range, element: at.element };
    const handleMove = (moveEvent: globalThis.MouseEvent) => {
      const drag = dragRef.current;
      const over = getTokenRangeAt(
        document.elementFromPoint(moveEvent.clientX, moveEvent.clientY),
      );
      if (drag == null || over == null || over.element === drag.element) {
        return;
      }
      didDragRef.current = true;
      const isForward = over.range.end > drag.anchor.end;
      latestSelectTokensRef.current(
        isForward ? drag.anchor.start : drag.anchor.end,
        isForward ? over.range.end : over.range.start,
      );
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      dragRef.current = undefined;
      if (didDragRef.current) {
        // The keys go to the caret, which is idle while tokens are selected.
        latestCloseRef.current({ keepFocus: true });
      }
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp, { once: true });
  };
  const latestSelectTokensRef = useLatest(selectTokens);
  // The pill can keep an old key handler, so the handler reads the selection
  // of the latest render.
  const latestSelectionKeyRef = useLatest(handleSelectionKey);
  const latestCloseRef = useLatest(close);

  const removeTokenBeforeCaret = () => {
    if (caretIndex > 0) {
      // Prototype: a hidden AND is not visible, so Backspace skips it and
      // removes the pill before it. A pill goes with the AND or OR that would
      // dangle, so the next Backspace removes the next pill.
      const index =
        isHiddenAnd(tokens[caretIndex - 1]) && caretIndex > 1
          ? caretIndex - 2
          : caretIndex - 1;
      const isEmptyGroup =
        isParenToken(tokens[index], "open") &&
        isParenToken(tokens[index + 1], "close");
      const getNextTokens = () => {
        if (tokens[index].type === "filter") {
          return removePill(tokens, index);
        }
        return {
          tokens: isEmptyGroup
            ? removeParenPair(tokens, index)
            : removeTokenAt(tokens, index),
          caret: index,
        };
      };
      const { tokens: next, caret } = getNextTokens();
      setTokens(next);
      setCaret(caret);
      resetDraft();
      // With its last pill gone, the summary's bar goes away: keep deleting in the rows bar.
      if (isNested && next.length === 0) {
        exitLeft();
      }
    } else if (isNested) {
      exitLeft();
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

  // With auto-apply there is no Apply: every valid expression goes straight to the question.
  useEffect(() => {
    if ((isAutoApply || isNested) && isDirty && parsed.ok) {
      lastAutoCommitRef.current = tokens;
      const nextQuery = writeTokens(query, stageIndex, tokens);
      // An equal query never comes back as a new `query`, so nothing would
      // consume the flag.
      isSelfCommitRef.current = !areQueriesEqual(query, nextQuery);
      onChange(nextQuery);
    }
  }, [
    isAutoApply,
    isNested,
    isDirty,
    parsed.ok,
    query,
    stageIndex,
    tokens,
    onChange,
  ]);

  // The query drops parentheses it doesn't need, like those of the group the
  // caret may still be in, so an applied draft stays as typed until the bar
  // folds. Then it reads the way the query does, once its commit has arrived.
  useEffect(() => {
    const isAppliedDraft =
      tokens === lastAutoCommitRef.current && tokens !== committedTokens;
    if (!isExpanded && isAppliedDraft && !isSelfCommitRef.current) {
      setTokens(committedTokens);
      setCaret(committedTokens.length);
    }
  }, [isExpanded, tokens, committedTokens, setTokens]);

  // Prototype: Clear empties the bar and opens a new pill at its start, as in
  // an empty bar. The parent removes the filters of every stage in one
  // change, so the auto-commit above skips the empty tokens: writing them
  // too would race the parent's change.
  const resetForClear = () => {
    const emptyTokens: Token[] = [];
    lastAutoCommitRef.current = emptyTokens;
    setTokens(emptyTokens);
    moveCaret(0);
  };

  const commit = () => {
    const closedTokens = closeUnclosedGroups(tokens);
    const isClosingGroups = closedTokens !== tokens;
    // An expression that does not parse blocks the apply and shows why.
    if (!parseTokens(closedTokens).ok || trailingError != null) {
      setIsValidating(true);
      return;
    }
    if (canApply || isClosingGroups) {
      const nextQuery = writeTokens(baseQuery, stageIndex, closedTokens);
      if (isClosingGroups) {
        setTokens(closedTokens);
        lastAutoCommitRef.current = closedTokens;
        isSelfCommitRef.current = !areQueriesEqual(query, nextQuery);
      }
      onChange(nextQuery);
    }
    close();
    // The focus may sit in the open pill's input rather than the caret's.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && barRef.current?.contains(focused)) {
      focused.blur();
    }
    fold();
  };

  // The bar's own keys in the pill's column step: logic tokens, caret moves
  // between tokens, Apply on Enter, and Escape to close.
  const handleColumnKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    { text: typed, hasSelectedOption }: ColumnKeyState,
  ) => {
    const input = event.currentTarget;

    if (typed.length === 0 && latestSelectionKeyRef.current(event)) {
      return true;
    }
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
      // While the column picker is open, arrows belong to its suggestions.
      // Moving between expression rows is handled by the idle caret.
      setHasNavigated(true);
      return false;
    }
    if (event.key === "Escape") {
      if (typed.length > 0) {
        resetDraft();
      } else {
        // Focus reopens the picker, so Escape leaves the bar instead. Closing
        // removes the focused input, which fires no blur: fold the bar here.
        close();
        fold();
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
      (caretIndex > 0 || canExitLeft)
    ) {
      moveLeft();
      return true;
    }
    if (
      event.key === "ArrowRight" &&
      input.selectionEnd === typed.length &&
      (caretIndex < tokens.length || canExitRight)
    ) {
      moveRight();
      return true;
    }
    return false;
  };

  // The idle caret, after the pill closed: the same moves, and any key opens the pill.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;

    if (text.length === 0 && latestSelectionKeyRef.current(event)) {
      event.preventDefault();
      return;
    }
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
    if (event.key === "ArrowLeft" && (caretIndex > 0 || canExitLeft)) {
      event.preventDefault();
      moveLeft();
      return;
    }
    if (
      event.key === "ArrowRight" &&
      (caretIndex < tokens.length || canExitRight)
    ) {
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
        target.closest(
          `button, input, .${S.filterToken}, .${S.connector}, [${SLOT_ATTR}]`,
        ) != null);
    if (isOnControl) {
      return;
    }
    const slot = getSlotNearPoint(currentTarget, event.clientX, event.clientY);
    const slotBar = slot?.element.closest(`[${BAR_ATTR}]`);
    // The nearest slot can be in the summary's bar, at the end of this one.
    if (slot != null && slotBar != null && slotBar !== currentTarget) {
      close();
      slotBar.dispatchEvent(
        new CustomEvent(MOVE_CARET_EVENT, { detail: slot.index }),
      );
    } else {
      moveCaret(slot?.index ?? tokens.length);
    }
  };

  // Editing a pill in place: its token is replaced on submit, or at each
  // change with auto-apply, and restored if the user gives up.
  const startPillEdit = (index: number, part: FilterPillPart) => {
    const token = tokens[index];
    const initialState =
      token.type === "filter"
        ? getDraftStateFromFilter(query, stageIndex, token.clause)
        : undefined;
    if (token.type !== "filter" || initialState == null) {
      return;
    }
    resetDraft();
    setIsOpen(false);
    setPillEdit({ index, original: token, initialState, part });
  };
  const replacePill = (index: number, filterable: Lib.Filterable) => {
    setTokens((current) =>
      replaceTokenAt(
        current,
        index,
        filterToken(toFilterClause(query, stageIndex, filterable)),
      ),
    );
  };
  const endPillEdit = () => {
    clearTimeout(typingTimeoutRef.current);
    setPillEdit(undefined);
  };
  const handlePillEditDraftChange = (
    filter: Lib.ExpressionClause | undefined,
    source: DraftChangeSource,
  ) => {
    clearTimeout(typingTimeoutRef.current);
    if (!isAutoApply || pillEdit == null || filter == null) {
      return;
    }
    if (source === "selection") {
      replacePill(pillEdit.index, filter);
    } else {
      typingTimeoutRef.current = setTimeout(
        () => replacePill(pillEdit.index, filter),
        TYPING_PAUSE_MS,
      );
    }
  };
  const cancelPillEdit = () => {
    if (pillEdit != null) {
      setTokens((current) =>
        replaceTokenAt(current, pillEdit.index, pillEdit.original),
      );
    }
    endPillEdit();
  };

  // The caret is the draft pill while it's open: the column chooser with the
  // logic tokens on top, then the operator and the values, all inline. Closed,
  // it's a plain text caret that reopens the pill on any key.
  const series = pickedSeries != null ? seriesColumns[pickedSeries] : undefined;
  const isPlaceholderShown =
    !isNested && !canExitRight && text === "" && caretIndex === tokens.length;
  const caretView = series ? (
    <SeriesFilterDraft
      series={series}
      onApply={(nextQuery) => {
        setPickedSeries(undefined);
        close({ keepFocus: true });
        if (onDraftChange) {
          onDraftChange(nextQuery);
        } else {
          onChange(
            parsed.ok ? writeTokens(nextQuery, stageIndex, tokens) : nextQuery,
          );
        }
      }}
      onClose={() => {
        setPickedSeries(undefined);
        close({ keepFocus: true });
      }}
    />
  ) : isCustomExpressionOpen ? (
    <CustomExpressionDraft
      query={query}
      stageIndex={stageIndex}
      onApply={handlePickFilter}
      onBack={() => setIsCustomExpressionOpen(false)}
      onCancel={() => handlePillCancel("click-outside")}
    />
  ) : isOpen ? (
    <DraftFilterPill
      key={`${caretIndex}:${pillKey}`}
      query={query}
      hasPlaceholder={caretIndex === tokens.length && !canExitRight}
      placeholder={placeholder}
      stageIndex={stageIndex}
      initialText={text}
      leadingGroups={logicGroups}
      trailingGroups={trailingGroups}
      lastGroups={lastGroups}
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
            ? `${placeholder.length}ch`
            : `calc(${text.length}ch + 2px)`,
        }}
        placeholder={isPlaceholderShown ? placeholder : undefined}
        value={text}
        aria-label={t`Filter expression`}
        onChange={(event) => {
          setText(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          // With tokens selected, the caret takes the keys for them, and the
          // picker stays closed.
          if (selection == null) {
            setIsOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
      />
    </span>
  );

  const caretSlot = (
    <CaretSlot
      key="caret"
      index={caretIndex}
      isAtEnd={caretIndex === tokens.length && !canExitRight}
      isWide={isMissingConnectorAt(caretIndex)}
    >
      {caretView}
    </CaretSlot>
  );

  return (
    <Box
      className={cx(S.barRoot, { [S.barNestedRoot]: isNested })}
      onKeyDownCapture={rowLayout.handleKeyDownCapture}
      onMouseDown={(event) => {
        startDragSelection(event);
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
          fold();
          if (isNested) {
            close();
          }
        }
      }}
    >
      <Box
        ref={barRef}
        className={cx(S.bar, {
          [S.barRows]: rowLayout.layout === "rows",
          [S.barNested]: isNested,
        })}
        onClick={handleBarClick}
        onClickCapture={(event) => {
          // The click at the end of a drag does not open the pill under it.
          if (didDragRef.current) {
            didDragRef.current = false;
            event.stopPropagation();
          }
        }}
        data-testid="filter-expression-bar"
        data-empty={tokens.length === 0 && !trailing ? true : undefined}
        data-variant={variant}
        data-layout={rowLayout.layout}
        {...{ [BAR_ATTR]: true }}
      >
        {/* One keyed array holds the caret so React moves it instead of remounting it. */}
        {[
          ...tokens.flatMap((token, index) => [
            ...rowStart(index),
            index === caretIndex ? (
              caretSlot
            ) : (
              <Gap
                key={`gap-${index}`}
                index={index}
                isWide={isMissingConnectorAt(index)}
                onClick={() => moveCaret(index)}
              />
            ),
            pillEdit?.index === index && token.type === "filter" ? (
              <span
                key={`token-${index}`}
                className={S.filterToken}
                {...{ [TOKEN_KEY_ATTR]: tokenKeys[index] }}
              >
                <DraftFilterPill
                  key={`edit-${index}`}
                  query={query}
                  stageIndex={stageIndex}
                  filter={token.clause}
                  initialState={pillEdit.initialState}
                  initialEditedPart={
                    pillEdit.part === "values" ? undefined : pillEdit.part
                  }
                  hasPlaceholder={false}
                  onDraftChange={handlePillEditDraftChange}
                  onSubmit={(filterable) => {
                    replacePill(index, filterable);
                    endPillEdit();
                  }}
                  onSubmitFilters={handlePickFilters}
                  onDone={endPillEdit}
                  onCancel={(reason) => {
                    cancelPillEdit();
                    // Escape goes back to the pill, selected, as before Enter.
                    if (reason === "escape") {
                      selectPill(index);
                    }
                  }}
                  onRemove={() => {
                    endPillEdit();
                    const next = removePillAt(tokens, index);
                    setTokens(next);
                    setCaret(Math.min(caretIndex, next.length));
                  }}
                />
              </span>
            ) : (
              <TokenView
                key={`token-${index}`}
                index={index}
                tokenKey={tokenKeys[index]}
                query={query}
                stageIndex={stageIndex}
                token={token}
                depth={parenDepths[index]}
                isFresh={freshKeys.has(tokenKeys[index])}
                isAndHidden={!areAndsVisible}
                isSelected={
                  selection != null &&
                  index >= selection.start &&
                  index < selection.end
                }
                hasError={shownErrorPositions.has(index)}
                isFlashed={
                  token.type === "filter" &&
                  flashed.has(getFilterLabel(query, stageIndex, token.clause))
                }
                onReplace={(next) =>
                  setTokens(replaceTokenAt(tokens, index, next))
                }
                onEdit={(part) => startPillEdit(index, part)}
                onPopoverChange={(isOpened) =>
                  setOpenPillCount((count) => count + (isOpened ? 1 : -1))
                }
                onLeave={(isLeft) => moveCaret(isLeft ? index : index + 1)}
                onExtendSelection={(isLeft) => {
                  // The selection starts with this pill and the next one in
                  // the direction of the arrow, and the caret takes the keys.
                  const anchor = isLeft ? index + 1 : index;
                  const focus = stepPosition(
                    isLeft ? index : index + 1,
                    isLeft,
                  );
                  moveCaret(focus, { open: false });
                  selectTokens(anchor, focus);
                }}
                onRemove={() => {
                  // An AND leaves a gap for the OR that replaces it: the caret
                  // goes there, open, and the stream stays a draft until then.
                  if (isOpToken(token, "and")) {
                    setTokens(removeTokenAt(tokens, index));
                    moveCaret(index);
                    return;
                  }
                  const next =
                    token.type === "paren"
                      ? removeParenPair(tokens, index)
                      : removePillAt(tokens, index);
                  setTokens(next);
                  setCaret(Math.min(caretIndex, next.length));
                }}
              />
            ),
          ]),
          ...rowStart(tokens.length),
          caretIndex === tokens.length ? (
            caretSlot
          ) : (
            <Gap
              key="gap-end"
              index={tokens.length}
              onClick={() => moveCaret(tokens.length)}
            />
          ),
          // The separator parts the filters on the rows from the filters on the summary.
          ...(trailing && tokens.length > 0
            ? [<StageSeparatorMark key="stage-separator" />]
            : []),
          ...(trailing
            ? [
                // The summary's bar is its own: clicks and focus there stay out of this one.
                <Box
                  key="trailing"
                  component="span"
                  className={S.trailing}
                  onFocus={(event) => {
                    event.stopPropagation();
                    close();
                  }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    close();
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  {trailing}
                </Box>,
              ]
            : []),
        ]}
        {tokens.length === 0 &&
          !trailing &&
          text === "" &&
          !isOpen &&
          !hasFocus && <span className={S.placeholder}>{placeholder}</span>}
        <TrailingPlaceholder
          variant={variant}
          tokenCount={tokens.length}
          isNested={isNested}
          canExitRight={canExitRight}
          text={text}
          isOpen={isOpen}
          hasFocus={hasFocus}
          placeholder={placeholder}
        />
      </Box>
      {/* Beside the tokens rather than among them: rows never move these. */}
      {!isNested && (
        <Group
          className={S.barActions}
          gap="xs"
          pl="md"
          wrap="nowrap"
          data-variant={variant}
        >
          <RowLayoutButton
            isAvailable={rowLayout.isAvailable}
            isOn={rowLayout.isOn}
            onToggle={rowLayout.toggle}
          />
          <ClearButton
            tokenCount={tokens.length}
            hasTrailingFilters={canExitRight}
            onReset={resetForClear}
            onClear={onClear}
          />
          {shownError != null && (
            <Text size="sm" c="feedback-negative" lh="1">
              {shownError}
            </Text>
          )}
          {canApply && !isAutoApply && (
            <Button size="compact-sm" variant="filled" onClick={commit}>
              {t`Apply`}
            </Button>
          )}
        </Group>
      )}
    </Box>
  );
}

/** Next to the Clear button and styled like it, and filled when on. */
function RowLayoutButton({
  isAvailable,
  isOn,
  onToggle,
}: {
  isAvailable: boolean;
  isOn: boolean;
  onToggle: () => void;
}) {
  if (!isAvailable) {
    return null;
  }
  return (
    <Tooltip label={t`Show on multiple rows`}>
      <ActionIcon
        className={cx({ [S.barActionButton]: !isOn })}
        variant={isOn ? "filled" : "subtle"}
        size="md"
        aria-label={t`Show on multiple rows`}
        aria-pressed={isOn}
        onClick={onToggle}
      >
        <Icon name="text_quote" />
      </ActionIcon>
    </Tooltip>
  );
}

/**
 * Prototype: the Clear button, a cross with no background until hovered.
 * It shows while the bar has anything to clear: pills or connectors,
 * or the summary's filters after "then".
 */
function ClearButton({
  tokenCount,
  hasTrailingFilters,
  onReset,
  onClear,
}: {
  tokenCount: number;
  hasTrailingFilters: boolean;
  /** Empties the bar and opens a new pill. */
  onReset: () => void;
  /** Removes the filters from the query. */
  onClear: (() => void) | undefined;
}) {
  if (onClear == null || (tokenCount === 0 && !hasTrailingFilters)) {
    return null;
  }
  const handleClick = () => {
    onReset();
    onClear();
  };
  return (
    <Tooltip label={t`Clear filters`}>
      <ActionIcon
        className={S.barActionButton}
        variant="subtle"
        size="md"
        aria-label={t`Clear filters`}
        onClick={handleClick}
      >
        <Icon name="close" />
      </ActionIcon>
    </Tooltip>
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
  const stageIndex = getSummaryStageIndex(query);
  if (stageIndex == null) {
    return [];
  }
  const aggregatedStage = stageIndex - 1;
  const names = new Set(
    Lib.returnedColumns(query, aggregatedStage)
      .map((column) => Lib.displayInfo(query, aggregatedStage, column))
      .filter((info) => info.isAggregation)
      .map((info) => info.name),
  );
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

/**
 * A summary picked in the column list: the inline pill on the summary stage,
 * with the column set, so it starts at the operator.
 */
function SeriesFilterDraft({
  series,
  onApply,
  onClose,
}: SeriesFilterDraftProps) {
  const { query, stageIndex, column } = series;
  const initialState = useMemo(
    () => ({ column: getDraftColumn(query, stageIndex, column), values: [] }),
    [query, stageIndex, column],
  );
  const apply = (filterables: Lib.Filterable[]) =>
    onApply(
      filterables.reduce(
        (nextQuery, filterable) =>
          Lib.filter(
            nextQuery,
            stageIndex,
            toFilterClause(nextQuery, stageIndex, filterable),
          ),
        query,
      ),
    );
  return (
    <DraftFilterPill
      query={query}
      stageIndex={stageIndex}
      initialState={initialState}
      hasPlaceholder={false}
      onDraftChange={noop}
      onSubmit={(filterable) => apply([filterable])}
      onSubmitFilters={apply}
      onDone={onClose}
      onCancel={onClose}
      onRemove={onClose}
    />
  );
}

interface CustomExpressionDraftProps {
  query: Lib.Query;
  stageIndex: number;
  onApply: (filterable: Lib.Filterable) => void;
  onBack: () => void;
  onCancel: () => void;
}

/** The custom expression editor, opened at the caret from the column list. */
function CustomExpressionDraft({
  query,
  stageIndex,
  onApply,
  onBack,
  onCancel,
}: CustomExpressionDraftProps) {
  const availableColumns = useMemo(
    () => Lib.expressionableColumns(query, stageIndex),
    [query, stageIndex],
  );
  // React events bubble out of the portal to the bar, whose handlers would
  // block focus and text selection in the editor and fold the bar on blur.
  const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();
  return (
    <Popover
      opened
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={(isOpened) => {
        if (!isOpened) {
          onCancel();
        }
      }}
    >
      <Popover.Target>
        <span className={S.typing} />
      </Popover.Target>
      <Popover.Dropdown
        className={RowS.popover}
        data-testid="custom-expression-dropdown"
      >
        <Box
          onMouseDown={stopPropagation}
          onClick={stopPropagation}
          onFocus={stopPropagation}
          onBlur={stopPropagation}
        >
          <ExpressionWidget
            query={query}
            stageIndex={stageIndex}
            availableColumns={availableColumns}
            expressionMode="filter"
            header={<ExpressionWidgetHeader onBack={onBack} />}
            onChangeClause={(_name, clause) => onApply(clause)}
            onClose={onBack}
          />
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}

function CaretSlot({
  index,
  isAtEnd,
  isWide,
  children,
}: {
  index: number;
  isAtEnd: boolean;
  /** Holds room between two operands that have no connector yet. */
  isWide: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(S.caretSlot, {
        [S.caretSlotMid]: !isAtEnd,
        [S.slotWide]: isWide,
      })}
      {...{ [SLOT_ATTR]: index }}
    >
      {children}
    </span>
  );
}

function Gap({
  index,
  isWide = false,
  onClick,
}: {
  index: number;
  isWide?: boolean;
  onClick: () => void;
}) {
  return (
    <span
      className={cx(S.gap, { [S.slotWide]: isWide })}
      {...{ [SLOT_ATTR]: index }}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    />
  );
}

/** The caret position on the clicked row, nearest horizontally. */
function getSlotNearPoint(
  bar: HTMLElement,
  x: number,
  y: number,
): { index: number; element: HTMLElement } | undefined {
  const slots = Array.from(
    bar.querySelectorAll<HTMLElement>(`[${SLOT_ATTR}]`),
  ).map((element) => ({
    element,
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
  );
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

/**
 * Prototype: a key per token that survives the tokens around it changing. A
 * pill is its label; a parenthesis belongs to the pill it opens before or
 * closes after; a connector to the pills on both sides of it. Repeats get a
 * counter, so two "(" before one pill stay two keys.
 */
function getTokenKeys(
  tokens: readonly Token[],
  labelOf: (clause: Lib.FilterClause) => string,
): string[] {
  const counts = new Map<string, number>();
  const unique = (base: string) => {
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base}#${count}`;
  };
  const filterKeys = tokens.map((token) =>
    token.type === "filter" ? unique(`filter:${labelOf(token.clause)}`) : null,
  );
  const nextFilterKey = (index: number) =>
    filterKeys.slice(index + 1).find((key) => key != null) ?? "end";
  const previousFilterKey = (index: number) =>
    filterKeys
      .slice(0, index)
      .reverse()
      .find((key) => key != null) ?? "start";
  return tokens.map((token, index) => {
    if (token.type === "filter") {
      return filterKeys[index] ?? "";
    }
    if (token.type === "paren") {
      return unique(
        token.side === "open"
          ? `(:${nextFilterKey(index)}`
          : `):${previousFilterKey(index)}`,
      );
    }
    // AND and OR share a key: toggling one is not a new connector.
    return unique(`op:${previousFilterKey(index)}|${nextFilterKey(index)}`);
  });
}

/**
 * Prototype: the keys of connectors and parentheses that the last change of
 * the tokens added, for as long as their fade-in runs. Worked out while
 * rendering, so the first paint already starts the animation.
 */
function useFreshConnectorKeys(
  tokens: readonly Token[],
  tokenKeys: readonly string[],
): ReadonlySet<string> {
  const [previousKeys, setPreviousKeys] = useState(tokenKeys);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  if (previousKeys !== tokenKeys) {
    setPreviousKeys(tokenKeys);
    const previous = new Set(previousKeys);
    const added = tokenKeys.filter(
      (key, index) => tokens[index].type !== "filter" && !previous.has(key),
    );
    if (added.length > 0) {
      setFresh(new Set(added));
    }
  }
  useEffect(() => {
    if (fresh.size === 0) {
      return;
    }
    const timeout = setTimeout(() => setFresh(new Set()), FRESH_MS);
    return () => clearTimeout(timeout);
  }, [fresh]);
  return fresh;
}

/**
 * Prototype: FLIP for the tokens. `capture` records where each token is before
 * the tokens change; after the next render every token that moved is set back
 * to its old place with a transform, then released to glide to its new one.
 * Only the bar's own tokens: the nested summary bar glides its own.
 */
function useGlide(barRef: RefObject<HTMLElement | null>) {
  const snapshotRef = useRef<Map<string, DOMRect>>(undefined);

  const capture = useCallback(() => {
    const bar = barRef.current;
    if (!bar || snapshotRef.current) {
      return;
    }
    const rects = new Map<string, DOMRect>();
    bar
      .querySelectorAll<HTMLElement>(`:scope > [${TOKEN_KEY_ATTR}]`)
      .forEach((element) => {
        const key = element.getAttribute(TOKEN_KEY_ATTR);
        if (key != null) {
          rects.set(key, element.getBoundingClientRect());
        }
      });
    snapshotRef.current = rects;
  }, [barRef]);

  useLayoutEffect(() => {
    const snapshot = snapshotRef.current;
    const bar = barRef.current;
    if (!snapshot || !bar) {
      return;
    }
    snapshotRef.current = undefined;
    const moving: HTMLElement[] = [];
    bar
      .querySelectorAll<HTMLElement>(`:scope > [${TOKEN_KEY_ATTR}]`)
      .forEach((element) => {
        const key = element.getAttribute(TOKEN_KEY_ATTR);
        const before = key != null ? snapshot.get(key) : undefined;
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
    if (
      moving.length === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      moving.forEach((element) => {
        element.style.transition = "";
        element.style.transform = "";
      });
      return;
    }
    // Never cancelled: React may render again before the next frame (a
    // keystroke flushes effects at once), and a cancelled release would leave
    // the token stuck at its old place. A token captured again mid-glide is
    // measured where it is, so the next glide carries on from there.
    requestAnimationFrame(() => {
      moving.forEach((element) => {
        element.style.transition = `transform ${GLIDE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
        element.style.transform = "";
      });
    });
    setTimeout(() => {
      moving.forEach((element) => {
        element.style.transition = "";
      });
    }, GLIDE_MS + 80);
  });

  return { capture };
}

/**
 * Labels of filters that just appeared from outside the bar (a drill), so
 * they can flash once and show where they landed. The bar's own commits are
 * skipped through `skipRef`.
 */
function useFlashedLabels(
  query: Lib.Query,
  stageIndex: number,
  tokens: Token[],
  skipRef: { current: boolean },
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
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const added = labels.filter((label) => !previous.has(label));
    if (added.length === 0) {
      return;
    }
    setFlashed(new Set(added));
    const timeout = setTimeout(() => setFlashed(new Set()), FLASH_MS);
    return () => clearTimeout(timeout);
  }, [labels, skipRef]);

  return flashed;
}

type TokenViewProps = {
  index: number;
  tokenKey: string;
  query: Lib.Query;
  stageIndex: number;
  token: Token;
  depth: number;
  /** ANDs are implicit: nothing drawn between the pills they join. */
  isAndHidden: boolean;
  /** Prototype: in the tokens that a drag or Shift + an arrow selected. */
  isSelected: boolean;
  hasError: boolean;
  isFlashed: boolean;
  /** Prototype: a connector or parenthesis that just appeared fades in. */
  isFresh: boolean;
  onReplace: (token: Token) => void;
  onEdit: (part: FilterPillPart) => void;
  onRemove: () => void;
  onPopoverChange: (isOpened: boolean) => void;
  onLeave: (isLeft: boolean) => void;
  /** Prototype: Shift and an arrow key on the pill start a selection. */
  onExtendSelection: (isLeft: boolean) => void;
};

function TokenView({
  index,
  tokenKey,
  query,
  stageIndex,
  token,
  depth,
  isAndHidden,
  isSelected,
  hasError,
  isFlashed,
  isFresh,
  onReplace,
  onEdit,
  onRemove,
  onPopoverChange,
  onLeave,
  onExtendSelection,
}: TokenViewProps) {
  const errorClass = cx({
    [S.tokenError]: hasError,
    [S.tokenSelected]: isSelected,
  });
  const connectorClass = cx(errorClass, { [S.tokenFresh]: isFresh });

  if (token.type === "op" && token.op === "and" && isAndHidden) {
    return null;
  }

  if (token.type === "op") {
    const isAnd = token.op === "and";
    return (
      <Connector
        index={index}
        tokenKey={tokenKey}
        label={token.op.toUpperCase()}
        className={connectorClass}
        // Removing an OR leaves the implicit AND; removing an AND leaves the gap open.
        onRemove={isAnd ? onRemove : () => onReplace(opToken("and"))}
        onToggle={() => onReplace(opToken(isAnd ? "or" : "and"))}
        onLeave={onLeave}
      />
    );
  }

  if (token.type === "paren") {
    return (
      <Connector
        index={index}
        tokenKey={tokenKey}
        label={token.side === "open" ? "(" : ")"}
        className={cx(S.connectorParen, connectorClass)}
        style={{ opacity: Math.max(1 - depth * 0.25, 0.5) }}
        onRemove={onRemove}
        onLeave={onLeave}
      />
    );
  }

  const className = cx(S.filterToken, errorClass, { [S.flash]: isFlashed });
  const draft = getDraftStateFromFilter(query, stageIndex, token.clause);
  const { column, operator } = draft ?? {};
  if (draft == null || column == null || operator == null) {
    return (
      <PopoverFilterPill
        query={query}
        stageIndex={stageIndex}
        filter={token.clause}
        className={cx(RowS.pill, className)}
        pillAttributes={{ [PILL_ATTR]: index, [TOKEN_KEY_ATTR]: tokenKey }}
        onSelect={(filterable) =>
          onReplace(filterToken(toFilterClause(query, stageIndex, filterable)))
        }
        onRemove={onRemove}
        onOpenedChange={onPopoverChange}
        onLeave={onLeave}
      />
    );
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    // Prototype: ArrowDown opens the pill like Enter, as it opens a dropdown.
    if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      onEdit("values");
    } else if (
      event.shiftKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      event.preventDefault();
      onExtendSelection(event.key === "ArrowLeft");
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onLeave(event.key === "ArrowLeft");
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      onRemove();
    }
  };

  return (
    <div
      className={cx(RowS.pill, className)}
      data-testid="filter-pill"
      tabIndex={-1}
      onClick={() => onEdit("values")}
      onKeyDown={handleKeyDown}
      {...{ [PILL_ATTR]: index, [TOKEN_KEY_ATTR]: tokenKey }}
    >
      <FilterPillParts
        columnLabel={column.label}
        operator={operator}
        values={draft.values}
        onPartClick={onEdit}
      />
      <Icon
        className={RowS.removeIcon}
        name="close"
        size={12}
        role="button"
        aria-label={t`Remove filter`}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      />
    </div>
  );
}

type ConnectorProps = {
  index: number;
  tokenKey: string;
  label: string;
  className?: string;
  style?: CSSProperties;
  /** Hovering turns the connector into a close button; a click removes it. */
  onRemove?: () => void;
  /** Enter on the focused connector: AND to OR and back. */
  onToggle?: () => void;
  /** Left or Right pressed on the focused connector. */
  onLeave: (isLeft: boolean) => void;
};

/**
 * AND, OR or a parenthesis, as in the Figma: a small grey pill in monospace.
 * Hovered, it is all close button. The arrow keys land on it like on a pill.
 */
function Connector({
  index,
  tokenKey,
  label,
  className,
  style,
  onRemove,
  onToggle,
  onLeave,
}: ConnectorProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Enter" && onToggle) {
      event.preventDefault();
      onToggle();
    } else if (
      (event.key === "Backspace" || event.key === "Delete") &&
      onRemove
    ) {
      event.preventDefault();
      onRemove();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onLeave(event.key === "ArrowLeft");
    }
  };

  return (
    <span
      className={cx(
        S.connector,
        { [S.connectorRemovable]: onRemove != null },
        className,
      )}
      style={style}
      role={onRemove ? "button" : undefined}
      aria-label={onRemove ? t`Remove ${label}` : undefined}
      tabIndex={-1}
      onClick={onRemove}
      onKeyDown={handleKeyDown}
      {...{ [PILL_ATTR]: index, [TOKEN_KEY_ATTR]: tokenKey }}
    >
      <span className={S.connectorLabel}>{label}</span>
      {onRemove && (
        <span className={S.connectorIcon} aria-hidden>
          <Icon name="close" size={12} />
        </span>
      )}
    </span>
  );
}

/** Parts the rows' filters from the summary's. Never a token: nothing to click or select. */
function StageSeparatorMark() {
  return (
    <span className={S.stageSeparator} aria-hidden>
      {t`then`}
    </span>
  );
}

/**
 * The same query object for as long as the query itself stays the same: the
 * notebook hands out a new object on every render, which would reset the
 * draft each time anything else on the page changes.
 *
 * A query with the same MBQL can have more metadata: a new question first
 * knows only the target IDs of its foreign keys, and gets the other columns
 * of those tables later. The number of filterable columns shows that change.
 */
function useStableQuery(query: Lib.Query, stageIndex: number) {
  const [stableQuery, setStableQuery] = useState(query);
  if (
    stableQuery !== query &&
    (!areQueriesEqual(stableQuery, query) ||
      Lib.filterableColumns(stableQuery, stageIndex).length !==
        Lib.filterableColumns(query, stageIndex).length)
  ) {
    setStableQuery(query);
    return query;
  }
  return stableQuery;
}
