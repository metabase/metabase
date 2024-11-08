import { useSelector } from "metabase/lib/redux";
import { Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { getVisualizerDatasetColumns } from "metabase/visualizer/visualizer.slice";

import { WellItem } from "../WellItem";

import { SimpleVerticalWell } from "./SimpleVerticalWell";

interface FunnelVerticalWellProps {
  settings: ComputedVisualizationSettings;
}

export function FunnelVerticalWell({ settings }: FunnelVerticalWellProps) {
  const columns = useSelector(getVisualizerDatasetColumns);

  const metric = columns.find(
    column => column.name === settings["funnel.metric"],
  );

  return (
    <SimpleVerticalWell hasValues={!!metric}>
      {!!metric && (
        <WellItem style={{ position: "absolute", transform: "rotate(-90deg)" }}>
          <Text truncate>{metric.display_name}</Text>
        </WellItem>
      )}
    </SimpleVerticalWell>
  );
}
