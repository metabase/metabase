import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLatest } from "react-use";

import { Box, Combobox, Icon, PillsInput, useCombobox } from "metabase/ui";

import { MatchedLabel } from "../MatchedLabel";
import S from "../SummarySidebar.module.css";
import { MAX_FORMULA_PROMPT_LENGTH } from "../generate-formula";
import type {
  SummaryField,
  SummaryFieldSection,
  SummaryWellId,
} from "../types";
import { filterFieldSections } from "../utils";

import {
  GENERATE_OPTION_VALUE,
  GenerateFormulaOption,
} from "./GenerateFormulaOption";
import type { FormulaGenerator } from "./use-formula-generator";
import {
  DROPDOWN_GAP_PX,
  DROPDOWN_MAX_HEIGHT_PX,
  type DropdownFrame,
  getCardFrame,
  getFieldTexts,
  getOptionValue,
} from "./utils";

type SummaryWellInputProps = {
  wellId: SummaryWellId;
  sections: SummaryFieldSection[];
  children: ReactNode;
  hasItems: boolean;
  autoFocus?: boolean;
  onPick: (field: SummaryField) => void;
  onRemoveLast: () => void;
  formulaGenerator?: FormulaGenerator;
};

export function SummaryWellInput({
  wellId,
  sections,
  children,
  hasItems,
  autoFocus = false,
  onPick,
  onRemoveLast,
  formulaGenerator,
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
  const texts = getFieldTexts(wellId, hasItems);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const matchingSections = useMemo(
    () => filterFieldSections(sections, searchText),
    [sections, searchText],
  );

  const comboboxRef = useLatest(combobox);
  useEffect(() => {
    if (searchText.length > 0) {
      comboboxRef.current.selectFirstOption();
    }
  }, [comboboxRef, matchingSections, searchText]);

  const prompt = searchText.trim();
  const isGenerating = formulaGenerator?.state.status === "loading";

  const handleFormulaAdd = () => {
    setSearchText("");
    combobox.closeDropdown();
  };

  const handleOptionSubmit = (optionValue: string) => {
    if (optionValue === GENERATE_OPTION_VALUE) {
      return;
    }
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
              placeholder={texts.placeholder}
              value={searchText}
              maxLength={MAX_FORMULA_PROMPT_LENGTH}
              readOnly={isGenerating}
              aria-label={texts.label}
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
          {matchingSections.length === 0 &&
            (formulaGenerator && prompt.length > 0 ? (
              <GenerateFormulaOption
                generator={formulaGenerator}
                prompt={prompt}
                fallback={<Combobox.Empty>{texts.noMatches}</Combobox.Empty>}
                onShow={() => comboboxRef.current.selectFirstOption()}
                onAdd={handleFormulaAdd}
              />
            ) : (
              <Combobox.Empty>{texts.noMatches}</Combobox.Empty>
            ))}
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
