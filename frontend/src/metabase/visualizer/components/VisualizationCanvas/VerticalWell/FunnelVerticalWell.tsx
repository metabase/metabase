import { useDispatch, useSelector } from "metabase/lib/redux";
import { Text } from "metabase/ui";
import {
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { removeColumn } from "metabase/visualizer/visualizer.slice";

import { WellItem } from "../WellItem";

import { SimpleVerticalWell } from "./SimpleVerticalWell";

export function FunnelVerticalWell() {
  const settings = useSelector(getVisualizerComputedSettings);
  const columns = useSelector(getVisualizerDatasetColumns);
  const dispatch = useDispatch();

  const metric = columns.find(
    column => column.name === settings["funnel.metric"],
  );

  const handleRemoveMetric = () => {
    if (metric) {
      dispatch(removeColumn({ name: metric.name }));
    }
  };

  return (
    <SimpleVerticalWell hasValues={!!metric}>
      {!!metric && (
        <WellItem
          onRemove={handleRemoveMetric}
          style={{ position: "absolute", transform: "rotate(-90deg)" }}
        >
          <Text truncate>{metric.display_name}</Text>
        </WellItem>
      )}
    </SimpleVerticalWell>
  );
}
