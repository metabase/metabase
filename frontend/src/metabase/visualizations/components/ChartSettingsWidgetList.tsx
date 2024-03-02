import _ from "underscore";

import ChartSettingsWidget from "./ChartSettingsWidget";
import {
  ChartSettingsWidgetListHeader,
  ChartSettingsWidgetListDivider,
} from "./ChartSettingsWidgetList.styled";

interface ChartSettingsWidgetListProps {
  widgets: { id: string; group?: string }[];
  extraWidgetProps: Record<string, unknown>;
}

const ChartSettingsWidgetList = ({
  widgets,
  extraWidgetProps,
}: ChartSettingsWidgetListProps) => {
  const widgetsAreGrouped = widgets.some(widget => widget.group);

  if (!widgetsAreGrouped) {
    return widgets.map(widget => (
      <ChartSettingsWidget key={widget.id} {...widget} {...extraWidgetProps} />
    ));
  } else {
    const groupedWidgets = widgets.reduce<Record<string, any[]>>(
      (memo, widget) => {
        const group = widget.group || "";
        (memo[group] = memo[group] || []).push(widget);
        return memo;
      },
      {},
    );

    return Object.keys(groupedWidgets).map((group, groupIndex, groups) => {
      const lastGroup = groupIndex === groups.length - 1;
      return (
        <div key={`group-${groupIndex}`}>
          {group && (
            <ChartSettingsWidgetListHeader>
              {group}
            </ChartSettingsWidgetListHeader>
          )}
          <div>
            {_.sortBy(groupedWidgets[group], "index").map(widget => (
              <ChartSettingsWidget
                key={widget.id}
                {...widget}
                {...extraWidgetProps}
              />
            ))}
            {!lastGroup && <ChartSettingsWidgetListDivider />}
          </div>
        </div>
      );
    });
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsWidgetList;
