import React from "react";
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
  onChange: (val: string) => void;
  options: { iconName: string; value: string }[];
}

export const ChartSettingIconRadio = ({
  value,
  options,
  onChange,
}: ChartSettingIconRadioProps) => {
  return (
    <div>
      {options.map(option => (
        <RadioIcon
          name={option.iconName}
          onClick={() => onChange(option.value)}
          isSelected={option.value === value}
          key={`radio-icon-${option.iconName}`}
        />
      ))}
    </div>
  );
};
