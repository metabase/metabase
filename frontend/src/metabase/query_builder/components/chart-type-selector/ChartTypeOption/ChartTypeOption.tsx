import cx from "classnames";

import { checkNotNull } from "metabase/lib/types";
import { ActionIcon, Center, Icon, Stack, Text } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { CardDisplayType } from "metabase-types/api";

import ChartTypeOptionS from "./ChartTypeOption.module.css";

export type ChartTypeOptionProps = {
  onSelectVisualization: (display: CardDisplayType) => void;
  visualizationType: CardDisplayType;
  selectedVisualization: CardDisplayType;
  onOpenSettings?: () => void;
};

export const ChartTypeOption = ({
  visualizationType,
  selectedVisualization,
  onSelectVisualization,
  onOpenSettings,
}: ChartTypeOptionProps) => {
  const visualization = checkNotNull(visualizations.get(visualizationType));
  const isSelected = selectedVisualization === visualizationType;

  return (
    <Center pos="relative" data-testid="chart-type-option">
      <Stack
        align="center"
        gap="xs"
        role="option"
        aria-selected={isSelected}
        data-testid={`${visualization.getUiName()}-container`}
      >
        <ActionIcon
          w="3.125rem"
          h="3.125rem"
          radius="xl"
          onClick={() => {
            if (isSelected) {
              onOpenSettings?.();
            } else {
              onSelectVisualization(visualizationType);
            }
          }}
          color="brand"
          data-is-selected={isSelected}
          variant={isSelected ? "filled" : "outline"}
          className={cx(
            ChartTypeOptionS.BorderedButton,
            ChartTypeOptionS.VisualizationButton,
          )}
          data-testid={`${visualization.getUiName()}-button`}
        >
          <Icon
            name={visualization.iconName}
            c={isSelected ? "white" : "brand"}
            size={20}
          />
        </ActionIcon>

        {isSelected && onOpenSettings && (
          <ActionIcon
            pos="absolute"
            top="-0.5rem"
            right="-0.6rem"
            radius="xl"
            color="text-tertiary"
            variant="viewHeader"
            bg="background-primary"
            className={cx(
              ChartTypeOptionS.BorderedButton,
              ChartTypeOptionS.SettingsButton,
            )}
            onClick={() => onOpenSettings?.()}
          >
            <Icon name="gear" size={16} />
          </ActionIcon>
        )}

        <Text
          lh="unset"
          ta="center"
          fw="bold"
          fz="sm"
          color={isSelected ? "brand" : "text-secondary"}
          data-testid="chart-type-option-label"
        >
          {visualization.getUiName()}
        </Text>
      </Stack>
    </Center>
  );
};
