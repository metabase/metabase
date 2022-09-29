import React from "react";
import { RadioIcon } from "./ChartSettingIconRadio.styled";

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
  const handleClick = (newValue: string) => {
    if (newValue === value) {
      onChange(null);
    } else {
      onChange(newValue);
    }
  };

  return (
    <div>
      {options.map(option => (
        <RadioIcon
          name={option.iconName}
          onClick={() => handleClick(option.value)}
          isSelected={option.value === value}
          key={`radio-icon-${option.iconName}`}
        />
      ))}
    </div>
  );
};
