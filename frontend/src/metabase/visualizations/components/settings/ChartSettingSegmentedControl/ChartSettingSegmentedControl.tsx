import CS from "metabase/css/core/index.css";
import { Button, Center, Icon, type IconName } from "metabase/ui";

interface ChartSettingSegmentedControlProps {
  options: { name: string; value: string; icon?: IconName }[];
  onChange: (value: string) => void;
  value: string;
}

export const ChartSettingSegmentedControl = ({
  options,
  onChange,
  value,
}: ChartSettingSegmentedControlProps) => (
  <Button.Group>
    {options.map(elem => (
      <Button
        className={CS.borderBrand}
        fullWidth
        py="sm"
        variant={value === elem.value ? "filled" : "default"}
        key={elem.value}
        onClick={() => onChange(elem.value)}
      >
        <Center>
          {elem.icon ? <Icon name={elem.icon} size={16}></Icon> : elem.name}
        </Center>
      </Button>
    ))}
  </Button.Group>
);
