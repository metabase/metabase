import cx from "classnames";
import type { MouseEvent } from "react";

import CS from "metabase/css/core/index.css";
import { checkNotNull } from "metabase/lib/types";
import { ActionIcon, Center, Icon, Stack, Text } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { CardDisplayType } from "metabase-types/api";

import ChartTypeOptionS from "./ChartTypeOption.module.css";

export type ChartTypeOptionProps = {
  visualizationType: CardDisplayType;
  selectedVisualization: CardDisplayType;
  onClick: (vizType: CardDisplayType) => void;
};

export const ChartTypeOption = ({
  visualizationType,
  onClick,
  selectedVisualization,
}: ChartTypeOptionProps) => {
  const visualization = checkNotNull(visualizations.get(visualizationType));

  const isSelected = selectedVisualization === visualizationType;

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onClick(visualizationType);
  };

  return (
    <Center pos="relative" data-testid="chart-type-option">
      <Stack
        align="center"
        spacing="xs"
        role="option"
        aria-selected={isSelected}
        data-testid={`${visualization.uiName}-container`}
      >
        <ActionIcon
          w="3.125rem"
          h="3.125rem"
          radius="xl"
          onClick={handleClick}
          color="brand"
          data-is-selected={isSelected}
          variant={isSelected ? "filled" : "outline"}
          className={cx(
            CS.borderedImportant,
            ChartTypeOptionS.VisualizationButton,
          )}
          data-testid={`${visualization.uiName}-button`}
        >
          <Icon
            name={visualization.iconName}
            color={isSelected ? "white" : "brand"}
            size={20}
          />
        </ActionIcon>

        {isSelected && (
          <ActionIcon
            pos="absolute"
            top="-0.5rem"
            right="-0.6rem"
            radius="xl"
            color="text-light"
            variant="viewHeader"
            bg="white"
            className={cx(
              CS.borderedImportant,
              ChartTypeOptionS.SettingsButton,
            )}
            onClick={handleClick}
          >
            <Icon name="gear" size={16} />
          </ActionIcon>
        )}

        <Text
          lh="unset"
          align="center"
          fw="bold"
          fz="sm"
          color={isSelected ? "brand" : "text-medium"}
          data-testid="chart-type-option-label"
        >
          {visualization.uiName}
        </Text>
      </Stack>
    </Center>
  );
};
