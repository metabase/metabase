import React from "react";
import _ from "underscore";
import ChartSettingsWidget from "./ChartSettingsWidget";

import {
  ChartSettingsWidgetListHeader,
  ChartSettingsWidgetListContainer,
} from "./ChartSettingsWidgetList.styled";

interface ChartSettingsWidgetListProps {
  widgets: { id: string; group?: string }[];
  extraWidgetProps: {};
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
    const groupedWidgets = widgets.reduce<{ [key: string]: any[] }>(
      (memo, widget) => {
        const group = widget.group || "";
        (memo[group] = memo[group] || []).push(widget);
        return memo;
      },
      {},
    );

    return Object.keys(groupedWidgets).map(group => {
      return (
        <div>
          {group && (
            <ChartSettingsWidgetListHeader>
              {group}
            </ChartSettingsWidgetListHeader>
          )}
          <ChartSettingsWidgetListContainer>
            {_.sortBy(groupedWidgets[group], "index").map(widget => (
              <ChartSettingsWidget
                key={widget.id}
                {...widget}
                {...extraWidgetProps}
              />
            ))}
          </ChartSettingsWidgetListContainer>
        </div>
      );
    });
  }
};

export default ChartSettingsWidgetList;
