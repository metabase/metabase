import cx from "classnames";
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
import visualizations from "metabase/visualizations";
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
  const hasCustomIcon = !!visualization?.iconUrl;

  return (
    <Center pos="relative" data-testid="chart-type-option">
      <Stack
        align="center"
        gap="xs"
        role="option"
        aria-selected={isSelected}
        data-testid={`${displayName}-container`}
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
          data-testid={`${displayName}-button`}
        >
          <EntityIcon
            name={iconName ?? "unknown"}
            iconUrl={visualization?.iconUrl}
            alt={displayName}
            color={isSelected ? "white" : "brand"}
            size={20}
            style={
              hasCustomIcon && isSelected
                ? { filter: "brightness(0) invert(1)" }
                : undefined
            }
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
          {displayName}
        </Text>

        {visualization?.isDev && (
          <Tooltip
            label={t`This is a development version of the visualization`}
          >
            <Badge variant="outline">{t`dev`}</Badge>
          </Tooltip>
        )}
      </Stack>
    </Center>
  );
};
