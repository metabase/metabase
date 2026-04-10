import _ from "underscore";

import { Badge } from "metabase/ui";

import ChartSettingsWidget from "./ChartSettingsWidget";
import { ChartSettingsWidgetListDivider } from "./ChartSettingsWidgetList.styled";

interface ChartSettingsWidgetListProps {
  widgets: { id: string; group?: string }[];
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
            <Badge
              mb="lg"
              ml="lg"
              fz="0.75rem"
              px="0.5rem"
              tt="none"
              radius="xs"
              size="lg"
              c="text-primary"
            >
              {group}
            </Badge>
          )}
          <div>
            {_.sortBy(groupedWidgets[group], "index").map((widget) => (
              <ChartSettingsWidget
                key={widget.id}
                {...widget}
                {...extraWidgetProps}
              />
            ))}
            <ChartSettingsWidgetListDivider
              style={lastGroup ? { marginBottom: 0 } : undefined}
            />
          </div>
        </div>
      );
    });
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsWidgetList;
