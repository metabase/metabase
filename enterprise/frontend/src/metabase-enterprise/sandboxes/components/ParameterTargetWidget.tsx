import cx from "classnames";
import { type ReactNode, useState } from "react";

import { SelectButton } from "metabase/common/components/SelectButton";
import { useCaptureEvent } from "metabase/common/hooks";
import { ParameterTargetList } from "metabase/parameters/components/ParameterTargetList";
import {
  type ParameterMappingOption,
  getMappingOptionByTarget,
} from "metabase/parameters/utils/mapping-options";
import { Box, Popover } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { ParameterTarget } from "metabase-types/api";

type TriggerRenderProps = {
  selected?: ParameterMappingOption;
  disabled: boolean;
  placeholder?: string;
};

type ParameterTargetWidgetProps = {
  question?: Question;
  target?: ParameterTarget | null;
  onChange: (target: ParameterTarget) => void;
  mappingOptions: ParameterMappingOption[];
  placeholder?: string;
  children?: ReactNode | ((props: TriggerRenderProps) => ReactNode);
};

const defaultChildren = ({ selected, placeholder }: TriggerRenderProps) => (
  <SelectButton hasValue={!!selected} className="border-med">
    {selected ? selected.name : placeholder || "Select a target"}
  </SelectButton>
);

export function ParameterTargetWidget({
  question,
  target,
  onChange,
  mappingOptions,
  placeholder,
  children = defaultChildren,
}: ParameterTargetWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  useCaptureEvent(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setIsOpen(false);
      }
    },
    { enabled: isOpen },
  );

  const disabled = mappingOptions.length === 0;
  const selected = getMappingOptionByTarget(mappingOptions, target, question);

  const triggerElement =
    typeof children === "function"
      ? children({ selected, disabled, placeholder })
      : children;

  return (
    <Popover
      withinPortal={false}
      position="bottom-start"
      closeOnClickOutside
      trapFocus
      disabled={disabled}
      opened={isOpen}
      onChange={setIsOpen}
    >
      <Popover.Target>
        <Box className={cx({ disabled })} onClick={() => setIsOpen((v) => !v)}>
          {triggerElement}
        </Box>
      </Popover.Target>
      <Popover.Dropdown style={{ boxSizing: "content-box" }}>
        <ParameterTargetList
          onChange={(target) => {
            onChange(target);
            setIsOpen(false);
          }}
          mappingOptions={mappingOptions}
          selectedMappingOption={selected}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
