import cx from "classnames";
import {
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Menu,
  Popover,
  Stack,
  Text,
} from "metabase/ui";
import type * as Lib from "metabase-lib";

import { getFilterLabel, toFilterClause } from "../../harness/clauses";
import { Token as TokenPill } from "../or-pills/Token";

const FRESH_TOKEN_FLASH_MS = 1500;

import S from "./ExpressionBar.module.css";
import {
  type DropdownView,
  FilterSearchDropdown,
  activateSuggestion,
  useSuggestions,
} from "./FilterSearchDropdown";
import {
  type BoolOperator,
  CLOSE_PAREN,
  NOT_TOKEN,
  OPEN_PAREN,
  type Token,
  type TokenRange,
  enclosingGroup,
  filterToken,
  insertToken,
  matchingParen,
  negateRange,
  opToken,
  operandRange,
  parenGroupRange,
  parseTokens,
  parseTypedToken,
  readTokens,
  removeParenPair,
  removeRange,
  removeTokenAt,
  replaceTokenAt,
  setOperators,
  toggleOperator,
  wrapRange,
  writeTokens,
} from "./tokens";

/** Lets a parent move the caret into the bar, e.g. when arrowing in from a neighbouring segment. */
export type ExpressionBarHandle = {
  focusAt: (position: "start" | "end") => void;
};

type ExpressionBarProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
  handleRef?: Ref<ExpressionBarHandle>;
  /** Arrow key pressed at the very start of the bar; the caret has nowhere to go here. */
  onExitStart?: () => void;
  /** Arrow key pressed at the very end of the bar. */
  onExitEnd?: () => void;
  /**
   * `false` for the segment after a summary: "or" is rejected and the
   * operator pills do not toggle, since the summary's filters can only be
   * AND-ed with the rows before it.
   */
  allowOr?: boolean;
  placeholder?: string;
  /**
   * `"segment"` renders the tokens without a box of their own, so a parent
   * row can lay several segments out as one wrapping stream. Status and
   * Cancel/Apply then go on a full-width line at the end of that row.
   */
  layout?: "bar" | "segment";
  /** Extra class on the bar box, or on the segment wrapper in segment layout. */
  className?: string;
  /** Segment layout only: rendered before the first token, e.g. a stage badge. */
  leading?: ReactNode;
  /** Cancel/Apply live inside the bar instead of a trailing "+" button. */
  hasInlineActions?: boolean;
  /** Renders Cancel/Apply elsewhere, e.g. in a modal footer. */
  renderActions?: (actions: {
    canApply: boolean;
    apply: () => void;
    cancel: () => void;
  }) => ReactNode;
};

/**
 * Direction B, structure editing: one expression bar. Filters are atomic
 * tokens picked from a dropdown; `and`, `or`, `not` and parentheses are typed
 * between them. Shift+arrows select a range of tokens to group, negate,
 * re-operator or delete; operators and parentheses open a menu of the same
 * structure edits. Edits are a draft until Enter or "Apply".
 */
export function ExpressionBar({
  query,
  stageIndex,
  onChange,
  handleRef,
  onExitStart,
  onExitEnd,
  allowOr = true,
  placeholder = t`Type a column, "and", "or", "("…`,
  layout = "bar",
  className,
  leading,
  hasInlineActions = false,
  renderActions,
}: ExpressionBarProps) {
  const committedTokens = useMemo(
    () => readTokens(query, stageIndex),
    [query, stageIndex],
  );
  const [tokens, setTokens] = useState(committedTokens);
  const [caret, setCaret] = useState(committedTokens.length);
  const [text, setText] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownView, setDropdownView] = useState<DropdownView>({
    type: "list",
  });
  const [activeIndex, setActiveIndex] = useState(0);
  // Arrow keys mean the next Enter picks a suggestion, not "apply".
  const [hasNavigated, setHasNavigated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldRefocusRef = useRef(false);
  const previousCommittedRef = useRef(committedTokens);
  const isOwnCommitRef = useRef(false);
  const [freshIndexes, setFreshIndexes] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  // The other end of a token selection; the caret is the end that moves.
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [hoveredParen, setHoveredParen] = useState<number | null>(null);
  // Tokens a menu item would act on, shown while the item is hovered.
  const [previewRange, setPreviewRange] = useState<TokenRange | null>(null);

  // External query changes (examples, drills, other frames) drop the draft
  // and briefly highlight what arrived.
  useEffect(() => {
    const previous = previousCommittedRef.current;
    previousCommittedRef.current = committedTokens;
    setTokens(committedTokens);
    setCaret(committedTokens.length);
    setSelectionAnchor(null);

    const isOwnCommit = isOwnCommitRef.current;
    isOwnCommitRef.current = false;
    const fresh = isOwnCommit
      ? new Set<number>()
      : freshTokenIndexes(previous, committedTokens);
    setFreshIndexes(fresh);
    if (fresh.size === 0) {
      return;
    }
    const timeout = setTimeout(
      () => setFreshIndexes(new Set()),
      FRESH_TOKEN_FLASH_MS,
    );
    return () => clearTimeout(timeout);
  }, [committedTokens]);

  const isDirty = tokens !== committedTokens;
  const parsed = useMemo(
    () => parseTokens(tokens, { allowOr }),
    [tokens, allowOr],
  );
  const errorPosition = parsed.ok ? undefined : parsed.position;
  const selection = getSelection(selectionAnchor, caret);
  const hoveredParenRange =
    hoveredParen != null ? parenGroupRange(tokens, hoveredParen) : undefined;
  const caretParen = getCaretParen(tokens, caret);
  const caretParenRange =
    caretParen != null ? parenGroupRange(tokens, caretParen) : undefined;
  const suggestions = useSuggestions(query, stageIndex, text, { allowOr });

  // Moving the caret moves the input's DOM node, which blurs it; refocus after render.
  const focusInput = () => {
    shouldRefocusRef.current = true;
  };
  useLayoutEffect(() => {
    if (shouldRefocusRef.current) {
      shouldRefocusRef.current = false;
      inputRef.current?.focus();
    }
  });

  useImperativeHandle(handleRef, () => ({
    focusAt: (position) => {
      setCaret(position === "start" ? 0 : tokens.length);
      setSelectionAnchor(null);
      // When the caret already sits there nothing re-renders, so focus now;
      // when it moves, the input remounts and the layout effect refocuses it.
      inputRef.current?.focus();
      focusInput();
    },
  }));

  const openDropdown = () => {
    setDropdownView({ type: "list" });
    setActiveIndex(0);
    setHasNavigated(false);
    setIsDropdownOpen(true);
  };

  const closeDropdown = () => {
    setIsDropdownOpen(false);
    setDropdownView({ type: "list" });
    setHasNavigated(false);
    setText("");
  };

  const showColumnWidget = (column: Lib.ColumnMetadata) => {
    setText("");
    setDropdownView({ type: "column", column });
  };

  const showBrowse = () => {
    setText("");
    setDropdownView({ type: "browse" });
  };

  /** Replaces the draft after a structure edit; the selection is spent. */
  const editTokens = (nextTokens: Token[], nextCaret = caret) => {
    setTokens(nextTokens);
    setCaret(Math.min(nextCaret, nextTokens.length));
    setSelectionAnchor(null);
    setPreviewRange(null);
    setHoveredParen(null);
    focusInput();
  };

  /** Moves the caret; with `extend` the selection anchor stays where the caret was. */
  const moveCaret = (nextCaret: number, { extend = false } = {}) => {
    setSelectionAnchor(extend ? (selectionAnchor ?? caret) : null);
    setCaret(nextCaret);
    focusInput();
  };

  // Ranges grow by the tokens a wrap adds in front of them, so the caret lands after the result.
  const caretAfter = (range: TokenRange, nextTokens: Token[]) =>
    range.end + nextTokens.length - tokens.length;

  const wrapSelection = (range: TokenRange) => {
    const next = wrapRange(tokens, range);
    editTokens(next, caretAfter(range, next));
  };

  const negateSelection = (range: TokenRange) => {
    const next = negateRange(tokens, range);
    editTokens(next, caretAfter(range, next));
  };

  const deleteRange = (range: TokenRange) => {
    const next = removeRange(tokens, range);
    editTokens(next.tokens, next.caret);
  };

  const groupNeighbours = (opIndex: number) => {
    const range = getNeighbourRange(tokens, opIndex);
    if (range) {
      wrapSelection(range);
    }
  };

  const setGroupOperators = (opIndex: number, op: BoolOperator) =>
    editTokens(setOperators(tokens, enclosingGroup(tokens, opIndex), op));

  const toggleNegateGroup = (parenIndex: number) => {
    const range = parenGroupRange(tokens, parenIndex);
    if (range == null) {
      return;
    }
    if (tokens[range.start - 1]?.type === "not") {
      editTokens(removeTokenAt(tokens, range.start - 1));
    } else {
      editTokens([
        ...tokens.slice(0, range.start),
        NOT_TOKEN,
        ...tokens.slice(range.start),
      ]);
    }
  };

  const insert = (token: Token) => {
    const next = insertToken(tokens, caret, token);
    setTokens(next.tokens);
    setCaret(next.caret);
    setText("");
    focusInput();
  };

  const handlePickFilter = (filterable: Lib.Filterable) => {
    insert(filterToken(toFilterClause(query, stageIndex, filterable)));
    closeDropdown();
    focusInput();
  };

  const handlePickToken = (token: Token) => {
    insert(token);
    setDropdownView({ type: "list" });
    setActiveIndex(0);
    focusInput();
  };

  const commit = () => {
    setSelectionAnchor(null);
    if (parsed.ok && isDirty) {
      isOwnCommitRef.current = true;
      onChange(writeTokens(query, stageIndex, tokens, { allowOr }));
    }
    closeDropdown();
  };

  const revert = () => {
    setTokens(committedTokens);
    setCaret(committedTokens.length);
    setSelectionAnchor(null);
    closeDropdown();
  };

  /** Keys that act on the selected tokens; returns whether the key was used. */
  const handleSelectionKey = (key: string, range: TokenRange): boolean => {
    if (key === "(" || key === ")") {
      wrapSelection(range);
      return true;
    }
    if (key === "!" || key === "n") {
      negateSelection(range);
      return true;
    }
    if (key === "a" || key === "o") {
      if (key === "o" && !allowOr) {
        return true;
      }
      setTokens(setOperators(tokens, range, key === "a" ? "and" : "or"));
      focusInput();
      return true;
    }
    if (key === "Backspace" || key === "Delete") {
      deleteRange(range);
      return true;
    }
    if (key === "Escape") {
      setSelectionAnchor(null);
      return true;
    }
    return false;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const cursorAtStart = input.selectionStart === 0;
    const cursorAtEnd = input.selectionEnd === text.length;
    const isTextEmpty = text.length === 0;

    if (selection && isTextEmpty && handleSelectionKey(event.key, selection)) {
      event.preventDefault();
      return;
    }
    const isSelectAll =
      (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a";
    if (isSelectAll && isTextEmpty && tokens.length > 0) {
      event.preventDefault();
      setSelectionAnchor(0);
      setCaret(tokens.length);
      focusInput();
      return;
    }
    if (event.shiftKey && isTextEmpty && event.key === "ArrowLeft") {
      event.preventDefault();
      if (caret > 0) {
        moveCaret(caret - 1, { extend: true });
      }
      return;
    }
    if (event.shiftKey && isTextEmpty && event.key === "ArrowRight") {
      event.preventDefault();
      if (caret < tokens.length) {
        moveCaret(caret + 1, { extend: true });
      }
      return;
    }
    // Any other key collapses the selection, then does what it does without one.
    if (selectionAnchor != null && event.key !== "Shift") {
      setSelectionAnchor(null);
    }

    if (event.key === "(" || event.key === ")") {
      event.preventDefault();
      insert(event.key === "(" ? OPEN_PAREN : CLOSE_PAREN);
      setDropdownView({ type: "list" });
      return;
    }
    if (event.key === " " || event.key === "Tab") {
      const typed = parseTypedToken(text);
      if (typed) {
        event.preventDefault();
        handlePickToken(typed);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const isPickingSuggestion =
        isDropdownOpen && (text.trim().length > 0 || hasNavigated);
      if (!isPickingSuggestion) {
        commit();
        return;
      }
      const typed = parseTypedToken(text);
      if (typed) {
        handlePickToken(typed);
        return;
      }
      const suggestion = suggestions[activeIndex];
      if (suggestion) {
        activateSuggestion(suggestion, {
          onPickToken: handlePickToken,
          onPickColumn: showColumnWidget,
          onBrowse: showBrowse,
        });
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (text.length > 0) {
        setText("");
      } else {
        revert();
        input.blur();
      }
      return;
    }
    if (event.key === "Backspace" && isTextEmpty && caret > 0) {
      event.preventDefault();
      editTokens(removeTokenAt(tokens, caret - 1), caret - 1);
      return;
    }
    if (event.key === "ArrowLeft" && cursorAtStart) {
      if (caret > 0) {
        event.preventDefault();
        setCaret(caret - 1);
        focusInput();
      } else if (onExitStart) {
        event.preventDefault();
        closeDropdown();
        onExitStart();
      }
      return;
    }
    if (event.key === "ArrowRight" && cursorAtEnd) {
      if (caret < tokens.length) {
        event.preventDefault();
        setCaret(caret + 1);
        focusInput();
      } else if (onExitEnd) {
        event.preventDefault();
        closeDropdown();
        onExitEnd();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isDropdownOpen) {
        openDropdown();
        return;
      }
      setHasNavigated(true);
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && isDropdownOpen) {
      event.preventDefault();
      setHasNavigated(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
  };

  const handleBarClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      moveCaret(tokens.length, { extend: event.shiftKey });
    }
  };

  const getTokenHighlight = (index: number) =>
    cx({
      [S.tokenSelected]: isInRange(selection, index),
      [S.tokenPreview]: previewRange != null && isInRange(previewRange, index),
      [S.inParenSpan]: isInRange(hoveredParenRange, index),
      [S.parenMatched]: isRangeEnd(hoveredParenRange, index),
      [S.inParenSpanCaret]: isInRange(caretParenRange, index),
      [S.parenMatchedCaret]: isRangeEnd(caretParenRange, index),
    });

  const input = (
    <Popover
      opened={isDropdownOpen}
      position="bottom-start"
      trapFocus={false}
      transitionProps={{ duration: 0 }}
      onChange={(opened) => !opened && closeDropdown()}
    >
      <Popover.Target>
        <input
          ref={inputRef}
          className={cx(S.input, {
            [S.inputInline]: caret < tokens.length,
            [S.inputEmpty]: text.length === 0,
          })}
          // Between tokens the input hugs its text and takes no space while empty, so
          // moving the caret never shifts the tokens. The active Gap shows where it sits.
          style={
            caret < tokens.length
              ? {
                  width: text.length === 0 ? 0 : `calc(${text.length}ch + 2px)`,
                }
              : undefined
          }
          value={text}
          placeholder={tokens.length === 0 ? placeholder : ""}
          aria-label={t`Filter expression`}
          onChange={(event) => {
            setText(event.target.value);
            setActiveIndex(0);
            if (!isDropdownOpen) {
              openDropdown();
            }
          }}
          onFocus={() => !isDropdownOpen && openDropdown()}
          onKeyDown={handleKeyDown}
        />
      </Popover.Target>
      {/* The picker bodies render their own popovers; the dropdown must not clip them. */}
      <Popover.Dropdown p={0} style={{ overflow: "visible" }}>
        <FilterSearchDropdown
          query={query}
          allowOr={allowOr}
          stageIndex={stageIndex}
          text={text}
          view={dropdownView}
          suggestions={suggestions}
          activeIndex={activeIndex}
          onViewChange={setDropdownView}
          onHover={(index) => {
            setActiveIndex(index);
            setHasNavigated(true);
          }}
          onPickColumn={showColumnWidget}
          onBrowse={showBrowse}
          onPickToken={handlePickToken}
          onPickFilter={handlePickFilter}
          onClose={closeDropdown}
        />
      </Popover.Dropdown>
    </Popover>
  );

  // One keyed array holds the input so React moves it instead of remounting it.
  const stream = [
    ...tokens.flatMap((token, index) => [
      <Gap
        key={`gap-${index}`}
        isActive={index === caret}
        isSelected={
          selection != null && index > selection.start && index < selection.end
        }
        onClick={(event) => moveCaret(index, { extend: event.shiftKey })}
      />,
      index === caret && <Fragment key="input">{input}</Fragment>,
      <TokenView
        key={`token-${index}`}
        query={query}
        stageIndex={stageIndex}
        token={token}
        className={getTokenHighlight(index)}
        hasError={index === errorPosition}
        isFresh={freshIndexes.has(index)}
        canToggleOperator={allowOr}
        canGroupNeighbours={getNeighbourRange(tokens, index) != null}
        hasNotBeforeGroup={hasNotBeforeGroup(tokens, index)}
        onReplace={(next) => editTokens(replaceTokenAt(tokens, index, next))}
        onRemove={() =>
          editTokens(
            removeTokenAt(tokens, index),
            index < caret ? caret - 1 : caret,
          )
        }
        onHoverParen={(isHovered) => setHoveredParen(isHovered ? index : null)}
        onPreviewNeighbours={(isPreviewing) =>
          setPreviewRange(
            isPreviewing ? (getNeighbourRange(tokens, index) ?? null) : null,
          )
        }
        onGroupNeighbours={() => groupNeighbours(index)}
        onSetGroupOperators={(op) => setGroupOperators(index, op)}
        onRemoveParens={() =>
          editTokens(
            removeParenPair(tokens, index),
            caretAfterParenRemoval(tokens, index, caret),
          )
        }
        onToggleNegateGroup={() => toggleNegateGroup(index)}
        onDeleteGroup={() => {
          const range = parenGroupRange(tokens, index);
          if (range) {
            deleteRange(range);
          }
        }}
      />,
    ]),
    caret === tokens.length ? (
      <Fragment key="input">{input}</Fragment>
    ) : (
      layout === "segment" && (
        <Box
          key="end-spacer"
          component="span"
          className={S.endSpacer}
          onClick={(event) =>
            moveCaret(tokens.length, { extend: event.shiftKey })
          }
        />
      )
    ),
  ];

  const statusMessage = getStatusMessage({
    parsed,
    hasSelection: selection != null,
    isDirty,
    allowOr,
  });

  const inlineActions = isDirty && (
    <Group gap="xs" ml="auto">
      <Button size="compact-sm" variant="subtle" onClick={revert}>
        {t`Cancel`}
      </Button>
      <Button
        size="compact-sm"
        variant="filled"
        disabled={!parsed.ok}
        onClick={commit}
      >
        {t`Apply`}
      </Button>
    </Group>
  );

  if (layout === "segment") {
    // Each token contributes [gap, input?, token] to the stream. The leading
    // element is grouped with the first token so a line break never separates them.
    const headLength = tokens.length > 0 ? 3 : stream.length;
    return (
      <>
        <Box className={cx(S.segment, className)}>
          {leading ? (
            <Box component="span" className={S.segmentHead}>
              {leading}
              {stream.slice(0, headLength)}
            </Box>
          ) : (
            stream.slice(0, headLength)
          )}
          {stream.slice(headLength)}
        </Box>
        {(statusMessage || isDirty) && (
          <Group className={S.segmentStatus} gap="sm" wrap="nowrap">
            <Text
              size="sm"
              c={parsed.ok ? "text-secondary" : "feedback-negative"}
            >
              {statusMessage}
            </Text>
            {inlineActions}
          </Group>
        )}
      </>
    );
  }

  return (
    <Stack gap="xs" w="100%">
      <Box
        className={cx(S.bar, className, { [S.barInvalid]: !parsed.ok })}
        onClick={handleBarClick}
      >
        {stream}
        {hasInlineActions ? (
          inlineActions
        ) : (
          <ActionIcon
            size="sm"
            variant="subtle"
            c="text-secondary"
            aria-label={t`Add filter`}
            onClick={() => {
              setCaret(tokens.length);
              setDropdownView({ type: "browse" });
              setIsDropdownOpen(true);
            }}
          >
            <Icon name="add" />
          </ActionIcon>
        )}
      </Box>
      <Group justify="space-between" gap="sm" mih={28}>
        <Text size="sm" c={parsed.ok ? "text-secondary" : "feedback-negative"}>
          {statusMessage}
        </Text>
        {renderActions?.({
          canApply: parsed.ok,
          apply: commit,
          cancel: revert,
        })}
      </Group>
    </Stack>
  );
}

function Gap({
  isActive,
  isSelected,
  onClick,
}: {
  isActive: boolean;
  /** The gap sits between two selected tokens. */
  isSelected: boolean;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <Box
      className={cx(S.gap, {
        [S.gapActive]: isActive,
        [S.tokenSelected]: isSelected,
      })}
      onClick={onClick}
    />
  );
}

type TokenViewProps = {
  query: Lib.Query;
  stageIndex: number;
  token: Token;
  /** Selection, preview and parenthesis-pair highlights. */
  className: string;
  hasError: boolean;
  /** The token came from outside the bar (a drill, an example) a moment ago. */
  isFresh: boolean;
  canToggleOperator: boolean;
  /** An operator with an operand on both sides, so the two can be grouped. */
  canGroupNeighbours: boolean;
  /** A parenthesis whose group already starts with `not`. */
  hasNotBeforeGroup: boolean;
  onReplace: (token: Token) => void;
  onRemove: () => void;
  onHoverParen: (isHovered: boolean) => void;
  onPreviewNeighbours: (isPreviewing: boolean) => void;
  onGroupNeighbours: () => void;
  onSetGroupOperators: (op: BoolOperator) => void;
  onRemoveParens: () => void;
  onToggleNegateGroup: () => void;
  onDeleteGroup: () => void;
};

function TokenView({
  query,
  stageIndex,
  token,
  className,
  hasError,
  isFresh,
  canToggleOperator,
  canGroupNeighbours,
  hasNotBeforeGroup,
  onReplace,
  onRemove,
  onHoverParen,
  onPreviewNeighbours,
  onGroupNeighbours,
  onSetGroupOperators,
  onRemoveParens,
  onToggleNegateGroup,
  onDeleteGroup,
}: TokenViewProps) {
  const tokenClass = cx(className, {
    [S.tokenError]: hasError,
    [S.tokenFresh]: isFresh,
  });

  if (token.type === "op") {
    return (
      <OperatorToken
        op={token.op}
        className={tokenClass}
        canToggleOperator={canToggleOperator}
        canGroupNeighbours={canGroupNeighbours}
        onSetOperator={(op) => onReplace(opToken(op))}
        onPreviewNeighbours={onPreviewNeighbours}
        onGroupNeighbours={onGroupNeighbours}
        onSetGroupOperators={onSetGroupOperators}
      />
    );
  }

  if (token.type === "not") {
    return (
      <TokenMenu
        target={
          <Box component="span" className={cx(S.op, S.opNot, tokenClass)}>
            {t`not`}
          </Box>
        }
      >
        <Menu.Item onClick={onRemove}>{t`Remove "not"`}</Menu.Item>
      </TokenMenu>
    );
  }

  if (token.type === "paren") {
    return (
      <TokenMenu
        target={
          <Box
            component="span"
            className={cx(S.paren, tokenClass)}
            onMouseEnter={() => onHoverParen(true)}
            onMouseLeave={() => onHoverParen(false)}
          >
            {token.side === "open" ? "(" : ")"}
          </Box>
        }
      >
        <Menu.Item onClick={onRemoveParens}>{t`Remove parentheses`}</Menu.Item>
        <Menu.Item onClick={onToggleNegateGroup}>
          {hasNotBeforeGroup ? t`Remove "not"` : t`Negate group`}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item c="feedback-negative" onClick={onDeleteGroup}>
          {t`Delete group`}
        </Menu.Item>
      </TokenMenu>
    );
  }

  return (
    <FilterTokenView
      query={query}
      stageIndex={stageIndex}
      clause={token.clause}
      className={tokenClass}
      onReplace={(filterable) =>
        onReplace(filterToken(toFilterClause(query, stageIndex, filterable)))
      }
      onRemove={onRemove}
    />
  );
}

type OperatorTokenProps = {
  op: BoolOperator;
  className: string;
  canToggleOperator: boolean;
  canGroupNeighbours: boolean;
  onSetOperator: (op: BoolOperator) => void;
  onPreviewNeighbours: (isPreviewing: boolean) => void;
  onGroupNeighbours: () => void;
  onSetGroupOperators: (op: BoolOperator) => void;
};

function OperatorToken({
  op,
  className,
  canToggleOperator,
  canGroupNeighbours,
  onSetOperator,
  onPreviewNeighbours,
  onGroupNeighbours,
  onSetGroupOperators,
}: OperatorTokenProps) {
  const otherOp = toggleOperator(op);

  return (
    <TokenMenu
      target={
        <Box
          component="span"
          className={cx(S.op, { [S.opOr]: op === "or" }, className)}
        >
          {op}
        </Box>
      }
    >
      {canToggleOperator &&
        BOOL_OPERATORS.map((option) => (
          <Menu.Item
            key={option}
            leftSection={
              <Icon
                name="check"
                size={14}
                opacity={option === op ? 1 : 0}
                aria-hidden
              />
            }
            onClick={() => onSetOperator(option)}
          >
            {option}
          </Menu.Item>
        ))}
      {canToggleOperator && <Menu.Divider />}
      <Menu.Item
        disabled={!canGroupNeighbours}
        onMouseEnter={() => onPreviewNeighbours(true)}
        onMouseLeave={() => onPreviewNeighbours(false)}
        onClick={onGroupNeighbours}
      >
        {t`Group with neighbours`}
      </Menu.Item>
      {canToggleOperator && (
        <Menu.Item onClick={() => onSetGroupOperators(otherOp)}>
          {t`Change every operator in this group to "${otherOp}"`}
        </Menu.Item>
      )}
    </TokenMenu>
  );
}

const BOOL_OPERATORS: BoolOperator[] = ["and", "or"];

type TokenMenuProps = {
  target: ReactNode;
  children: ReactNode;
};

function TokenMenu({ target, children }: TokenMenuProps) {
  return (
    <Menu position="bottom-start" transitionProps={{ duration: 0 }}>
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
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
        <Box component="span" className={cx(S.filterToken, className)}>
          <TokenPill
            onClick={() => setIsOpened((opened) => !opened)}
            onRemove={onRemove}
          >
            {getFilterLabel(query, stageIndex, clause)}
          </TokenPill>
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
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

/**
 * Which tokens a longer committed stream gained: the appended tail, plus the
 * opening parenthesis when a drill wrapped a top-level OR to AND onto it.
 */
function freshTokenIndexes(
  previous: readonly Token[],
  next: readonly Token[],
): Set<number> {
  if (next.length <= previous.length) {
    return new Set();
  }
  const fresh = new Set<number>();
  for (let index = previous.length; index < next.length; index++) {
    fresh.add(index);
  }
  const opensWithParen = (tokens: readonly Token[]) =>
    tokens[0]?.type === "paren" && tokens[0].side === "open";
  if (opensWithParen(next) && !opensWithParen(previous)) {
    fresh.add(0);
  }
  return fresh;
}

function getSelection(
  anchor: number | null,
  caret: number,
): TokenRange | undefined {
  if (anchor == null || anchor === caret) {
    return undefined;
  }
  return { start: Math.min(anchor, caret), end: Math.max(anchor, caret) };
}

function isInRange(range: TokenRange | undefined, index: number): boolean {
  return range != null && index >= range.start && index < range.end;
}

function isRangeEnd(range: TokenRange | undefined, index: number): boolean {
  return range != null && (index === range.start || index === range.end - 1);
}

/** A parenthesis right before or after the caret, the one an editor would pair up. */
function getCaretParen(
  tokens: readonly Token[],
  caret: number,
): number | undefined {
  return [caret - 1, caret].find((index) => tokens[index]?.type === "paren");
}

/** Both operands of the operator at `index`, as one range. */
function getNeighbourRange(
  tokens: readonly Token[],
  index: number,
): TokenRange | undefined {
  if (tokens[index]?.type !== "op") {
    return undefined;
  }
  const left = operandRange(tokens, index, "left");
  const right = operandRange(tokens, index, "right");
  return left && right ? { start: left.start, end: right.end } : undefined;
}

function hasNotBeforeGroup(tokens: readonly Token[], index: number): boolean {
  const range = parenGroupRange(tokens, index);
  return range != null && tokens[range.start - 1]?.type === "not";
}

/** Where the caret lands once both parentheses of a group are gone. */
function caretAfterParenRemoval(
  tokens: readonly Token[],
  parenIndex: number,
  caret: number,
): number {
  const removed = [parenIndex, matchingParen(tokens, parenIndex)];
  return caret - removed.filter((i) => i != null && i < caret).length;
}

type StatusMessageOptions = {
  parsed: ReturnType<typeof parseTokens>;
  hasSelection: boolean;
  isDirty: boolean;
  allowOr: boolean;
};

function getStatusMessage({
  parsed,
  hasSelection,
  isDirty,
  allowOr,
}: StatusMessageOptions): string | undefined {
  if (!parsed.ok) {
    return parsed.error;
  }
  if (hasSelection) {
    return allowOr
      ? t`( group · ! negate · a / o set operators · ⌫ delete`
      : t`( group · ! negate · a set operators · ⌫ delete`;
  }
  return isDirty ? t`Press Enter to apply` : undefined;
}
