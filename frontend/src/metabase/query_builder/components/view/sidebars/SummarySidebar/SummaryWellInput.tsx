import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { Box, Combobox, Icon, PillsInput, useCombobox } from "metabase/ui";

import { MatchedLabel } from "./MatchedLabel";
import S from "./SummarySidebar.module.css";
import type { SummaryField, SummaryFieldSection, SummaryWellId } from "./types";
import { filterFieldSections } from "./utils";

const DROPDOWN_GAP_PX = 4;
const DROPDOWN_MAX_HEIGHT_PX = 320;

/** Where the typeahead sits relative to its field, so it lines up with the well card instead. */
type DropdownFrame = {
  position: "bottom-start" | "top-start";
  width: number;
  offset: { mainAxis: number; crossAxis: number };
};

/**
 * Opens below the card, or above it when there's more room there. The side is picked here rather
 * than by flipping, because the offset that clears the card differs per side.
 * The card is the field's parent; `null` if the field isn't mounted in one.
 */
function getCardFrame(field: HTMLElement): DropdownFrame | null {
  const card = field.parentElement;
  if (card == null) {
    return null;
  }
  const fieldRect = field.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const spaceBelow = window.innerHeight - cardRect.bottom;
  const isBelow =
    spaceBelow >= DROPDOWN_MAX_HEIGHT_PX || spaceBelow >= cardRect.top;
  return {
    position: isBelow ? "bottom-start" : "top-start",
    width: cardRect.width,
    offset: {
      mainAxis:
        (isBelow
          ? cardRect.bottom - fieldRect.bottom
          : fieldRect.top - cardRect.top) + DROPDOWN_GAP_PX,
      crossAxis: cardRect.left - fieldRect.left,
    },
  };
}

function getPlaceholder(wellId: SummaryWellId, hasItems: boolean) {
  if (hasItems) {
    return wellId === "values" ? t`Add a value…` : t`Add a column…`;
  }
  return wellId === "values" ? t`Type a metric or column` : t`Type a column`;
}

function getOptionValue(sectionKey: string, itemKey: string) {
  return `${sectionKey}/${itemKey}`;
}

type SummaryWellInputProps = {
  wellId: SummaryWellId;
  /** What the well's typeahead offers, before searching. */
  sections: SummaryFieldSection[];
  /** The well's chips, laid out inline before the field. */
  children: ReactNode;
  hasItems: boolean;
  autoFocus?: boolean;
  onPick: (field: SummaryField) => void;
  /** Backspace in the empty field: takes off the last chip, like any pills input. */
  onRemoveLast: () => void;
};

/**
 * A well's field: its chips followed by a typeahead that finds metrics (Summarize by) or
 * columns (Group by) by name.
 */
export function SummaryWellInput({
  wellId,
  sections,
  children,
  hasItems,
  autoFocus = false,
  onPick,
  onRemoveLast,
}: SummaryWellInputProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownFrame, setDropdownFrame] = useState<DropdownFrame | null>(
    null,
  );
  const combobox = useCombobox({
    onDropdownOpen: () =>
      setDropdownFrame(fieldRef.current && getCardFrame(fieldRef.current)),
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const matchingSections = useMemo(
    () => filterFieldSections(sections, searchText),
    [sections, searchText],
  );
  // highlight the best match once the filtered options render, so Enter picks it
  // rather than whatever sat first in the previous list
  const comboboxRef = useLatest(combobox);
  useEffect(() => {
    if (searchText.length > 0) {
      comboboxRef.current.selectFirstOption();
    }
  }, [comboboxRef, matchingSections, searchText]);

  const handleOptionSubmit = (optionValue: string) => {
    setSearchText("");
    combobox.closeDropdown();
    const item = matchingSections
      .flatMap((section) =>
        section.items.map((item) => ({
          value: getOptionValue(section.key, item.key),
          item,
        })),
      )
      .find((option) => option.value === optionValue);
    if (item) {
      onPick(item.item.field);
    }
  };

  // the typeahead waits for the first character, so focusing a well doesn't cover the wells below
  const handleSearchChange = (text: string) => {
    setSearchText(text);
    if (text.trim().length > 0) {
      combobox.openDropdown();
    } else {
      combobox.closeDropdown();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && searchText.length === 0 && hasItems) {
      event.preventDefault();
      onRemoveLast();
    }
  };

  return (
    <Combobox
      store={combobox}
      position={dropdownFrame?.position ?? "bottom-start"}
      middlewares={{ flip: dropdownFrame == null, shift: true }}
      width={dropdownFrame?.width ?? "target"}
      offset={dropdownFrame?.offset ?? DROPDOWN_GAP_PX}
      radius="md"
      shadow="sm_outline"
      classNames={{
        dropdown: S.searchDropdown,
        options: S.searchOptions,
        option: S.searchOption,
        groupLabel: S.searchGroupLabel,
        empty: S.searchEmpty,
      }}
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.DropdownTarget>
        <Box ref={fieldRef} className={S.wellField}>
          {children}
          <Combobox.EventsTarget>
            <PillsInput.Field
              ref={inputRef}
              className={S.wellFieldInput}
              placeholder={getPlaceholder(wellId, hasItems)}
              value={searchText}
              aria-label={
                wellId === "values"
                  ? t`Add a value by name`
                  : t`Add a grouping by name`
              }
              data-testid={`summary-well-input-${wellId}`}
              onChange={(event) =>
                handleSearchChange(event.currentTarget.value)
              }
              onKeyDown={handleKeyDown}
              onBlur={() => combobox.closeDropdown()}
            />
          </Combobox.EventsTarget>
        </Box>
      </Combobox.DropdownTarget>
      <Combobox.Dropdown>
        <Combobox.Options
          mah={DROPDOWN_MAX_HEIGHT_PX}
          style={{ overflowY: "auto" }}
        >
          {matchingSections.length === 0 && (
            <Combobox.Empty>
              {wellId === "values"
                ? t`No matching metrics or columns`
                : t`No matching columns`}
            </Combobox.Empty>
          )}
          {matchingSections.map((section) => (
            <Combobox.Group key={section.key} label={section.name}>
              {section.items.map((item) => (
                <Combobox.Option
                  key={item.key}
                  value={getOptionValue(section.key, item.key)}
                >
                  <Icon
                    name={item.icon}
                    className={S.searchOptionIcon}
                    aria-hidden
                  />
                  <Box className={S.searchOptionText}>
                    <MatchedLabel label={item.name} searchText={searchText} />
                  </Box>
                </Combobox.Option>
              ))}
            </Combobox.Group>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
