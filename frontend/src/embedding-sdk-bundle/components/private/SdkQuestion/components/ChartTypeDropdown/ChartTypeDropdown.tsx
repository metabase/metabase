import { useMemo } from "react";
import { t } from "ttag";

import type { IconName } from "metabase/embedding-sdk/types/icon";
import { isNotNull } from "metabase/lib/types";
import { Combobox, Flex, Icon, Text, useCombobox } from "metabase/ui";
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
export interface ChartTypeDropdownProps {
  opened?: boolean;
  defaultOpened?: boolean;
  onOpenChange?: (opened: boolean) => void;
}

/**
 * Dropdown for selecting the visualization type (bar chart, line chart, table, etc.).
 * Automatically updates to show recommended visualization types for the current data.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const ChartTypeDropdown = (props: ChartTypeDropdownProps) => {
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
      {...props}
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
 * Renders a combobox with a list of visualizations to choose from
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
    opened,
    defaultOpened,
    onOpenChange,
  } = props;

  const combobox = useCombobox({
    opened,
    defaultOpened,
    onDropdownOpen: () => onOpenChange?.(true),
    onDropdownClose: () => {
      onOpenChange?.(false);
      combobox.resetSelectedOption();
    },
  });

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
    <Combobox
      store={combobox}
      position="bottom-start"
      onOptionSubmit={(value) => {
        updateQuestionVisualization(value as CardDisplayType);
        combobox.closeDropdown();
      }}
    >
      <Combobox.DropdownTarget>
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
          onClick={() => combobox.toggleDropdown()}
        />
      </Combobox.DropdownTarget>
      <Combobox.Dropdown miw={200}>
        <Combobox.Options mah="30rem">
          {sensibleItems.map((item, index) => (
            <Option
              key={index}
              selected={item.value === selectedVisualization}
              {...item}
            />
          ))}
          <Text
            c="text-tertiary"
            size="sm"
            py="xs"
            px="sm"
          >{t`More charts`}</Text>
          {nonsensibleItems.map((item, index) => (
            <Option
              key={index}
              selected={item.value === selectedVisualization}
              {...item}
            />
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
};

interface OptionProps {
  value: CardDisplayType;
  label: ReturnType<Visualization["getUiName"]>;
  iconName: IconName;
  selected: boolean;
}

function Option(props: OptionProps) {
  const { value, selected, iconName, label } = props;

  return (
    <Combobox.Option px="sm" py="xs" value={value} selected={selected}>
      <Flex align="center" gap="sm">
        {iconName ? <Icon name={iconName} flex="0 0 1rem" /> : null}
        <Text c="inherit" style={{ whiteSpace: "nowrap" }}>
          {label}
        </Text>
      </Flex>
    </Combobox.Option>
  );
}
