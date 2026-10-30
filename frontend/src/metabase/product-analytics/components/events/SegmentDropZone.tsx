import { Box, Text } from "metabase/ui";

import { useSegmentDropTarget } from "../../segments/drag-context";
import type { PaletteSegment } from "../../segments/types";

import S from "./SegmentDropZone.module.css";

type SegmentDropZoneProps = {
  label: string;
  accepts: (segment: PaletteSegment) => boolean;
  onDrop: (segment: PaletteSegment) => void;
};

/** A landing area that appears while a segment it accepts is being dragged. */
export const SegmentDropZone = ({
  label,
  accepts,
  onDrop,
}: SegmentDropZoneProps) => {
  const { isActive, dropProps } = useSegmentDropTarget({ accepts, onDrop });

  if (!isActive) {
    return null;
  }

  return (
    <Box className={S.zone} p="sm" ta="center" bdrs="sm" {...dropProps}>
      <Text size="sm" fw="bold" c="text-brand">
        {label}
      </Text>
    </Box>
  );
};
