/* eslint-disable react/prop-types */
import cx from "classnames";
import { useState } from "react";

import { SelectButton } from "metabase/common/components/SelectButton";
import { useCaptureEvent } from "metabase/common/hooks";
import { ParameterTargetList } from "metabase/parameters/components/ParameterTargetList";
import { getMappingOptionByTarget } from "metabase/parameters/utils/mapping-options";
import { Box, Popover } from "metabase/ui";

const defaultChildren = ({ selected, placeholder }) => (
  <SelectButton hasValue={!!selected} className="border-med">
    {selected ? selected.name : placeholder || "Select a target"}
  </SelectButton>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function ParameterTargetWidget({
  question,
  target,
  onChange,
  mappingOptions,
  placeholder,
  children = defaultChildren,
}) {
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
        <Box className={cx({ disabled })} onClick={() => setIsOpen(!isOpen)}>
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
