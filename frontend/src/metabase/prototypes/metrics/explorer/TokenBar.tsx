import cx from "classnames";
import {
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import { Icon, Popover, Tooltip } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./Explorer.module.css";

const DROPDOWN_WIDTH = 360;

/** An option in a dropdown, shaped like the filter bar's suggestions. */
export type BarItem = {
  id: string;
  label: string;
  icon?: IconName;
  /** Grey text after the label. */
  description?: string;
  /** Monospace text at the right end, like the key that types an operator. */
  hint?: string;
  /** Other texts that find this option, like "-" for Subtract. */
  aliases?: string[];
  /** A bold header above this option and the next ones in the same section. */
  section?: string;
  sectionIcon?: IconName;
  /** Shown but not pickable here, like `)` with no open group. */
  disabled?: boolean;
  /** Behind an info icon that shows on hover, like how a measure is calculated. */
  info?: string;
};

export type TokenState = {
  index: number;
  isSelected: boolean;
  /** The caret input is attached to this token's right edge. */
  isHost: boolean;
  /** The part of this token the arrow keys landed on, e.g. one of its filters. */
  selectedPart: string | null;
};

export const matchesItem = (item: BarItem, query: string) => {
  const text = query.trim().toLowerCase();
  return [item.label, item.description, item.section, ...(item.aliases ?? [])]
    .filter((value) => value != null)
    .some((value) => value.toLowerCase().includes(text));
};

type TokenBarProps<T extends { key: string }> = {
  tokens: T[];
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder: string;
  /** A red outline, for a definition that doesn't add up. */
  hasError?: boolean;
  renderToken: (token: T, state: TokenState) => ReactNode;
  /** What the dropdown offers for the typed text at the caret. */
  getItems: (query: string, caret: number) => BarItem[];
  /** Applies a picked item; returns the caret afterwards. */
  onPick: (item: BarItem, caret: number) => number;
  /** A key typed with an empty input, e.g. `+`; returns the new caret if handled. */
  onKeyChar?: (char: string, caret: number) => number | null;
  /** Removes a token; returns the caret afterwards. */
  onDelete: (index: number) => number;
  /** Enter on a selected token starts to edit it. */
  onOpenToken: (index: number) => void;
  /** A token whose right edge holds the input instead of the caret (filter drafts). */
  inputHostKey?: string | null;
  hostPrefix?: ReactNode;
  onExitHost?: () => void;
  /** The caret input lost focus. */
  onBlur?: () => void;
  /** The parts the arrow keys step through inside a token; fewer than two: none. */
  getParts?: (token: T) => string[];
  /** Enter on a selected part starts to edit it. */
  onOpenPart?: (index: number, part: string) => void;
  /** Backspace or Delete on a selected part removes it; returns the caret afterwards. */
  onDeletePart?: (index: number, part: string) => number;
};

/**
 * Prototype: a flat row of tokens with one caret, after the filter expression
 * bar. Type to get suggestions, Enter or Tab picks, arrows move the caret,
 * Backspace selects the token before the caret and a second Backspace deletes
 * it, Enter on a selected token edits it. Everything is also clickable.
 */
export function TokenBar<T extends { key: string }>({
  tokens,
  inputRef,
  placeholder,
  hasError = false,
  renderToken,
  getItems,
  onPick,
  onKeyChar,
  onDelete,
  onOpenToken,
  inputHostKey,
  hostPrefix,
  onExitHost,
  onBlur,
  getParts,
  onOpenPart,
  onDeletePart,
}: TokenBarProps<T>) {
  const [caret, setCaret] = useState(tokens.length);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [partSel, setPartSel] = useState<{
    index: number;
    part: string;
  } | null>(null);
  const partsOf = (index: number) => {
    const token = tokens[index];
    const parts = token && getParts ? getParts(token) : [];
    return parts.length > 1 ? parts : [];
  };

  const clampedCaret = Math.min(caret, tokens.length);
  const items = getItems(query, clampedCaret);
  const list = useSuggestionList(items, query);
  const isDropdownOpen =
    isFocused && selected == null && partSel == null && items.length > 0;

  const moveCaret = (next: number) => {
    setCaret(Math.max(0, Math.min(tokens.length, next)));
    setSelected(null);
    setPartSel(null);
  };

  const focusAt = (next: number) => {
    moveCaret(next);
    inputRef.current?.focus();
  };

  const pick = (item: BarItem) => {
    const next = onPick(item, clampedCaret);
    setQuery("");
    moveCaret(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const isEmpty = query.length === 0;

    if (partSel != null && isEmpty) {
      const parts = partsOf(partSel.index);
      const at = parts.indexOf(partSel.part);
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (at > 0) {
          setPartSel({ index: partSel.index, part: parts[at - 1] });
        } else {
          moveCaret(partSel.index);
        }
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (at >= 0 && at < parts.length - 1) {
          setPartSel({ index: partSel.index, part: parts[at + 1] });
        } else {
          moveCaret(partSel.index + 1);
        }
        return;
      }
      if (event.key === "Enter" || event.key === "ArrowDown") {
        event.preventDefault();
        onOpenPart?.(partSel.index, partSel.part);
        setPartSel(null);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        moveCaret(
          onDeletePart?.(partSel.index, partSel.part) ?? partSel.index + 1,
        );
        return;
      }
      if (event.key === "Escape") {
        moveCaret(partSel.index + 1);
        return;
      }
    }

    // A pill the arrows landed on, as in the filter bar: arrows leave it,
    // Enter or ArrowDown edit it.
    if (selected != null && isEmpty) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        moveCaret(selected + (event.key === "ArrowLeft" ? 0 : 1));
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        onOpenToken(selected);
        return;
      }
    }

    if (selected != null && event.key === "Enter") {
      event.preventDefault();
      onOpenToken(selected);
      return;
    }
    if (isDropdownOpen && list.handleKeyDown(event, pick)) {
      return;
    }

    if (event.key === "Escape") {
      if (inputHostKey != null) {
        onExitHost?.();
        setQuery("");
      } else if (selected != null) {
        setSelected(null);
      } else {
        inputRef.current?.blur();
      }
      return;
    }

    if (!isEmpty) {
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      if (inputHostKey != null) {
        onExitHost?.();
        return;
      }
      if (selected != null) {
        moveCaret(onDelete(selected));
        return;
      }
      if (event.key === "Backspace" && clampedCaret > 0) {
        setSelected(clampedCaret - 1);
      } else if (event.key === "Delete" && clampedCaret < tokens.length) {
        setSelected(clampedCaret);
      }
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (inputHostKey != null) {
        return;
      }
      event.preventDefault();
      const isLeft = event.key === "ArrowLeft";
      const target = isLeft ? clampedCaret - 1 : clampedCaret;
      const parts = partsOf(target);
      if (parts.length > 0) {
        // A pill with filters: step into it, part by part.
        setSelected(null);
        setPartSel({
          index: target,
          part: isLeft ? parts[parts.length - 1] : parts[0],
        });
        return;
      }
      if (target >= 0 && target < tokens.length) {
        // Land on the pill itself, so Enter can edit it.
        setPartSel(null);
        setSelected(target);
      }
      return;
    }

    if (event.key.length === 1 && onKeyChar) {
      const next = onKeyChar(event.key, clampedCaret);
      if (next != null) {
        event.preventDefault();
        moveCaret(next);
      }
    }
  };

  const showPlaceholder = tokens.length === 0 && inputHostKey == null;
  const hostIndex = tokens.findIndex((token) => token.key === inputHostKey);
  const isHosted = hostIndex !== -1;

  // One input node for the whole bar, placed with `order`, so moving the
  // caret never remounts it and never drops focus. Slots: 3i is the gap
  // before token i, 3i + 1 the token, 3i + 2 a draft attached to it.
  return (
    <Popover
      opened={isDropdownOpen}
      position="bottom-start"
      shadow="md"
      trapFocus={false}
      returnFocus={false}
      offset={4}
    >
      <Popover.Target>
        <div
          className={cx(S.bar, {
            [S.barFocused]: isFocused,
            [S.barError]: hasError,
          })}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              event.preventDefault();
              focusAt(tokens.length);
            }
          }}
        >
          {tokens.map((token, index) => (
            <Fragment key={token.key}>
              {(index !== clampedCaret || isHosted) && (
                <Gap order={3 * index} onClick={() => focusAt(index)} />
              )}
              <span className={S.slot} style={{ order: 3 * index + 1 }}>
                {renderToken(token, {
                  index,
                  isSelected: selected === index,
                  isHost: index === hostIndex,
                  selectedPart:
                    isFocused && partSel?.index === index ? partSel.part : null,
                })}
              </span>
            </Fragment>
          ))}
          {(clampedCaret !== tokens.length || isHosted) && (
            <Gap
              order={3 * tokens.length}
              onClick={() => focusAt(tokens.length)}
            />
          )}
          <span
            className={cx(S.slot, { [S.draftSeg]: isHosted })}
            style={{
              order: isHosted ? 3 * hostIndex + 2 : 3 * clampedCaret,
            }}
          >
            {isHosted && hostPrefix}
            <input
              ref={inputRef}
              className={S.input}
              value={query}
              placeholder={showPlaceholder ? placeholder : ""}
              size={showPlaceholder && !query ? placeholder.length : 1}
              style={{ width: query ? `${query.length + 1}ch` : undefined }}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(null);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                setIsFocused(false);
                setSelected(null);
                setPartSel(null);
                onBlur?.();
              }}
            />
          </span>
        </div>
      </Popover.Target>
      <Popover.Dropdown p={0} w={DROPDOWN_WIDTH} className={S.dropdown}>
        <SuggestionList
          items={items}
          highlight={list.highlight}
          isSearching={query.trim() !== ""}
          onHover={list.setHighlight}
          onPick={pick}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

function Gap({ order, onClick }: { order: number; onClick: () => void }) {
  return (
    <span
      className={S.gap}
      style={{ order }}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
    />
  );
}

/**
 * The highlighted option: the first one while the user types, none before,
 * so Enter and Tab pick what was typed and arrows pick from the full list.
 */
function useSuggestionList(items: BarItem[], query: string) {
  const isSearching = query.trim() !== "";
  const firstEnabled = items.findIndex((item) => !item.disabled);
  const [state, setState] = useState({ query, highlight: -1 });
  const highlight =
    state.query === query ? state.highlight : isSearching ? firstEnabled : -1;
  const setHighlight = (next: number) => setState({ query, highlight: next });
  const target = items[highlight]?.disabled ? undefined : items[highlight];

  const step = (direction: 1 | -1) => {
    let next = highlight + direction;
    while (items[next]?.disabled) {
      next += direction;
    }
    return next >= items.length ? highlight : Math.max(-1, next);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    onPick: (item: BarItem) => void,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(step(event.key === "ArrowDown" ? 1 : -1));
      return true;
    }
    if ((event.key === "Enter" || event.key === "Tab") && target) {
      event.preventDefault();
      onPick(target);
      return true;
    }
    return false;
  };

  return { highlight, setHighlight, handleKeyDown };
}

function SuggestionList({
  items,
  highlight,
  isSearching,
  onHover,
  onPick,
}: {
  items: BarItem[];
  highlight: number;
  isSearching: boolean;
  onHover: (index: number) => void;
  onPick: (item: BarItem) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // Keyboard moves keep the highlighted option in view.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-option-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  if (items.length === 0) {
    return <div className={S.empty}>No results</div>;
  }
  return (
    <div className={S.options} ref={listRef}>
      {items.map((item, index) => (
        <Fragment key={item.id}>
          {item.section && item.section !== items[index - 1]?.section && (
            <div
              className={cx(S.sectionHeader, {
                [S.sectionDivider]: index > 0,
              })}
            >
              {item.sectionIcon && (
                <Icon className={S.sectionIcon} name={item.sectionIcon} />
              )}
              <span>{item.section}</span>
            </div>
          )}
          <button
            className={cx(S.option, { [S.optionActive]: index === highlight })}
            data-option-index={index}
            disabled={item.disabled}
            // Keep focus in the input while clicking an option.
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() =>
              index !== highlight && !item.disabled && onHover(index)
            }
            onClick={() => onPick(item)}
          >
            {item.icon && <Icon name={item.icon} className={S.optionIcon} />}
            <span className={S.optionLabel}>{item.label}</span>
            {item.description && (
              <span className={S.optionDescription}>{item.description}</span>
            )}
            {item.info && (
              <Tooltip label={item.info} position="right">
                <span
                  className={S.optionInfo}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Icon name="info" size={14} />
                </span>
              </Tooltip>
            )}
            {item.hint && <span className={S.optionHint}>{item.hint}</span>}
            {isSearching && index === highlight && (
              <span className={S.tabHint}>Tab</span>
            )}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * A pill part being edited in place, like a filter pill's column or value:
 * the part turns into an input with the same dropdown under it.
 */
export function InlineSuggest({
  placeholder,
  getItems,
  onPick,
  onCancel,
  onBackspaceEmpty,
}: {
  placeholder: string;
  getItems: (query: string) => BarItem[];
  onPick: (item: BarItem) => void;
  /** Escape (true), or a click elsewhere (false). */
  onCancel: (isEscape: boolean) => void;
  onBackspaceEmpty?: () => void;
}) {
  const [query, setQuery] = useState("");
  const items = getItems(query);
  const list = useSuggestionList(items, query);

  return (
    <Popover
      opened
      position="bottom-start"
      shadow="md"
      trapFocus={false}
      returnFocus={false}
      offset={6}
    >
      <Popover.Target>
        <input
          className={S.input}
          autoFocus
          value={query}
          placeholder={placeholder}
          size={Math.max(query.length, placeholder.length, 1)}
          onChange={(event) => setQuery(event.target.value)}
          onBlur={() => onCancel(false)}
          onKeyDown={(event) => {
            if (list.handleKeyDown(event, onPick)) {
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel(true);
            } else if (event.key === "Backspace" && query === "") {
              event.preventDefault();
              if (onBackspaceEmpty) {
                onBackspaceEmpty();
              } else {
                onCancel(true);
              }
            }
          }}
        />
      </Popover.Target>
      <Popover.Dropdown p={0} w={DROPDOWN_WIDTH} className={S.dropdown}>
        <SuggestionList
          items={items}
          highlight={list.highlight}
          isSearching={query.trim() !== ""}
          onHover={list.setHighlight}
          onPick={onPick}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
