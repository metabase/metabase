import { useState } from "react";

import { QuestionLoaderHOC } from "metabase/common/components/QuestionLoader";
import SelectButton from "metabase/common/components/SelectButton";
import { ParameterTargetList } from "metabase/parameters/components/ParameterTargetList";
import {
  getMappingOptionByTarget,
  getParameterMappingOptions,
} from "metabase/parameters/utils/mapping-options";
import { Popover } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { ParameterTarget } from "metabase-types/api";

type QuestionParameterTargetWidgetProps = {
  question: Question;
  target?: ParameterTarget | null;
  onChange: (target: ParameterTarget) => void;
  placeholder?: string;
};

function QuestionParameterTargetWidgetInner({
  question,
  target,
  onChange,
  placeholder,
}: QuestionParameterTargetWidgetProps) {
  const [opened, setOpened] = useState(false);

  const mappingOptions = question
    ? getParameterMappingOptions(question, null, question.card())
    : [];

  const disabled = mappingOptions.length === 0;
  const selected = getMappingOptionByTarget(mappingOptions, target, question);

  return (
    <Popover opened={opened} onChange={setOpened} disabled={disabled}>
      <Popover.Target>
        <SelectButton
          hasValue={!!selected}
          className="border-med"
          onClick={() => setOpened(!opened)}
          disabled={disabled}
        >
          {selected ? selected.name : placeholder}
        </SelectButton>
      </Popover.Target>
      <Popover.Dropdown>
        <ParameterTargetList
          onChange={(newTarget) => {
            onChange(newTarget);
            setOpened(false);
          }}
          mappingOptions={mappingOptions}
          selectedMappingOption={selected}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

export const QuestionParameterTargetWidget = QuestionLoaderHOC(
  QuestionParameterTargetWidgetInner,
);
