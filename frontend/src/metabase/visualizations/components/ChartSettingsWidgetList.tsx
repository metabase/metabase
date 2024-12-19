import _ from "underscore";

import { Divider, Stack, Text } from "metabase/ui";

import ChartSettingsWidget from "./ChartSettingsWidget";

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
    return (
      <Stack px="lg">
        {widgets.map(widget => (
          <Stack key={widget.id}>
            <ChartSettingsWidget
              key={widget.id}
              {...widget}
              {...extraWidgetProps}
            />
          </Stack>
        ))}
      </Stack>
    );
  } else {
    const groupedWidgets = widgets.reduce<Record<string, any[]>>(
      (memo, widget) => {
        const group = widget.group || "";
        (memo[group] = memo[group] || []).push(widget);
        return memo;
      },
      {},
    );

    return (
      <Stack px="lg">
        {Object.keys(groupedWidgets).map((group, groupIndex, groups) => {
          const lastGroup = groupIndex === groups.length - 1;
          return (
            <Stack key={`group-${groupIndex}`}>
              {group && (
                <Text c="text-medium" tt="uppercase" fw="bold">
                  {group}
                </Text>
              )}
              <Stack>
                {_.sortBy(groupedWidgets[group], "index").map(widget => (
                  <Stack key={widget.id}>
                    <ChartSettingsWidget
                      key={widget.id}
                      {...widget}
                      {...extraWidgetProps}
                    />
                  </Stack>
                ))}
                {!lastGroup && <Divider />}
              </Stack>
            </Stack>
          );
        })}
      </Stack>
    );
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsWidgetList;
