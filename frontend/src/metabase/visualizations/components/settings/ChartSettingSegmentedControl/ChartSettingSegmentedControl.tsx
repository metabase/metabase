import CS from "metabase/css/core/index.css";
import { Button } from "metabase/ui";

interface ChartSettingSegmentedControlProps {
  options: { name: string; value: string }[];
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
        {elem.name}
      </Button>
    ))}
  </Button.Group>
);
