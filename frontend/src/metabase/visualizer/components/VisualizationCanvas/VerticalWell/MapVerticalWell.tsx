import { useDroppable } from "@dnd-kit/core";
import { type ReactNode, forwardRef, useCallback, useMemo } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Stack, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { isDraggedColumnItem } from "metabase/visualizer/utils";
import { removeColumn } from "metabase/visualizer/visualizer.slice";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";

import { WellItem } from "../WellItem";

export function MapVerticalWell() {
  const settings = useSelector(getVisualizerComputedSettings);
  const mapType = settings["map.type"];

  switch (mapType) {
    case "region":
      return (
        <Box>
          <MapMetricWell />
          <MapDimensionWell
            settingsKey="map.dimension"
            droppableId={DROPPABLE_ID.MAP_DIMENSION}
            label={t`Map region`}
            placeholder={t`Drop your map Dimension here`}
          />
        </Box>
      );
    case "pin":
      return (
        <Box>
          <MapDimensionWell
            settingsKey="map.latitude_column"
            droppableId={DROPPABLE_ID.MAP_LATITUDE}
            label={t`Latitude`}
            placeholder={t`Drop your Latitude Dimension here`}
          />
          <MapDimensionWell
            settingsKey="map.longitude_column"
            droppableId={DROPPABLE_ID.MAP_LONGITUDE}
            label={t`Latitude`}
            placeholder={t`Drop your Longitude Dimension here`}
          />
        </Box>
      );
    case "grid":
      return (
        <Box>
          <MapMetricWell />
          <MapDimensionWell
            settingsKey="map.latitude_column"
            droppableId={DROPPABLE_ID.MAP_LATITUDE}
            label={t`Latitude`}
            placeholder={t`Drop your Latitude Dimension here`}
          />
          <MapDimensionWell
            settingsKey="map.longitude_column"
            droppableId={DROPPABLE_ID.MAP_LONGITUDE}
            label={t`Latitude`}
            placeholder={t`Drop your Longitude Dimension here`}
          />
        </Box>
      );
    default:
      return null;
  }
}

function MapMetricWell() {
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const { active, isOver, setNodeRef } = useDroppable({
    id: DROPPABLE_ID.MAP_METRIC,
  });

  const isHighlighted = useMemo(() => {
    if (!active || !isDraggedColumnItem(active)) {
      return false;
    }
    const { column } = active.data.current;
    return isMetric(column);
  }, [active]);

  const metricColumnName = settings["map.metric_column"];

  const metric = useMemo(
    () => columns.find(col => col.name === metricColumnName),
    [metricColumnName, columns],
  );

  const handleRemoveMetric = useCallback(() => {
    if (metric) {
      dispatch(removeColumn({ name: metric.name }));
    }
  }, [metric, dispatch]);

  return (
    <Box mt="lg">
      <Text>{t`Map metric`}</Text>
      <WellBox isHighlighted={isHighlighted} isOver={isOver} ref={setNodeRef}>
        <Stack>
          <WellItem onRemove={metric && handleRemoveMetric}>
            <Ellipsified>
              {metric?.display_name ?? t`Drop your map Metric here`}
            </Ellipsified>
          </WellItem>
        </Stack>
      </WellBox>
    </Box>
  );
}

interface MapDimensionWellProps {
  settingsKey: string;
  droppableId: string;
  label: string;
  placeholder: string;
}

function MapDimensionWell(props: MapDimensionWellProps) {
  const { settingsKey, droppableId, label, placeholder } = props;

  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const { isOver, setNodeRef, active } = useDroppable({
    id: droppableId,
  });

  const isHighlighted = useMemo(() => {
    if (!active || !isDraggedColumnItem(active)) {
      return false;
    }
    const { column } = active.data.current;
    return isDimension(column);
  }, [active]);

  const dimension = useMemo(
    () => columns.find(col => col.name === settings[settingsKey]),
    [settings, settingsKey, columns],
  );

  const handleRemoveDimension = useCallback(() => {
    if (dimension) {
      dispatch(removeColumn({ name: dimension.name }));
    }
  }, [dimension, dispatch]);

  return (
    <Box mt="lg">
      <Text>{label}</Text>
      <WellBox isHighlighted={isHighlighted} isOver={isOver} ref={setNodeRef}>
        <WellItem onRemove={dimension && handleRemoveDimension}>
          <Ellipsified>{dimension?.display_name ?? placeholder}</Ellipsified>
        </WellItem>
      </WellBox>
    </Box>
  );
}

interface WellBoxProps {
  isHighlighted: boolean;
  isOver: boolean;
  children: ReactNode;
}

const WellBox = forwardRef<HTMLDivElement, WellBoxProps>(function WellBox(
  { children, isHighlighted, isOver },
  ref,
) {
  const borderColor = isHighlighted
    ? "var(--mb-color-brand)"
    : "var(--mb-color-border)";
  return (
    <Box
      bg={isHighlighted ? "var(--mb-color-brand-light)" : "bg-light"}
      p="sm"
      w="300px"
      style={{
        borderRadius: "var(--default-border-radius)",
        border: `1px solid ${borderColor}`,
        transform: isHighlighted ? "scale(1.025)" : "scale(1)",
        transition:
          "transform 0.2s ease-in-out 0.2s, border-color 0.2s ease-in-out 0.2s, background 0.2s ease-in-out 0.2s",
        outline:
          isOver && isHighlighted ? "1px solid var(--mb-color-brand)" : "none",
      }}
      ref={ref}
    >
      {children}
    </Box>
  );
});
