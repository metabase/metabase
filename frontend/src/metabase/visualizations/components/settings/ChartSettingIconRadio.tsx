import React, { useCallback } from "react";
import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

interface RadioIconProps {
  isSelected: boolean;
}

const RadioIcon = styled(Icon)<RadioIconProps>`
  margin-left: 1rem;
  cursor: pointer;

  ${props => props.isSelected && `color: ${color("brand")}`}
`;

interface ChartSettingIconRadioProps {
  value: string;
  onChange: (val: string | null) => void;
  options: { iconName: string; value: string }[];
}

export const ChartSettingIconRadio = ({
  value,
  options,
  onChange,
}: ChartSettingIconRadioProps) => {
  const handleClick = useCallback(
    option => {
      if (option.value == value) {
        onChange(null);
      } else {
        onChange(option.value);
      }
    },
    [value, onChange],
  );

  return (
    <div>
      {options.map(option => (
        <RadioIcon
          name={option.iconName}
          onClick={() => handleClick(option)}
          isSelected={option.value === value}
          key={`radio-icon-${option.iconName}`}
        />
      ))}
    </div>
  );
};
