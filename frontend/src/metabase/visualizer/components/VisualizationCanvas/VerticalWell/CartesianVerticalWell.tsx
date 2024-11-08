import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Text } from "metabase/ui";
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
      {metrics.map(metric => (
        <WellItem
          key={metric.name}
          style={{ position: "absolute", transform: "rotate(-90deg)" }}
        >
          <Text truncate>{metric.display_name}</Text>
        </WellItem>
      ))}
    </SimpleVerticalWell>
  );
}
