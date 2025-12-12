import { Box } from "metabase/ui";

import { DROP_ZONE_COLOR } from "../constants";

export interface DropZoneProps {
  isOver: boolean;
  side: "left" | "right";
  disabled?: boolean;
}

export const DropZone = ({ isOver, side, disabled }: DropZoneProps) => {
  if (disabled) {
    return null;
  }

  return (
    <Box
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "0.25rem",
        [side]: "-0.625rem",
        borderRadius: "0.125rem",
        backgroundColor: isOver ? DROP_ZONE_COLOR : "transparent",
        zIndex: 10,
        pointerEvents: "all",
      }}
    />
  );
};
