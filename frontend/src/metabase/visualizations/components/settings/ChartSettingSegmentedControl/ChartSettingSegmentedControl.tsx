import CS from "metabase/css/core/index.css";
import { Button, Center, Icon, type IconName, Stack, Text } from "metabase/ui";

interface ChartSettingSegmentedControlProps {
  options: { name: string; value: string; icon?: IconName }[];
  onChange: (value: string) => void;
  value: string;
  title: string;
}

export const ChartSettingSegmentedControl = ({
  title,
  options,
  onChange,
  value,
}: ChartSettingSegmentedControlProps) => (
  <Stack spacing="xs">
    <Text fw="bold">{title}</Text>
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
  </Stack>
);
