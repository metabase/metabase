import cx from "classnames";
import type { ReactNode } from "react";
import { useState } from "react";

import { QuestionLoaderHOC } from "metabase/common/components/QuestionLoader";
import SelectButton from "metabase/common/components/SelectButton";
import { ParameterTargetList } from "metabase/parameters/components/ParameterTargetList";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import {
  getMappingOptionByTarget,
  getParameterMappingOptions,
} from "metabase/parameters/utils/mapping-options";
import { Popover, UnstyledButton } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { ParameterTarget } from "metabase-types/api";

type ChildrenRenderProps = {
  selected: ParameterMappingOption | undefined;
  disabled: boolean;
  placeholder?: string;
};

type QuestionParameterTargetWidgetProps = {
  question: Question;
  target?: ParameterTarget | null;
  onChange: (target: ParameterTarget) => void;
  placeholder?: string;
  children?: ((props: ChildrenRenderProps) => ReactNode) | ReactNode;
};

const defaultChildren = ({ selected, placeholder }: ChildrenRenderProps) => (
  <SelectButton hasValue={!!selected} className="border-med">
    {selected ? selected.name : placeholder || "Select a target"}
  </SelectButton>
);

function QuestionParameterTargetWidgetInner({
  question,
  target,
  onChange,
  placeholder,
  children = defaultChildren,
}: QuestionParameterTargetWidgetProps) {
  const [opened, setOpened] = useState(false);

  const mappingOptions = question
    ? getParameterMappingOptions(question, null, question.card())
    : [];

  const disabled = mappingOptions.length === 0;
  const selected = getMappingOptionByTarget(mappingOptions, target, question);

  const triggerElement =
    typeof children === "function"
      ? children({ selected, disabled, placeholder })
      : children;

  return (
    <Popover opened={opened} onChange={setOpened} disabled={disabled}>
      <Popover.Target>
        <UnstyledButton
          onClick={() => setOpened(!opened)}
          disabled={disabled}
          className={cx({ disabled })}
        >
          {triggerElement}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <ParameterTargetList
          onChange={(target) => {
            onChange(target);
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
