import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Box, Button, Center, Icon, type IconName, Text } from "metabase/ui";

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
  <Button.Group w="100%">
    {options.map(elem => (
      <Button
        className={cx(CS.borderBrand, CS.flexGrow1)}
        py="sm"
        px="xs"
        variant={value === elem.value ? "filled" : "default"}
        key={elem.value}
        onClick={() => onChange(elem.value)}
      >
        {elem.icon ? (
          <Center>
            <Icon name={elem.icon} size={16}></Icon>
          </Center>
        ) : (
          <Box>
            <Text inherit c="inherit" lh="normal">
              {elem.name}
            </Text>
          </Box>
        )}
      </Button>
    ))}
  </Button.Group>
);
