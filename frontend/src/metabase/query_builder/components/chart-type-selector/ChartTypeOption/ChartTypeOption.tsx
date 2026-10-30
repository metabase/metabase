import { t } from "ttag";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import {
  ActionIcon,
  Badge,
  Center,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import { visualizations } from "metabase/viz-core";
import type { VisualizationDisplay } from "metabase-types/api";

import ChartTypeOptionS from "./ChartTypeOption.module.css";

export type ChartTypeOptionProps = {
  onSelectVisualization: (display: VisualizationDisplay) => void;
  visualizationType: VisualizationDisplay;
  selectedVisualization: VisualizationDisplay;
  onOpenSettings?: () => void;
};

export const ChartTypeOption = ({
  visualizationType,
  selectedVisualization,
  onSelectVisualization,
  onOpenSettings,
}: ChartTypeOptionProps) => {
  const visualization = visualizations.get(visualizationType);
  const isSelected = selectedVisualization === visualizationType;

  const displayName = visualization?.getUiName() ?? visualizationType;
  const iconName = visualization?.iconName;

  return (
    <Center pos="relative" data-testid="chart-type-option">
      <Stack
        align="center"
        gap="xxs"
        role="option"
        aria-selected={isSelected}
        data-testid={`${displayName}-container`}
      >
        <ActionIcon
          variant="light"
          size="lg"
          radius="xl"
          aria-pressed={isSelected}
          selected={isSelected}
          onClick={() => {
            if (isSelected) {
              onOpenSettings?.();
            } else {
              onSelectVisualization(visualizationType);
            }
          }}
          className={ChartTypeOptionS.VisualizationButton}
          data-testid={`${displayName}-button`}
        >
          <EntityIcon
            name={iconName ?? "unknown"}
            iconUrl={visualization?.iconUrl}
            alt={displayName}
            color="inherit"
          />
        </ActionIcon>

        {isSelected && onOpenSettings && (
          <ActionIcon
            pos="absolute"
            top="-0.5rem"
            right="-0.6rem"
            radius="xl"
            className={ChartTypeOptionS.SettingsButton}
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
          color={isSelected ? "core-brand" : "text-secondary"}
          data-testid="chart-type-option-label"
        >
          {displayName}
        </Text>

        {visualization?.isDev && (
          <Tooltip
            label={t`This is a development version of the visualization`}
          >
            <Badge
              color="brand"
              size="sm"
              variant="outline"
              aria-label={t`This is a development version of the visualization`}
            >{t`Dev`}</Badge>
          </Tooltip>
        )}
      </Stack>
    </Center>
  );
};
