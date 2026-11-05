import cx from "classnames";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { Checkbox, Combobox, Flex, Icon, Kbd, useCombobox } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./KeyboardFilterRow.module.css";
import { UNSCORED, getOptionScores } from "./fuzzy-search";
import type { SuggestionGroup, SuggestionOption } from "./types";

const DEFAULT_DROPDOWN_WIDTH = 280;

/** The space between a dropdown and the right edge of the window. */
const VIEWPORT_MARGIN = 16;

/**
 * Prototype: the dropdown starts at the left edge of the pill. Near the right
 * edge of the window, it moves left so that it stays in the window, and the
 * page does not scroll sideways.
 */
function useDropdownShift(isOpened: boolean) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef(0);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const dropdown = dropdownRef.current;
    if (!isOpened || dropdown == null) {
      return;
    }
    const update = () => {
      const rect = dropdown.getBoundingClientRect();
      const left = rect.left - shiftRef.current;
      const overflow =
        left + rect.width - (window.innerWidth - VIEWPORT_MARGIN);
      shiftRef.current = overflow > 0 ? -Math.min(overflow, left) : 0;
      setShift(shiftRef.current);
    };
    // The size of the dropdown changes with its options.
    const observer = new ResizeObserver(update);
    observer.observe(dropdown);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [isOpened]);
  return { dropdownRef, dropdownShift: shift };
}

interface SuggestionInputProps {
  inputRef?: Ref<HTMLInputElement>;
  groups: SuggestionGroup[];
  text: string;
  placeholder: string;
  /** Options show checkboxes, and the dropdown stays open after a click. */
  isMultiSelect?: boolean;
  /**
   * The first option is highlighted before the user types, so that Enter or
   * Tab picks it at once.
   */
  isFirstOptionHighlighted?: boolean;
  /**
   * Prototype: with typed text, the option that Tab picks shows a "Tab" key.
   * It is the highlighted option, or the first option when no option is
   * highlighted.
   */
  hasTabHint?: boolean;
  /** Options are a grid of tiles instead of a list. */
  isTiles?: boolean;
  /** Number of option columns in the list. */
  columns?: number;
  dropdownWidth?: number;
  /** The height of a dropdown with an aside panel, in place of the default. */
  dropdownHeight?: number;
  /** Max height of the scrolling list of options, like "20rem". */
  optionsMaxHeight?: string;
  /** Content above the options, like presets or a map. */
  header?: ReactNode;
  /** Content below the options, like the count of matching rows. */
  footer?: ReactNode;
  /** A panel on the right of the options, like a map. */
  aside?: ReactNode;
  /** Shown when no option matches the text. */
  emptyMessage?: string;
  onTextChange: (text: string) => void;
  onOptionSubmit: (value: string) => void;
  /**
   * Called before the dropdown handles the key. Return true to stop the
   * dropdown from handling it.
   */
  onKeyDown?: (
    event: KeyboardEvent<HTMLInputElement>,
    hasSelectedOption: boolean,
    firstOptionValue: string | undefined,
  ) => boolean;
}

/**
 * An input in a filter pill with a dropdown of suggestions under it. The text
 * of the input filters the suggestions.
 */
export function SuggestionInput({
  inputRef,
  groups,
  text,
  placeholder,
  isMultiSelect = false,
  isFirstOptionHighlighted = false,
  hasTabHint = false,
  isTiles = false,
  columns = 1,
  dropdownWidth = DEFAULT_DROPDOWN_WIDTH,
  dropdownHeight,
  optionsMaxHeight,
  header,
  footer,
  aside,
  emptyMessage = t`No results`,
  onTextChange,
  onOptionSubmit,
  onKeyDown,
}: SuggestionInputProps) {
  // Prototype: no loop, so ArrowUp on the first option goes back to the input.
  const combobox = useCombobox({ defaultOpened: true, loop: false });
  const { dropdownRef, dropdownShift } = useDropdownShift(
    combobox.dropdownOpened,
  );
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(),
  );
  // A search shows its matches in all the sections, also in collapsed ones.
  const isSearching = text.trim().length > 0;
  const isCollapsed = (section: string | undefined) =>
    section != null && !isSearching && collapsedSections.has(section);
  const toggleSection = (section: string) => {
    const newSections = new Set(collapsedSections);
    if (newSections.has(section)) {
      newSections.delete(section);
    } else {
      newSections.add(section);
    }
    setCollapsedSections(newSections);
  };

  const { selectFirstOption, resetSelectedOption } = combobox;

  const filteredGroups = useMemo(() => {
    const searchText = text.trim().toLowerCase();
    const scores = getOptionScores(groups, searchText);
    const scoreOf = (option: SuggestionOption) =>
      scores.get(option.value) ?? UNSCORED;
    // Each group keeps its place, and its best matches come first.
    const matchedGroups = groups.map((group) => ({
      ...group,
      options:
        group.isUnfiltered || matchesGroupLabel(group.label, searchText)
          ? group.options
          : group.options
              .filter((option) => scores.has(option.value))
              .sort((a, b) => scoreOf(a) - scoreOf(b)),
    }));
    // An unfiltered group, like related columns, leaves out the options that
    // the other groups already show.
    const shownValues = new Set(
      matchedGroups
        .filter((group) => !group.isUnfiltered)
        .flatMap((group) => group.options.map((option) => option.value)),
    );
    return matchedGroups
      .map((group) =>
        group.isUnfiltered
          ? {
              ...group,
              options: group.options.filter(
                (option) => !shownValues.has(option.value),
              ),
            }
          : group,
      )
      .filter((group) => group.options.length > 0);
  }, [groups, text]);

  const hasOptions = filteredGroups.length > 0;
  const hasSuggestions =
    header != null || groups.some((group) => group.options.length > 0);
  // Parent renders can rebuild the groups while an arrow key is selecting an
  // option. Reset the highlight only when the available options change.
  const optionKeys = JSON.stringify(
    filteredGroups.flatMap((group) =>
      group.options.map((option) => [option.value, option.disabled]),
    ),
  );

  // In a single select, Enter picks the first match. In a multi select, Enter
  // with no highlighted option adds the typed text, so nothing is highlighted
  // until the user moves with the arrow keys.
  useEffect(() => {
    if (
      hasOptions &&
      !isMultiSelect &&
      (text.length > 0 || isFirstOptionHighlighted)
    ) {
      selectFirstOption();
    } else {
      resetSelectedOption();
    }
  }, [
    selectFirstOption,
    resetSelectedOption,
    optionKeys,
    hasOptions,
    isMultiSelect,
    isFirstOptionHighlighted,
    text,
  ]);

  const firstOptionValue = filteredGroups[0]?.options[0]?.value;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const hasSelectedOption =
      combobox.dropdownOpened && combobox.getSelectedOptionIndex() !== -1;
    // Prototype: ArrowUp on the first option leaves the list, and the keys
    // work on the input again: Enter and Tab complete the filter. The combobox
    // handles the key after this handler, so the reset waits for it.
    if (event.key === "ArrowUp" && combobox.getSelectedOptionIndex() === 0) {
      queueMicrotask(() => combobox.resetSelectedOption());
    }
    if (onKeyDown?.(event, hasSelectedOption, firstOptionValue)) {
      event.preventDefault();
      event.stopPropagation();
    } else if (event.key === "Tab" && hasSelectedOption) {
      // Tab accepts the highlighted suggestion, like Enter.
      event.preventDefault();
      combobox.clickSelectedOption();
    }
  };

  const renderOption = (option: SuggestionOption) => {
    if (isTiles) {
      return (
        <Combobox.Option
          key={option.value}
          value={option.value}
          className={cx(S.tile, { [S.shareTile]: option.share != null })}
          style={
            option.share != null
              ? { "--tile-share": `${option.share.value * 100}%` }
              : undefined
          }
          aria-pressed={option.isChecked ?? false}
        >
          <OptionLabel
            option={option.isChecked ? { ...option, icon: "check" } : option}
          />
          {option.share != null && (
            <span className={S.tileShare}>{option.share.label}</span>
          )}
        </Combobox.Option>
      );
    }
    return (
      <Combobox.Option
        key={option.value}
        value={option.value}
        className={cx(S.optionRow, {
          [S.selectedOption]: !isMultiSelect && option.isChecked,
        })}
        active={option.isChecked}
        disabled={option.disabled}
        data-tab-target={option.value === firstOptionValue || undefined}
      >
        {isMultiSelect ? (
          <Checkbox
            className={S.optionCheckbox}
            variant={option.isSelectAll ? "stacked" : undefined}
            classNames={{
              body: S.optionCheckboxBody,
              labelWrapper: S.optionCheckboxLabelWrapper,
            }}
            checked={option.isChecked ?? false}
            indeterminate={option.isIndeterminate}
            label={<OptionLabel option={option} />}
            readOnly
            tabIndex={-1}
          />
        ) : (
          <OptionLabel option={option} />
        )}
        {hasTabHint && isSearching && !option.disabled && (
          <Kbd className={S.tabHint}>{t`Tab`}</Kbd>
        )}
      </Combobox.Option>
    );
  };

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      width={dropdownWidth}
      withinPortal={false}
      classNames={{
        dropdown: S.pillDropdown,
        groupLabel: S.groupLabel,
        option: S.option,
      }}
      onOptionSubmit={(value) => {
        onOptionSubmit(value);
        if (isMultiSelect) {
          combobox.openDropdown();
        }
      }}
    >
      <Combobox.Target>
        <input
          ref={inputRef}
          className={S.input}
          value={text}
          placeholder={placeholder}
          autoFocus
          size={Math.max(text.length, placeholder.length, placeholder ? 4 : 1)}
          data-empty={(text === "" && placeholder === "") || undefined}
          onChange={(event) => {
            onTextChange(event.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          onClick={() => combobox.openDropdown()}
          onKeyDown={handleKeyDown}
        />
      </Combobox.Target>
      {hasSuggestions && (
        <Combobox.Dropdown
          ref={dropdownRef}
          className={cx({ [S.dropdownWithAside]: aside })}
          style={{ marginLeft: dropdownShift }}
        >
          <div
            className={S.dropdownMain}
            style={aside != null ? { height: dropdownHeight } : undefined}
          >
            {header != null && (
              // Clicks in the header keep the focus in the input, except
              // clicks in a text input of the header.
              <div
                className={S.dropdownHeader}
                onMouseDown={(event) => {
                  if (!isTextInput(event.target)) {
                    event.preventDefault();
                  }
                }}
              >
                {header}
              </div>
            )}
            <Combobox.Options className={S.options} mah={optionsMaxHeight}>
              {hasOptions ? (
                filteredGroups.map((group, groupIndex) => (
                  <Fragment key={groupIndex}>
                    {group.section != null &&
                      group.section !==
                        filteredGroups[groupIndex - 1]?.section && (
                        <SectionHeader
                          section={group.section}
                          icon={group.sectionIcon}
                          isCollapsed={isCollapsed(group.section)}
                          isCollapsible={!isSearching}
                          hasDivider={groupIndex > 0}
                          onToggle={toggleSection}
                        />
                      )}
                    {group.hasDivider && groupIndex > 0 && (
                      <div className={S.groupDivider} />
                    )}
                    {!isCollapsed(group.section) && (
                      <Combobox.Group label={group.label}>
                        <div
                          className={cx({
                            [S.optionGrid]: isTiles || columns > 1,
                          })}
                          style={{
                            gridTemplateColumns: `repeat(${isTiles ? 2 : columns}, minmax(0, 1fr))`,
                          }}
                        >
                          {group.options.map(renderOption)}
                        </div>
                      </Combobox.Group>
                    )}
                  </Fragment>
                ))
              ) : (
                <Combobox.Empty>{emptyMessage}</Combobox.Empty>
              )}
            </Combobox.Options>
            {footer != null && <div className={S.dropdownFooter}>{footer}</div>}
          </div>
          {aside != null && (
            // Clicks in the panel keep the focus in the input.
            <div
              className={S.dropdownAside}
              onMouseDown={(event) => event.preventDefault()}
            >
              {aside}
            </div>
          )}
        </Combobox.Dropdown>
      )}
    </Combobox>
  );
}

interface SectionHeaderProps {
  section: string;
  icon?: IconName;
  isCollapsed: boolean;
  isCollapsible: boolean;
  hasDivider: boolean;
  onToggle: (section: string) => void;
}

/** A header of a section, like a table. A click collapses the section. */
function SectionHeader({
  section,
  icon,
  isCollapsed,
  isCollapsible,
  hasDivider,
  onToggle,
}: SectionHeaderProps) {
  const className = cx(S.sectionHeader, { [S.sectionDivider]: hasDivider });
  if (!isCollapsible) {
    return (
      <Flex className={className} align="center" gap="sm">
        {icon && <Icon className={S.sectionIcon} name={icon} />}
        {section}
      </Flex>
    );
  }
  return (
    <button
      className={cx(className, S.sectionToggle)}
      type="button"
      aria-expanded={!isCollapsed}
      // The click keeps the focus in the input.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onToggle(section)}
    >
      <Flex align="center" gap="sm" miw={0}>
        {icon && <Icon className={S.sectionIcon} name={icon} />}
        <span className={S.sectionTitle}>{section}</span>
      </Flex>
      <Icon name={isCollapsed ? "chevronright" : "chevrondown"} size={12} />
    </button>
  );
}

const MIN_GROUP_SEARCH_LENGTH = 3;

/**
 * A search that matches the start of a word in the group label, like "ident"
 * for "Identifiers" or "info" for "Personal Information", shows the whole
 * group.
 */
function matchesGroupLabel(label: string | undefined, searchText: string) {
  if (label == null || searchText.length < MIN_GROUP_SEARCH_LENGTH) {
    return false;
  }
  const lowerLabel = label.toLowerCase();
  return lowerLabel
    .split("")
    .some(
      (_, index) =>
        (index === 0 || !/[a-z0-9]/.test(lowerLabel[index - 1])) &&
        lowerLabel.startsWith(searchText, index),
    );
}

function isTextInput(target: EventTarget) {
  return target instanceof HTMLInputElement && target.type === "text";
}

function OptionLabel({ option }: { option: SuggestionOption }) {
  return (
    // A hint goes to the right end, so the label takes the whole row.
    <Flex align="center" gap="sm" miw={0} w={option.hint ? "100%" : undefined}>
      {option.icon && <Icon name={option.icon} />}
      {option.leftSection}
      <span className={S.optionLabel} title={option.label}>
        {option.label}
      </span>
      {option.description && (
        <span className={S.optionDescription}>{option.description}</span>
      )}
      {option.hint && <span className={S.optionHint}>{option.hint}</span>}
    </Flex>
  );
}
