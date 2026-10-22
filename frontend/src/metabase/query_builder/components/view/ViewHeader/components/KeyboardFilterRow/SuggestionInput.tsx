import type { KeyboardEvent, Ref } from "react";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { Checkbox, Combobox, Flex, Icon, useCombobox } from "metabase/ui";

import S from "./KeyboardFilterRow.module.css";
import type { SuggestionGroup } from "./types";

interface SuggestionInputProps {
  inputRef?: Ref<HTMLInputElement>;
  groups: SuggestionGroup[];
  text: string;
  placeholder: string;
  /** Options show checkboxes, and the dropdown stays open after a click. */
  isMultiSelect?: boolean;
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
        options: group.options.filter((option) =>
          option.label.toLowerCase().includes(searchText),
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, text]);

  const hasOptions = filteredGroups.length > 0;
  const hasSuggestions = groups.some((group) => group.options.length > 0);

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

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      width={280}
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
          <Combobox.Options className={S.options}>
            {hasOptions ? (
              filteredGroups.map((group, groupIndex) => (
                <Combobox.Group key={groupIndex} label={group.label}>
                  {group.options.map((option) => (
                    <Combobox.Option
                      key={option.value}
                      value={option.value}
                      active={option.isChecked}
                    >
                      {isMultiSelect ? (
                        <Checkbox
                          className={S.optionCheckbox}
                          checked={option.isChecked ?? false}
                          label={option.label}
                          readOnly
                          tabIndex={-1}
                        />
                      ) : (
                        <Flex align="center" gap="sm">
                          {option.icon && <Icon name={option.icon} />}
                          {option.label}
                        </Flex>
                      )}
                    </Combobox.Option>
                  ))}
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
