import { Box, Button, Icon } from "metabase/ui";
import type { ChartSettingSegmentedControlProps } from "metabase/viz-core";

import S from "./ChartSettingSegmentedControl.module.css";

export const ChartSettingSegmentedControl = ({
  options,
  onChange,
  value,
}: ChartSettingSegmentedControlProps) => (
  <Box className={S.root}>
    {options.map((elem) => (
      <Button
        className={S.item}
        px="xxs"
        variant={value === elem.value ? "filled" : "default"}
        key={elem.value}
        leftSection={elem.icon ? <Icon name={elem.icon} /> : undefined}
        onClick={() => onChange(elem.value)}
      >
        {elem.icon ? null : elem.name}
      </Button>
    ))}
  </Box>
);
