import { useDroppable } from "@dnd-kit/core";
import { type ReactNode, forwardRef } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Box, Stack, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";

import { WellItem } from "../WellItem";

export function PieVerticalWell() {
  return (
    <Box>
      <PieMetricWell />
      <PieDimensionWell />
    </Box>
  );
}

function PieMetricWell() {
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getSettings);

  const { isOver, setNodeRef, active } = useDroppable({
    id: DROPPABLE_ID.PIE_METRIC,
  });

  const metric = columns.find(col => col.name === settings["pie.metric"]);

  return (
    <Box mt="lg">
      <Text>{t`Pie chart metric`}</Text>
      <WellBox isHighlighted={!!active} isOver={isOver} ref={setNodeRef}>
        <Stack>
          <WellItem>
            <Text>
              {metric?.display_name ?? t`Drop your chart Metric here`}
            </Text>
          </WellItem>
        </Stack>
      </WellBox>
    </Box>
  );
}

function PieDimensionWell() {
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getSettings);

  const { isOver, setNodeRef, active } = useDroppable({
    id: DROPPABLE_ID.PIE_DIMENSION,
  });

  const dimensions = columns.filter(col =>
    (settings["pie.dimension"] ?? []).includes(col.name),
  );

  return (
    <Box mt="lg">
      <Text>{t`Pie chart dimensions`}</Text>
      <WellBox isHighlighted={!!active} isOver={isOver} ref={setNodeRef}>
        {dimensions.length > 0 ? (
          <Stack>
            {dimensions.map(dimension => (
              <WellItem key={dimension.id}>{dimension.display_name}</WellItem>
            ))}
          </Stack>
        ) : (
          <Text>{t`Drop your chart Dimensions here`}</Text>
        )}
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
      mih="120px"
      w="300px"
      style={{
        borderRadius: "var(--default-border-radius)",
        border: `1px solid ${borderColor}`,
        transform: isHighlighted ? "scale(1.025)" : "scale(1)",
        transition:
          "transform 0.2s ease-in-out 0.2s, border-color 0.2s ease-in-out 0.2s, background 0.2s ease-in-out 0.2s",
        outline: isOver ? "1px solid var(--mb-color-brand)" : "none",
      }}
      ref={ref}
    >
      {children}
    </Box>
  );
});
