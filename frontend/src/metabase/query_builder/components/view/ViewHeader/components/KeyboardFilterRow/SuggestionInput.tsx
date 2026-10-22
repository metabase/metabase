import cx from "classnames";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { Checkbox, Combobox, Flex, Icon, useCombobox } from "metabase/ui";

import S from "./KeyboardFilterRow.module.css";
import type { SuggestionGroup, SuggestionOption } from "./types";

const DEFAULT_DROPDOWN_WIDTH = 280;

interface SuggestionInputProps {
  inputRef?: Ref<HTMLInputElement>;
  groups: SuggestionGroup[];
  text: string;
  placeholder: string;
  /** Options show checkboxes, and the dropdown stays open after a click. */
  isMultiSelect?: boolean;
  /** Options are a grid of tiles instead of a list. */
  isTiles?: boolean;
  /** Number of option columns in the list. */
  columns?: number;
  dropdownWidth?: number;
  /** Content above the options, like presets or a map. */
  header?: ReactNode;
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
  isTiles = false,
  columns = 1,
  dropdownWidth = DEFAULT_DROPDOWN_WIDTH,
  header,
  emptyMessage = t`No results`,
  onTextChange,
  onOptionSubmit,
  onKeyDown,
}: SuggestionInputProps) {
  const combobox = useCombobox({ defaultOpened: true });
  const { selectFirstOption, resetSelectedOption } = combobox;

  const filteredGroups = useMemo(() => {
    const searchText = text.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter(
          (option) =>
            option.label.toLowerCase().includes(searchText) ||
            option.description?.toLowerCase().includes(searchText),
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, text]);

  const hasOptions = filteredGroups.length > 0;
  const hasSuggestions =
    header != null || groups.some((group) => group.options.length > 0);

  // In a single select, Enter picks the first match. In a multi select, Enter
  // with no highlighted option adds the typed text, so nothing is highlighted
  // until the user moves with the arrow keys.
  useEffect(() => {
    if (hasOptions && !isMultiSelect && text.length > 0) {
      selectFirstOption();
    } else {
      resetSelectedOption();
    }
  }, [
    selectFirstOption,
    resetSelectedOption,
    filteredGroups,
    hasOptions,
    isMultiSelect,
    text,
  ]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const hasSelectedOption =
      combobox.dropdownOpened && combobox.getSelectedOptionIndex() !== -1;
    const firstOptionValue = filteredGroups[0]?.options[0]?.value;
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
          className={S.tile}
          aria-pressed={option.isChecked ?? false}
        >
          <OptionLabel option={option} />
        </Combobox.Option>
      );
    }
    return (
      <Combobox.Option
        key={option.value}
        value={option.value}
        active={option.isChecked}
      >
        {isMultiSelect ? (
          <Checkbox
            className={S.optionCheckbox}
            classNames={{
              body: S.optionCheckboxBody,
              labelWrapper: S.optionCheckboxLabelWrapper,
            }}
            checked={option.isChecked ?? false}
            label={<OptionLabel option={option} />}
            readOnly
            tabIndex={-1}
          />
        ) : (
          <OptionLabel option={option} />
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
      classNames={{ groupLabel: S.groupLabel, option: S.option }}
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
          size={Math.max(text.length, placeholder.length, 4)}
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
        <Combobox.Dropdown>
          {header != null && (
            // Clicks in the header keep the focus in the input.
            <div
              className={S.dropdownHeader}
              onMouseDown={(event) => event.preventDefault()}
            >
              {header}
            </div>
          )}
          <Combobox.Options className={S.options}>
            {hasOptions ? (
              filteredGroups.map((group, groupIndex) => (
                <Combobox.Group key={groupIndex} label={group.label}>
                  <div
                    className={cx({ [S.optionGrid]: isTiles || columns > 1 })}
                    style={{
                      gridTemplateColumns: `repeat(${isTiles ? 2 : columns}, minmax(0, 1fr))`,
                    }}
                  >
                    {group.options.map(renderOption)}
                  </div>
                </Combobox.Group>
              ))
            ) : (
              <Combobox.Empty>{emptyMessage}</Combobox.Empty>
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      )}
    </Combobox>
  );
}

function OptionLabel({ option }: { option: SuggestionOption }) {
  return (
    <Flex align="center" gap="sm" miw={0}>
      {option.icon && <Icon name={option.icon} />}
      {option.leftSection}
      <span className={S.optionLabel} title={option.label}>
        {option.label}
      </span>
      {option.description && (
        <span className={S.optionDescription}>{option.description}</span>
      )}
    </Flex>
  );
}
