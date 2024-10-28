import { useCallback } from "react";

import Radio from "metabase/core/components/Radio";

import type { SectionRadioProps } from "../types";

import { SectionContainer } from "./SectionRadio.styled";

export const SectionRadio = ({
  currentSection,
  options,
  setCurrentWidget,
  setCurrentSection,
}: SectionRadioProps) => {
  const handleShowSection = useCallback(
    (section: string) => {
      setCurrentSection(section);
      // close any open widget.
      setCurrentWidget(null);
    },
    [setCurrentSection, setCurrentWidget],
  );

  return (
    <SectionContainer isDashboard={false}>
      <Radio
        value={currentSection ?? undefined}
        onChange={handleShowSection}
        options={options}
        optionNameFn={_.identity<string>}
        optionValueFn={_.identity<string>}
        optionKeyFn={_.identity<string>}
        variant="underlined"
      />
    </SectionContainer>
  );
};
