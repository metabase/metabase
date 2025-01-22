import { useMemo } from "react";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import { Icon, Menu } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { Visualization } from "metabase/visualizations/types";
import type { CardDisplayType } from "metabase-types/api";

import { useQuestionVisualization } from "../../hooks/use-question-visualization";
import { useSensibleVisualizations } from "../../hooks/use-sensible-visualizations";
import { ToolbarButton } from "../util/ToolbarButton";

export const ChartTypeDropdown = () => {
  const { selectedVisualization, updateQuestionVisualization } =
    useQuestionVisualization();

  const { sensibleVisualizations, nonSensibleVisualizations } =
    useSensibleVisualizations();

  const getVisualizationItems = (
    visualizationType: CardDisplayType,
  ): {
    value: CardDisplayType;
    label: Visualization["uiName"];
    iconName: Visualization["iconName"];
  } | null => {
    const visualization = visualizations.get(visualizationType);
    if (!visualization) {
      return null;
    }

    return {
      value: visualizationType,
      label: visualization.uiName,
      iconName: visualization.iconName,
    };
  };

  const sensibleItems = useMemo(
    () => sensibleVisualizations.map(getVisualizationItems).filter(isNotNull),
    [sensibleVisualizations],
  );
  const nonsensibleItems = useMemo(
    () =>
      nonSensibleVisualizations.map(getVisualizationItems).filter(isNotNull),
    [nonSensibleVisualizations],
  );

  const selectedElem = useMemo(
    () =>
      getVisualizationItems(selectedVisualization) ??
      sensibleItems[0] ??
      nonsensibleItems[0],
    [selectedVisualization, sensibleItems, nonsensibleItems],
  );

  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <ToolbarButton
          data-testid="chart-type-selector-button"
          label={selectedElem.label}
          icon={selectedElem.iconName}
          isHighlighted={false}
          variant="default"
          px={undefined}
          pr="md"
          rightIcon={<Icon ml="xs" size={10} name="chevrondown" />}
        />
      </Menu.Target>
      <Menu.Dropdown h="30rem">
        {sensibleItems.map(({ iconName, label, value }, index) => (
          <Menu.Item
            key={`${value}/${index}`}
            onClick={() => updateQuestionVisualization(value)}
            icon={iconName ? <Icon name={iconName} /> : null}
          >
            {label}
          </Menu.Item>
        ))}

        <Menu.Label>{t`Other charts`}</Menu.Label>
        {nonsensibleItems.map(({ iconName, label, value }, index) => (
          <Menu.Item
            key={`${value}/${index}`}
            onClick={() => updateQuestionVisualization(value)}
            icon={iconName ? <Icon name={iconName} /> : null}
          >
            {label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
