import { t } from "ttag";

import { trackStackedSeriesEnabled } from "metabase/metrics-viewer/analytics";
import { ActionIcon, Flex, Icon, Tooltip } from "metabase/ui";

import S from "./ChartLayoutPicker.module.css";

type ChartLayoutPickerProps = {
  isStacked: boolean;
  onToggle: (stacked: boolean) => void;
};

export function ChartLayoutPicker({
  isStacked,
  onToggle,
}: ChartLayoutPickerProps) {
  return (
    <Flex
      gap="xs"
      bg="background-secondary"
      p="xs"
      bdrs="md"
      data-testid="chart-layout-picker"
    >
      <Tooltip label={t`Default layout`}>
        <ActionIcon
          w="2rem"
          variant={!isStacked ? "filled" : "subtle"}
          bg={!isStacked ? "background-primary" : undefined}
          onClick={() => onToggle(false)}
          aria-label={t`Default layout`}
          className={!isStacked ? S.selected : undefined}
        >
          <Icon
            name="chart_layout_default"
            c={!isStacked ? "brand" : "text-primary"}
          />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t`Stack layout`}>
        <ActionIcon
          w="2rem"
          variant={isStacked ? "filled" : "subtle"}
          bg={isStacked ? "background-primary" : undefined}
          onClick={() => {
            onToggle(true);
            trackStackedSeriesEnabled();
          }}
          aria-label={t`Stack layout`}
          className={isStacked ? S.selected : undefined}
        >
          <Icon
            name="chart_layout_stack"
            c={isStacked ? "brand" : "text-primary"}
          />
        </ActionIcon>
      </Tooltip>
    </Flex>
  );
}
