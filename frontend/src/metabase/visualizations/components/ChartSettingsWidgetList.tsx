import { sortBy } from "es-toolkit";

import { Badge, Box } from "metabase/ui";

import ChartSettingsWidget from "./ChartSettingsWidget";

interface ChartSettingsWidgetListProps {
  widgets: { id: string; group?: string; index?: number }[];
  extraWidgetProps: Record<string, unknown>;
}

const ChartSettingsWidgetList = ({
  widgets,
  extraWidgetProps,
}: ChartSettingsWidgetListProps) => {
  const widgetsAreGrouped = widgets.some((widget) => widget.group);

  if (!widgetsAreGrouped) {
    return widgets.map((widget) => (
      <ChartSettingsWidget key={widget.id} {...widget} {...extraWidgetProps} />
    ));
  } else {
    const groupedWidgets = widgets.reduce<
      Record<string, ChartSettingsWidgetListProps["widgets"]>
    >((memo, widget) => {
      const group = widget.group || "";
      (memo[group] = memo[group] || []).push(widget);
      return memo;
    }, {});

    return Object.keys(groupedWidgets).map((group, groupIndex, groups) => {
      const lastGroup = groupIndex === groups.length - 1;
      return (
        <div key={`group-${groupIndex}`}>
          {group && (
            <Badge color="brand" mb="xl" ml="xl" size="sm" variant="light">
              {group}
            </Badge>
          )}
          <div>
            {sortBy(groupedWidgets[group], ["index"]).map((widget) => (
              <ChartSettingsWidget
                key={widget.id}
                {...widget}
                {...extraWidgetProps}
              />
            ))}
            <Box h={1} bg="border-neutral" mb={lastGroup ? 0 : "xl"} />
          </div>
        </div>
      );
    });
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsWidgetList;
