import { useDisclosure } from "@mantine/hooks";

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
  placeholder: string;
};

function QuestionParameterTargetWidgetInner({
  question,
  target,
  onChange,
  placeholder,
}: QuestionParameterTargetWidgetProps) {
  const mappingOptions = question
    ? getParameterMappingOptions(question, null, question.card())
    : [];

  const disabled = mappingOptions.length === 0;
  const selected = getMappingOptionByTarget(mappingOptions, target, question);

  const [opened, { close, toggle }] = useDisclosure(false);

  return (
    <Popover opened={opened} onDismiss={close} disabled={disabled}>
      <Popover.Target>
        <SelectButton
          hasValue={!!selected}
          className="border-med"
          onClick={toggle}
          disabled={disabled}
        >
          {selected ? selected.name : placeholder}
        </SelectButton>
      </Popover.Target>
      <Popover.Dropdown>
        <ParameterTargetList
          onChange={(newTarget) => {
            onChange(newTarget);
            close();
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
