import { ActionIcon, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./ChartSettingIconRadio.module.css";

interface ChartSettingIconRadioProps {
  value: string;
  onChange: (val: string | null) => void;
  options: { iconName: IconName; value: string }[];
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
      {options.map((option) => (
        <ActionIcon
          key={`radio-icon-${option.iconName}`}
          className={S.iconButton}
          variant={option.value === value ? "filled" : "default"}
          size="2rem"
          ml="sm"
          onClick={() => handleClick(option.value)}
        >
          <Icon name={option.iconName} />
        </ActionIcon>
      ))}
    </div>
  );
};
