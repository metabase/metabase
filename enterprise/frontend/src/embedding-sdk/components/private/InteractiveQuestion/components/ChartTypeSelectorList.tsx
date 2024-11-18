import { useMemo } from "react";

import { useQuestionVisualization } from "embedding-sdk/components/private/InteractiveQuestion/hooks/use-question-visualization";
import { Button, Icon, Menu, Text } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { CardDisplayType } from "metabase-types/api";

import { useSensibleVisualizations } from "../hooks/use-sensible-visualizations";

export const ChartTypeSelectorList = () => {
  const { selectedVisualization, updateQuestionVisualization } =
    useQuestionVisualization();

  const { sensibleVisualizations, nonSensibleVisualizations } =
    useSensibleVisualizations();

  const getVisualizationItems = (visualizationType: CardDisplayType) => {
    const visualization = visualizations.get(visualizationType);
    return {
      value: visualizationType,
      label: visualization?.uiName,
      iconName: visualization?.iconName,
    };
  };

  const sensibleItems = useMemo(
    () => sensibleVisualizations.map(getVisualizationItems),
    [sensibleVisualizations],
  );
  const nonsensibleItems = useMemo(
    () => nonSensibleVisualizations.map(getVisualizationItems),
    [nonSensibleVisualizations],
  );

  const selectedElem = useMemo(
    () => getVisualizationItems(selectedVisualization),
    [selectedVisualization],
  );

  return (
    <Menu>
      <Menu.Target>
        <Button
          variant="default"
          leftIcon={
            selectedElem?.iconName && <Icon name={selectedElem.iconName} />
          }
          py="xs"
          px="md"
        >
          {selectedElem.label && <Text>{selectedElem.label}</Text>}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Sensible</Menu.Label>
        {sensibleItems.map(({ iconName, label, value }, index) => (
          <Menu.Item
            key={`${value}/${index}`}
            onClick={() => updateQuestionVisualization(value)}
            icon={iconName ? <Icon name={iconName} /> : null}
          >
            {label}
          </Menu.Item>
        ))}

        <Menu.Label>Nonsensible</Menu.Label>
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
