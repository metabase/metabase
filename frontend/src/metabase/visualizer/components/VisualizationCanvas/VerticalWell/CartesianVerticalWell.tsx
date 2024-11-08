import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Flex, Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { getVisualizerDatasetColumns } from "metabase/visualizer/visualizer.slice";

import { WellItem } from "../WellItem";

import { SimpleVerticalWell } from "./SimpleVerticalWell";

interface CartesianVerticalWellProps {
  settings: ComputedVisualizationSettings;
}

export function CartesianVerticalWell({
  settings,
}: CartesianVerticalWellProps) {
  const columns = useSelector(getVisualizerDatasetColumns);

  const metrics = useMemo(() => {
    const metricNames = settings["graph.metrics"] ?? [];
    return metricNames
      .map(name => columns.find(column => column.name === name))
      .filter(isNotNull);
  }, [columns, settings]);

  return (
    <SimpleVerticalWell hasValues={metrics.length > 1}>
      <Flex
        align="center"
        justify="center"
        pos="relative"
        gap="sm"
        style={{ transform: "rotate(-90deg)" }}
      >
        {metrics.map(metric => (
          <WellItem key={metric.name}>
            <Text truncate>{metric.display_name}</Text>
          </WellItem>
        ))}
      </Flex>
    </SimpleVerticalWell>
  );
}
