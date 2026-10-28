import cx from "classnames";
import {
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
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
import type * as Lib from "metabase-lib";

import { getFilterLabel, toFilterClause } from "../../harness/clauses";
import { Token as TokenPill } from "../or-pills/Token";

import S from "./ExpressionBar.module.css";
import {
  type DropdownView,
  FilterSearchDropdown,
  activateSuggestion,
  useSuggestions,
} from "./FilterSearchDropdown";
import {
  CLOSE_PAREN,
  OPEN_PAREN,
  type Token,
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

type ExpressionBarProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
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
 * Direction B: one expression bar. Filters are atomic tokens picked from a
 * dropdown; `and`, `or` and parentheses are typed between them, or clicked
 * to toggle. Edits are a draft until Enter or "Apply".
 */
export function ExpressionBar({
  query,
  stageIndex,
  onChange,
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

  // External query changes (examples, other frames) reset the draft.
  useEffect(() => {
    setTokens(committedTokens);
    setCaret(committedTokens.length);
  }, [committedTokens]);

  const isDirty = tokens !== committedTokens;
  const parsed = useMemo(() => parseTokens(tokens), [tokens]);
  const errorPosition = parsed.ok ? undefined : parsed.position;
  const suggestions = useSuggestions(query, stageIndex, text);

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

  const showColumnWidget = (column: Lib.ColumnMetadata) => {
    setText("");
    setDropdownView({ type: "column", column });
  };

  const showBrowse = () => {
    setText("");
    setDropdownView({ type: "browse" });
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
    if (parsed.ok && isDirty) {
      onChange(writeTokens(query, stageIndex, tokens));
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
            [S.inputInlineEmpty]: caret < tokens.length && text.length === 0,
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
          placeholder={
            tokens.length === 0 ? t`Type a column, "and", "or", "("…` : ""
          }
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

  return (
    <Stack gap="xs" w="100%">
      <Box
        className={cx(S.bar, { [S.barInvalid]: !parsed.ok })}
        onClick={handleBarClick}
      >
        {/* One keyed array holds the input so React moves it instead of remounting it. */}
        {[
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
              query={query}
              stageIndex={stageIndex}
              token={token}
              hasError={index === errorPosition}
              onReplace={(next) =>
                setTokens(replaceTokenAt(tokens, index, next))
              }
              onRemove={() => {
                setTokens(removeTokenAt(tokens, index));
                setCaret(Math.min(caret, tokens.length - 1));
              }}
            />,
          ]),
          caret === tokens.length && <Fragment key="input">{input}</Fragment>,
        ]}
        {hasInlineActions ? (
          isDirty && (
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
          )
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
          {!parsed.ok && parsed.error}
          {parsed.ok && isDirty && t`Press Enter to apply`}
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
  query: Lib.Query;
  stageIndex: number;
  token: Token;
  hasError: boolean;
  onReplace: (token: Token) => void;
  onRemove: () => void;
};

function TokenView({
  query,
  stageIndex,
  token,
  hasError,
  onReplace,
  onRemove,
}: TokenViewProps) {
  const errorClass = hasError ? S.tokenError : undefined;

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
      query={query}
      stageIndex={stageIndex}
      clause={token.clause}
      className={errorClass}
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
        <Box component="span" className={className}>
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
