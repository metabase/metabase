import cx from "classnames";
import {
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
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
  Popover,
  Stack,
  Text,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel, toFilterClause } from "../../harness/clauses";
import { Token as TokenPill } from "../or-pills/Token";

import S from "./ExpressionBar.module.css";
import {
  type DropdownView,
  FilterSearchDropdown,
  type StagedColumn,
  activateSuggestion,
  useSuggestions,
} from "./FilterSearchDropdown";
import { CompactReadingContext, type SummaryPlacement } from "./settings";
import { useSummaryStage } from "./summary";
import {
  CLOSE_PAREN,
  type ExpressionToken,
  OPEN_PAREN,
  appendConjunct,
  filterToken,
  insertToken,
  opToken,
  parseTokens,
  parseTypedToken,
  readTokens,
  removeTokenAt,
  replaceTokenAt,
  toggleOperator,
  writeTokens,
} from "./tokens";

const FRESH_TOKEN_FLASH_MS = 1500;

type ExpressionBarProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
  /**
   * Once the stage has a summary, the bar also holds the filters on it (the
   * next stage's), as tinted pills in the same stream. Off for a bar that
   * edits one stage, like a notebook step.
   */
  withSummary?: boolean;
  /**
   * Where a picked filter on the summary lands: at the caret (default), or
   * `"end"` to append it as the last AND-ed conjunct wherever the caret is,
   * so the summary filters always form the tail of the expression.
   */
  summaryPlacement?: SummaryPlacement;
  /** Rendered inside the bar after the tokens, e.g. a separate summary-filter zone. */
  trailing?: ReactNode;
  placeholder?: string;
  /** Extra class on the bar box. */
  className?: string;
  /**
   * Where Cancel/Apply go while the draft is dirty: inside the bar, or in
   * the status row below it so a trailing zone keeps the bar's right edge.
   * Without it the bar ends with a "+" button that opens the full picker.
   */
  actionsPlacement?: "inline" | "below";
  /** Renders Cancel/Apply elsewhere, e.g. in a modal footer. */
  renderActions?: (actions: {
    canApply: boolean;
    apply: () => void;
    cancel: () => void;
  }) => ReactNode;
};

/**
 * One expression bar. Filters are atomic tokens picked from a dropdown;
 * `and`, `or` and parentheses are typed between them, or clicked to toggle.
 * Filters on the summary sit in the same stream, marked by a tint and an
 * icon, and go back to their own stage on apply. Edits are a draft until
 * Enter or "Apply".
 */
export function ExpressionBar({
  query,
  stageIndex,
  onChange,
  withSummary = false,
  summaryPlacement = "caret",
  trailing,
  placeholder = t`Type a column, "and", "or", "("…`,
  className,
  actionsPlacement,
  renderActions,
}: ExpressionBarProps) {
  const compactReading = useContext(CompactReadingContext);
  const [isFocused, setIsFocused] = useState(false);
  const summaryStageIndex = stageIndex + 1;
  const summaryStage = useSummaryStage(query, stageIndex);
  const summary = withSummary ? summaryStage : undefined;
  const hasSummary = summary != null;
  // Tokens read from the query may sit on the summary stage even when the bar
  // does not offer it, e.g. a notebook step; they still need that stage's query.
  const summaryQuery = summaryStage?.query ?? query;
  const queryFor = useCallback(
    (tokenStageIndex: number) =>
      tokenStageIndex === summaryStageIndex ? summaryQuery : query,
    [query, summaryQuery, summaryStageIndex],
  );

  const committedTokens = useMemo(
    () =>
      readTokens(query, stageIndex, { withNot: true, withSummary: hasSummary }),
    [query, stageIndex, hasSummary],
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
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const flashTokens = useCallback((indexes: ReadonlySet<number>) => {
    clearTimeout(flashTimeoutRef.current);
    setFreshIndexes(indexes);
    if (indexes.size > 0) {
      flashTimeoutRef.current = setTimeout(
        () => setFreshIndexes(new Set()),
        FRESH_TOKEN_FLASH_MS,
      );
    }
  }, []);

  // External query changes (examples, drills, other frames) drop the draft
  // and briefly highlight what arrived.
  useEffect(() => {
    const previous = previousCommittedRef.current;
    previousCommittedRef.current = committedTokens;

    const isOwnCommit = isOwnCommitRef.current;
    isOwnCommitRef.current = false;
    const fresh = freshTokenIndexes(previous, committedTokens, queryFor);
    const isSameExpression =
      previous.length === committedTokens.length && fresh.size === 0;
    if (isSameExpression) {
      // Another part of the query changed (the summary zone, a display switch);
      // a draft in progress survives, a clean bar just adopts the new tokens.
      setTokens((draft) => (draft === previous ? committedTokens : draft));
      return;
    }
    setTokens(committedTokens);
    setCaret(committedTokens.length);
    flashTokens(isOwnCommit ? new Set() : fresh);
  }, [committedTokens, queryFor, flashTokens]);

  const isDirty = tokens !== committedTokens;
  const parsed = useMemo(() => parseTokens(tokens), [tokens]);
  const errorPosition = parsed.ok ? undefined : parsed.position;
  const suggestions = useSuggestions(query, stageIndex, text, {
    withNot: true,
    summary,
  });

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

  const showColumnWidget = (column: StagedColumn) => {
    setText("");
    setDropdownView({ type: "column", column });
  };

  const showBrowse = () => {
    setText("");
    setDropdownView({ type: "browse" });
  };

  const insert = (
    token: ExpressionToken,
    placement: "caret" | "end" = "caret",
  ) => {
    if (placement === "caret") {
      const next = insertToken(tokens, caret, token);
      setTokens(next.tokens);
      setCaret(next.caret);
    } else {
      const wasAtEnd = caret === tokens.length;
      const next = appendConjunct(tokens, token);
      setTokens(next.tokens);
      // The caret stays where the user was; wrapping shifts everything by one.
      setCaret(wasAtEnd ? next.caret : next.wrapped ? caret + 1 : caret);
      // Show what appeared away from the caret: the tail token, and the wrap.
      const fresh = new Set(
        next.wrapped ? [0, next.tokens.indexOf(token) - 2] : [],
      );
      if (!wasAtEnd) {
        fresh.add(next.caret - 1);
      }
      flashTokens(fresh);
    }
    setText("");
    focusInput();
  };

  const handlePickFilter = (
    filterable: Lib.Filterable,
    pickStageIndex: number,
  ) => {
    const isSummaryFilter = pickStageIndex === summaryStageIndex;
    insert(
      filterToken(
        toFilterClause(queryFor(pickStageIndex), pickStageIndex, filterable),
        pickStageIndex,
      ),
      summaryPlacement === "end" && isSummaryFilter ? "end" : "caret",
    );
    closeDropdown();
    focusInput();
  };

  const handlePickToken = (token: ExpressionToken) => {
    insert(token);
    setDropdownView({ type: "list" });
    setActiveIndex(0);
    focusInput();
  };

  const commit = () => {
    if (parsed.ok && isDirty) {
      isOwnCommitRef.current = true;
      onChange(
        writeTokens(query, stageIndex, tokens, { withSummary: hasSummary }),
      );
    }
    closeDropdown();
  };

  const revert = () => {
    setTokens(committedTokens);
    setCaret(committedTokens.length);
    closeDropdown();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const cursorAtStart = input.selectionStart === 0;
    const cursorAtEnd = input.selectionEnd === text.length;

    if (event.key === "(" || event.key === ")") {
      event.preventDefault();
      insert(event.key === "(" ? OPEN_PAREN : CLOSE_PAREN);
      setDropdownView({ type: "list" });
      return;
    }
    if (event.key === " " || event.key === "Tab") {
      const typed = parseTypedToken(text, { withNot: true });
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
      const typed = parseTypedToken(text, { withNot: true });
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
    if (event.key === "Backspace" && text.length === 0 && caret > 0) {
      event.preventDefault();
      setTokens(removeTokenAt(tokens, caret - 1));
      setCaret(caret - 1);
      focusInput();
      return;
    }
    if (event.key === "ArrowLeft" && cursorAtStart && caret > 0) {
      event.preventDefault();
      setCaret(caret - 1);
      focusInput();
      return;
    }
    if (event.key === "ArrowRight" && cursorAtEnd && caret < tokens.length) {
      event.preventDefault();
      setCaret(caret + 1);
      focusInput();
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
      setCaret(tokens.length);
      focusInput();
    }
  };

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
            [S.inputHugging]:
              caret === tokens.length && trailing != null && trailing !== false,
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
          queryFor={queryFor}
          withNot
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
        onClick={() => {
          setCaret(index);
          focusInput();
        }}
      />,
      index === caret && <Fragment key="input">{input}</Fragment>,
      <TokenView
        key={`token-${index}`}
        queryFor={queryFor}
        stageIndex={stageIndex}
        token={token}
        hasError={index === errorPosition}
        isFresh={freshIndexes.has(index)}
        compact={compactReading && !isFocused && !isDirty && !isDropdownOpen}
        onReplace={(next) => setTokens(replaceTokenAt(tokens, index, next))}
        onRemove={() => {
          setTokens(removeTokenAt(tokens, index));
          setCaret(Math.min(caret, tokens.length - 1));
        }}
      />,
    ]),
    caret === tokens.length && <Fragment key="input">{input}</Fragment>,
  ];

  const statusMessage = !parsed.ok
    ? parsed.error
    : isDirty
      ? t`Press Enter to apply`
      : undefined;

  const actions = isDirty && (
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

  return (
    <Stack gap="xs" w="100%">
      <Box
        className={cx(S.bar, className, { [S.barInvalid]: !parsed.ok })}
        onClick={handleBarClick}
        onFocusCapture={() => setIsFocused(true)}
        onBlurCapture={(event) => {
          const staysInBar = event.currentTarget.contains(event.relatedTarget);
          if (!staysInBar) {
            setIsFocused(false);
          }
          // Tabbing from the input to a pill or the trailing zone leaves the
          // dropdown open (only clicks close it), so close it here.
          if (staysInBar && event.target === inputRef.current) {
            closeDropdown();
          }
        }}
      >
        {stream}
        {trailing}
        {actionsPlacement === "inline" && actions}
        {actionsPlacement == null && (
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
        {actionsPlacement === "below" && actions}
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
  onClick,
}: {
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Box className={cx(S.gap, { [S.gapActive]: isActive })} onClick={onClick} />
  );
}

type TokenViewProps = {
  queryFor: (stageIndex: number) => Lib.Query;
  /** The bar's own stage; a filter token on another stage is a filter on the summary. */
  stageIndex: number;
  token: ExpressionToken;
  hasError: boolean;
  /** The token came from outside the bar (a drill, an example) a moment ago. */
  isFresh: boolean;
  compact: boolean;
  onReplace: (token: ExpressionToken) => void;
  onRemove: () => void;
};

function TokenView({
  queryFor,
  stageIndex,
  token,
  hasError,
  isFresh,
  compact,
  onReplace,
  onRemove,
}: TokenViewProps) {
  const errorClass = cx({
    [S.tokenError]: hasError,
    [S.tokenFresh]: isFresh,
  });

  if (token.type === "op") {
    return (
      <Box
        component="span"
        className={cx(S.op, { [S.opOr]: token.op === "or" }, errorClass)}
        title={t`Click to switch`}
        onClick={() => onReplace(opToken(toggleOperator(token.op)))}
      >
        {token.op}
      </Box>
    );
  }

  if (token.type === "not") {
    return (
      <Box
        component="span"
        className={cx(S.op, S.opNot, errorClass)}
        title={t`Click to remove`}
        onClick={onRemove}
      >
        {t`not`}
      </Box>
    );
  }

  if (token.type === "paren") {
    return (
      <Box
        component="span"
        className={cx(S.paren, errorClass)}
        title={t`Click to remove`}
        onClick={onRemove}
      >
        {token.side === "open" ? "(" : ")"}
      </Box>
    );
  }

  return (
    <FilterTokenView
      query={queryFor(token.stageIndex)}
      stageIndex={token.stageIndex}
      isSummary={token.stageIndex !== stageIndex}
      compact={compact}
      clause={token.clause}
      className={errorClass}
      onReplace={(filterable) =>
        onReplace(
          filterToken(
            toFilterClause(
              queryFor(token.stageIndex),
              token.stageIndex,
              filterable,
            ),
            token.stageIndex,
          ),
        )
      }
      onRemove={onRemove}
    />
  );
}

/** Row filters only say "before" once there is a summary to be before. */
function getStageTitle(
  query: Lib.Query,
  stageIndex: number,
  isSummary: boolean,
): string | undefined {
  if (isSummary) {
    return t`Applies after summarizing`;
  }
  return Lib.aggregations(query, stageIndex).length > 0
    ? t`Applies before summarizing`
    : undefined;
}

type FilterTokenViewProps = {
  query: Lib.Query;
  stageIndex: number;
  isSummary: boolean;
  compact: boolean;
  clause: Lib.FilterClause;
  className?: string;
  /** Inside another popover: renders the editor within it, so clicks there do not close the parent. */
  isNested?: boolean;
  onReplace: (filterable: Lib.Filterable) => void;
  onRemove: () => void;
};

export function FilterTokenView({
  query,
  stageIndex,
  isSummary,
  clause,
  compact,
  className,
  isNested = false,
  onReplace,
  onRemove,
}: FilterTokenViewProps) {
  const [isOpened, setIsOpened] = useState(false);
  const label = getFilterLabel(query, stageIndex, clause);

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      withinPortal={!isNested}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <Box
          component="span"
          className={cx(
            S.filterToken,
            { [S.summaryToken]: isSummary },
            className,
          )}
          title={getStageTitle(query, stageIndex, isSummary)}
        >
          <TokenPill
            onClick={() => setIsOpened((opened) => !opened)}
            onRemove={onRemove}
          >
            {isSummary && (
              <Icon name="sum" size={12} className={S.summaryTokenIcon} />
            )}
            {compact && !isOpened ? compactLabel(label) : label}
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

function compactLabel(label: string): string {
  return label
    .replaceAll("is greater than or equal to", "≥")
    .replaceAll("is less than or equal to", "≤")
    .replaceAll("is greater than", ">")
    .replaceAll("is less than", "<")
    .replaceAll("is equal to", "=");
}

/**
 * Which tokens the committed stream gained. Tokens are matched by content,
 * since a drill on the rows lands before the filters on the summary and a
 * drill on an OR wraps it in parentheses.
 */
function freshTokenIndexes(
  previous: readonly ExpressionToken[],
  next: readonly ExpressionToken[],
  queryFor: (stageIndex: number) => Lib.Query,
): Set<number> {
  const tokenKey = (token: ExpressionToken): string => {
    switch (token.type) {
      case "op":
        return `op:${token.op}`;
      case "paren":
        return `paren:${token.side}`;
      case "not":
        return "not";
      case "filter":
        return `filter:${token.stageIndex}:${getFilterLabel(
          queryFor(token.stageIndex),
          token.stageIndex,
          token.clause,
        )}`;
    }
  };
  const unmatched = new Map<string, number>();
  previous.forEach((token) => {
    const key = tokenKey(token);
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
  });
  const fresh = new Set<number>();
  next.forEach((token, index) => {
    const key = tokenKey(token);
    const remaining = unmatched.get(key) ?? 0;
    if (remaining > 0) {
      unmatched.set(key, remaining - 1);
    } else {
      fresh.add(index);
    }
  });
  return fresh;
}
