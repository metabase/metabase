import { checkNotNull } from "metabase/lib/types";
import { Icon } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { CardDisplayType } from "metabase-types/api";

import {
  OptionIconContainer,
  OptionRoot,
  OptionText,
  SettingsButton,
} from "./ChartTypeOption.styled";

export type ChartTypeOptionProps = {
  onSelectVisualization: (display: CardDisplayType) => void;
  visualizationType: CardDisplayType;
  selectedVisualization: CardDisplayType;
};

export const ChartTypeOption = ({
  visualizationType,
  selectedVisualization,
  onSelectVisualization,
}: ChartTypeOptionProps) => {
  const visualization = checkNotNull(visualizations.get(visualizationType));
  const isSelected = selectedVisualization === visualizationType;
  return (
    <OptionRoot
      isSelected={isSelected}
      data-testid={`${visualization.uiName}-container`}
      role="option"
      aria-selected={isSelected}
    >
      <OptionIconContainer
        onClick={() => onSelectVisualization(visualizationType)}
        data-testid={`${visualization.uiName}-button`}
      >
        <Icon name={visualization.iconName} size={20} />
        {isSelected && (
          <SettingsButton
            onlyIcon
            icon="gear"
            iconSize={16}
            onClick={() => onSelectVisualization(visualizationType)}
          />
        )}
      </OptionIconContainer>
      <OptionText data-testid="chart-type-option-label">
        {visualization.uiName}
      </OptionText>
    </OptionRoot>
  );
};
