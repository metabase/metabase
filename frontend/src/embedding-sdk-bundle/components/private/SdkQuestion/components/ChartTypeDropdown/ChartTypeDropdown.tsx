import { useMemo } from "react";
import { t } from "ttag";

import type { IconName } from "metabase/embedding-sdk/types/icon";
import { isNotNull } from "metabase/lib/types";
import { Icon, Menu, type MenuProps } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { Visualization } from "metabase/visualizations/types";
import type { CardDisplayType } from "metabase-types/api";

import { useQuestionVisualization } from "../../hooks/use-question-visualization";
import { useSensibleVisualizations } from "../../hooks/use-sensible-visualizations";
import ToolbarButtonS from "../../styles/ToolbarButton.module.css";
import { ToolbarButton } from "../util/ToolbarButton";

/**
 * @expand
 * @category InteractiveQuestion
 */
export type ChartTypeDropdownProps = MenuProps;

/**
 * Dropdown for selecting the visualization type (bar chart, line chart, table, etc.).
 * Automatically updates to show recommended visualization types for the current data.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const ChartTypeDropdown = ({ ...menuProps }: ChartTypeDropdownProps) => {
  const { selectedVisualization, updateQuestionVisualization } =
    useQuestionVisualization();

  const { sensibleVisualizations, nonSensibleVisualizations } =
    useSensibleVisualizations();

  return (
    <ChartTypeDropdownInner
      selectedVisualization={selectedVisualization}
      updateQuestionVisualization={updateQuestionVisualization}
      sensibleVisualizations={sensibleVisualizations}
      nonSensibleVisualizations={nonSensibleVisualizations}
      {...menuProps}
    />
  );
};

interface ChartTypeDropdownInnerProps extends ChartTypeDropdownProps {
  selectedVisualization: CardDisplayType;
  updateQuestionVisualization: (display: CardDisplayType) => void;
  sensibleVisualizations: CardDisplayType[];
  nonSensibleVisualizations: CardDisplayType[];
}

/**
 * Exported for testing purposes
 * Renders a menu with a list of visualizations to choose from
 *
 * @internal
 * @param props ChartTypeDropdownInnerProps
 */
export const ChartTypeDropdownInner = (props: ChartTypeDropdownInnerProps) => {
  const {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
    ...menuProps
  } = props;

  const getVisualizationItems = (
    visualizationType: CardDisplayType,
  ): {
    value: CardDisplayType;
    label: ReturnType<Visualization["getUiName"]>;
    iconName: IconName;
  } | null => {
    const visualization = visualizations.get(visualizationType);
    if (!visualization) {
      return null;
    }

    return {
      value: visualizationType,
      label: visualization.getUiName(),
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

  const selectedElement = useMemo(
    () =>
      getVisualizationItems(selectedVisualization) ??
      sensibleItems[0] ??
      nonsensibleItems[0],
    [selectedVisualization, sensibleItems, nonsensibleItems],
  );

  return (
    <Menu position="bottom-start" {...menuProps}>
      <Menu.Target>
        <ToolbarButton
          data-testid="chart-type-selector-button"
          disabled={!selectedElement}
          label={selectedElement?.label}
          icon={selectedElement?.iconName}
          isHighlighted={false}
          variant="default"
          px={undefined}
          pr="md"
          rightSection={<Icon ml="xs" size={10} name="chevrondown" />}
          className={ToolbarButtonS.PrimaryToolbarButton}
        />
      </Menu.Target>
      {/* Using  overflow: "auto" because Menus have a default overflow: "visible" */}
      <Menu.Dropdown h="30rem" style={{ overflow: "auto" }}>
        {sensibleItems.map(({ iconName, label, value }, index) => (
          <Menu.Item
            key={`${value}/${index}`}
            onClick={() => updateQuestionVisualization(value)}
            leftSection={iconName ? <Icon name={iconName} /> : null}
          >
            {label}
          </Menu.Item>
        ))}

        <Menu.Label>{t`More charts`}</Menu.Label>
        {nonsensibleItems.map(({ iconName, label, value }, index) => (
          <Menu.Item
            key={`${value}/${index}`}
            onClick={() => updateQuestionVisualization(value)}
            leftSection={iconName ? <Icon name={iconName} /> : null}
          >
            {label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
