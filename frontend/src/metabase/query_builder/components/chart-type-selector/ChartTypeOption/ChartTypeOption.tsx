import cx from "classnames";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { ActionIcon, Center, Icon, Stack, Text } from "metabase/ui";
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
  const IconComponent = visualization?.IconComponent;
  const hasUrlIcon = !!(visualization?.iconUrl || visualization?.iconDarkUrl);
  // A themeable IconComponent already responds to `color`, so the selected-
  // state `brightness(0) invert(1)` hack only applies to the URL-based path.
  const needsSelectedImgFilter = hasUrlIcon && !IconComponent;

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
            iconDarkUrl={visualization?.iconDarkUrl}
            IconComponent={IconComponent}
            alt={displayName}
            color={isSelected ? "white" : "brand"}
            c={isSelected ? "white" : "brand"}
            size={20}
            style={
              needsSelectedImgFilter && isSelected
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
      </Stack>
    </Center>
  );
};
