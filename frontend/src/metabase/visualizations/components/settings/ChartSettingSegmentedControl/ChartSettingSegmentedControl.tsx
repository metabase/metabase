import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Box, Button, Center, Icon, Text } from "metabase/ui";
import type { ChartSettingSegmentedControlProps } from "metabase/viz-core";

export const ChartSettingSegmentedControl = ({
  options,
  onChange,
  value,
}: ChartSettingSegmentedControlProps) => (
  <Button.Group w="100%">
    {options.map((elem) => (
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
