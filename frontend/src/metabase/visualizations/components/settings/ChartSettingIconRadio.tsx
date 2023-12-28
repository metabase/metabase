import { IconButton } from "./ChartSettingIconRadio.styled";

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
        <IconButton
          icon={option.iconName}
          onClick={() => handleClick(option.value)}
          primary={option.value === value}
          key={`radio-icon-${option.iconName}`}
        />
      ))}
    </div>
  );
};
