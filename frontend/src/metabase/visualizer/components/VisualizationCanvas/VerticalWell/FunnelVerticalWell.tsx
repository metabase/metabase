import { useSelector } from "metabase/lib/redux";
import { Text } from "metabase/ui";
import {
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";

import { WellItem } from "../WellItem";

import { SimpleVerticalWell } from "./SimpleVerticalWell";

export function FunnelVerticalWell() {
  const settings = useSelector(getVisualizerComputedSettings);
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
