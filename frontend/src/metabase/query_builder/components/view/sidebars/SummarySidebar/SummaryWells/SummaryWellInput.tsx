import { useMergedRef } from "@mantine/hooks";
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
import type { SummaryFormulaInput } from "../SummaryFormulaBar";
import type { SummaryFormulaGenerator } from "../SummaryFormulaGenerator";
import S from "../SummarySidebar.module.css";
import type {
  SummaryField,
  SummaryFieldSection,
  SummaryWellId,
} from "../types";
import { filterFieldSections } from "../utils";

import {
  CUSTOM_FORMULA_OPTION_VALUE,
  CustomFormulaOption,
} from "./CustomFormulaOption";
import {
  GENERATE_OPTION_VALUE,
  GenerateFormulaOption,
  type GenerateFormulaState,
} from "./GenerateFormulaOption";
import { useWellFieldRef } from "./SummaryWell";
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
  children?: ReactNode;
  hasItems: boolean;
  autoFocus?: boolean;
  formulaInput?: SummaryFormulaInput;
  formulaGenerator?: SummaryFormulaGenerator;
  onPick: (field: SummaryField) => void;
  onRemoveLast: () => void;
};

export function SummaryWellInput({
  wellId,
  sections,
  children,
  hasItems,
  autoFocus = false,
  formulaInput,
  formulaGenerator,
  onPick,
  onRemoveLast,
}: SummaryWellInputProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mergedInputRef = useMergedRef(inputRef, useWellFieldRef());
  /**
   * True from a Backspace press in this field until its release. A held Backspace keeps
   * repeating into a field that gets the focus when another well goes away.
   */
  const isBackspaceHeldRef = useRef(false);
  const [dropdownFrame, setDropdownFrame] = useState<DropdownFrame | null>(
    null,
  );
  const combobox = useCombobox({
    onDropdownOpen: () =>
      setDropdownFrame(fieldRef.current && getCardFrame(fieldRef.current)),
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const [searchText, setSearchText] = useState("");
  const [generateState, setGenerateState] = useState<GenerateFormulaState>({
    status: "idle",
  });
  const isGenerating = generateState.status === "loading";
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

  const prompt = searchText.trim();
  const canGenerate =
    formulaGenerator != null &&
    formulaInput != null &&
    matchingSections.length === 0 &&
    prompt.length > 0 &&
    !prompt.startsWith("=");
  const isGenerateOptionShown =
    canGenerate && formulaGenerator.access === "available";
  const isOtherWellGenerating =
    !isGenerating && formulaGenerator?.isGenerating === true;
  const isGenerateOptionBlocked =
    isGenerateOptionShown && isOtherWellGenerating;

  const comboboxRef = useLatest(combobox);
  useEffect(() => {
    if (searchText.length === 0) {
      return;
    }
    if (isGenerateOptionBlocked) {
      comboboxRef.current.resetSelectedOption();
    } else {
      comboboxRef.current.selectFirstOption();
    }
  }, [
    comboboxRef,
    matchingSections,
    searchText,
    isGenerateOptionShown,
    isGenerateOptionBlocked,
  ]);

  const handleGenerate = async () => {
    if (!formulaGenerator || formulaGenerator.isGenerating) {
      return;
    }
    setGenerateState({ status: "loading" });
    const result = await formulaGenerator.generateBasedOnPrompt(wellId, prompt);
    if (result.status === "cancelled") {
      return;
    }
    if (result.status === "error") {
      setGenerateState({ status: "error", message: result.message });
      return;
    }
    setGenerateState({ status: "idle" });
    setSearchText("");
    combobox.closeDropdown();
    if (result.status === "invalid" && formulaInput && inputRef.current) {
      // the formula bar shows why it doesn't compile, so it can be fixed there
      formulaInput.start(
        result.source,
        inputRef.current,
        () => {},
        result.name,
      );
    }
  };

  const handleOptionSubmit = (optionValue: string) => {
    if (optionValue === GENERATE_OPTION_VALUE) {
      handleGenerate();
      return;
    }
    setSearchText("");
    combobox.closeDropdown();
    if (optionValue === CUSTOM_FORMULA_OPTION_VALUE) {
      if (formulaInput && inputRef.current) {
        formulaInput.start("", inputRef.current, () => setSearchText(""));
      }
      return;
    }
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
    if (formulaInput?.isPending()) {
      setSearchText(text);
      formulaInput.update(text.startsWith("=") ? text.slice(1) : text);
      return;
    }
    if (formulaInput && text.startsWith("=") && inputRef.current) {
      setSearchText(text);
      combobox.closeDropdown();
      formulaInput.start(text.slice(1), inputRef.current, () =>
        setSearchText(""),
      );
      return;
    }
    setSearchText(text);
    setGenerateState({ status: "idle" });
    if (text.trim().length > 0) {
      combobox.openDropdown();
    } else {
      combobox.closeDropdown();
    }
  };

  const handleSearchChangeRef = useLatest(handleSearchChange);
  const isFormulaEnabled = formulaInput !== undefined;
  useEffect(() => {
    const input = inputRef.current;
    if (
      isFormulaEnabled &&
      input?.value.startsWith("=") &&
      input === document.activeElement
    ) {
      handleSearchChangeRef.current(input.value);
    }
  }, [isFormulaEnabled, handleSearchChangeRef]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Backspace") {
      return;
    }
    if (!event.repeat) {
      isBackspaceHeldRef.current = true;
    }
    if (!isBackspaceHeldRef.current) {
      event.preventDefault();
      return;
    }
    if (searchText.length === 0 && hasItems && !formulaInput?.isPending()) {
      event.preventDefault();
      onRemoveLast();
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      isBackspaceHeldRef.current = false;
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
        group: S.searchGroup,
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
              ref={mergedInputRef}
              className={S.wellFieldInput}
              placeholder={texts.placeholder}
              value={searchText}
              readOnly={isGenerating}
              aria-label={texts.label}
              data-testid={`summary-well-input-${wellId}`}
              onChange={(event) =>
                handleSearchChange(event.currentTarget.value)
              }
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              onBlur={() => {
                isBackspaceHeldRef.current = false;
                if (!isGenerating) {
                  combobox.closeDropdown();
                }
              }}
            />
          </Combobox.EventsTarget>
        </Box>
      </Combobox.DropdownTarget>
      <Combobox.Dropdown>
        <Combobox.Options
          mah={DROPDOWN_MAX_HEIGHT_PX}
          style={{ overflowY: "auto" }}
        >
          {canGenerate ? (
            <GenerateFormulaOption
              wellId={wellId}
              prompt={prompt}
              state={generateState}
              access={formulaGenerator.access}
              isBlocked={isOtherWellGenerating}
              fallback={<Combobox.Empty>{texts.noMatches}</Combobox.Empty>}
            />
          ) : (
            matchingSections.length === 0 && (
              <Combobox.Empty>{texts.noMatches}</Combobox.Empty>
            )
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
          {formulaInput && <CustomFormulaOption wellId={wellId} />}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
