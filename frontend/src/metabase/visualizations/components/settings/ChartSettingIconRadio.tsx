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

export const ChartSettingIconRadio = ({ value, options, onChange }) => {
  return (
    <div>
      {options.map(option => (
        <RadioIcon
          name={option.name}
          onClick={() => onChange(option.value)}
          isSelected={option.value === value}
        />
      ))}
    </div>
  );
};
