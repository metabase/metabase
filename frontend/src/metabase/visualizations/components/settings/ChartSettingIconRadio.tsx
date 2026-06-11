import { Button, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

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
        <Button
          leftSection={<Icon name={option.iconName} />}
          ml="sm"
          onClick={() => handleClick(option.value)}
          variant={option.value === value ? "filled" : "default"}
          key={`radio-icon-${option.iconName}`}
        />
      ))}
    </div>
  );
};
