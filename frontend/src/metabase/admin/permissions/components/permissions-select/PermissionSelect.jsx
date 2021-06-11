import React from "react";
import PropTypes from "prop-types";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Toggle from "metabase/components/Toggle";
import { PermissionSelectOption } from "./PermissionSelectOption";

import {
  PermissionSelectRoot,
  OptionsList,
  OptionsListItem,
  ToggleContainer,
  ToggleLabel,
} from "./PermissionSelect.styled";

const propTypes = {
  options: PropTypes.arrayOf(PropTypes.object).isRequired,
  value: PropTypes.string.isRequired,
  toggle: PropTypes.shape({
    label: PropTypes.string.isRequired,
    value: PropTypes.bool.isRequired,
  }),
  onChange: PropTypes.func.isRequired,
  onToggleChange: PropTypes.func,
};

export function PermissionSelect({
  options,
  value,
  toggle,
  onChange,
  onToggleChange,
}) {
  const selected = options.find(option => option.value === value);
  const unselectedOptions = options.filter(option => option !== selected);

  const selectedValue = (
    <PermissionSelectRoot>
      <PermissionSelectOption {...selected} />
      <Icon name="chevrondown" size={12} color={colors["text-light"]} />
    </PermissionSelectRoot>
  );

  return (
    <PopoverWithTrigger
      triggerElement={selectedValue}
      targetOffsetX={16}
      targetOffsetY={8}
    >
      <OptionsList role="listbox">
        {unselectedOptions.map(option => (
          <OptionsListItem
            role="option"
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            <PermissionSelectOption {...option} />
          </OptionsListItem>
        ))}
      </OptionsList>
      {toggle && (
        <ToggleContainer>
          <ToggleLabel>{toggle.label}</ToggleLabel>
          <Toggle small value={toggle.value} onChange={onToggleChange} />
        </ToggleContainer>
      )}
    </PopoverWithTrigger>
  );
}

PermissionSelect.propTypes = propTypes;
