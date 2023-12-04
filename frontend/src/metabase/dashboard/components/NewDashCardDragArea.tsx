import type { MouseEvent } from "react";
import { forwardRef, useState } from "react";
import { useEvent } from "react-use";

// TODO Add .d.ts file
import { calculateUtils } from "react-grid-layout";

import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";
import { NewDashCardMenu } from "./NewDashCardMenu";

const GRID_TOP_MARGIN = 21;

interface NewDashCardDragAreaProps {
  positionParams: any;
}

type Position = { top: number; left: number };
type Size = { width: number; height: number };

export function NewDashCardDragArea({
  positionParams,
}: NewDashCardDragAreaProps) {
  const [isActive, setActive] = useState(false);
  const [nextCardPosition, setNextCardPosition] = useState({
    col: 0,
    row: 0,
    size_x: 0,
    size_y: 0,
  });

  const handleSelectionEnd = ({
    top,
    left,
    width,
    height,
  }: Position & Size) => {
    const { x: col, y: row } = calculateUtils.calcXY(
      positionParams,
      top,
      left,
      1, // hardcode 1:1 square
      1,
    );
    const { w: size_x, h: size_y } = calculateUtils.calcWH(
      positionParams,
      width,
      height,
      col,
      row,
    );

    setNextCardPosition({ col, row, size_x, size_y });
    setActive(true);
  };

  return (
    <NewDashCardMenu
      opened={isActive}
      disabled={!isActive}
      nextCardPosition={nextCardPosition}
      onClose={() => setActive(false)}
    >
      <DragArea
        disabled={isActive}
        onSelectionStart={() => setActive(false)}
        onSelectionEnd={handleSelectionEnd}
      />
    </NewDashCardMenu>
  );
}

interface DragAreaProps {
  disabled?: boolean;
  onSelectionStart: () => void;
  onSelectionEnd: (selection: Position & Size) => void;
}

const DragArea = forwardRef<HTMLDivElement, DragAreaProps>(function DragArea(
  { disabled, onSelectionStart, onSelectionEnd },
  ref,
) {
  const [isDragging, setIsDragging] = useState(false);

  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEvent(
    "mousedown",
    (event: MouseEvent & { offsetX: number; offsetY: number }) => {
      if (disabled) {
        return;
      }
      setIsDragging(true);
      setSize({ width: 0, height: 0 });
      setPosition({
        top: event.offsetY + GRID_TOP_MARGIN,
        left: event.offsetX,
      });
      document.documentElement.classList.add("user-select-none");

      onSelectionStart();
    },
  );

  useEvent(
    "mousemove",
    (event: MouseEvent & { offsetX: number; offsetY: number }) => {
      if (disabled) {
        return;
      }
      if (isDragging) {
        const width = event.offsetX - position.left;
        const height = event.offsetY - position.top;
        setSize({ width, height });
      }
    },
  );

  useEvent("mouseup", () => {
    if (disabled) {
      return;
    }
    setIsDragging(false);
    document.documentElement.classList.remove("user-select-none");

    if (size.width > 0 && size.height > 0) {
      onSelectionEnd({ ...position, ...size });
    }
  });

  return <Area style={{ ...position, ...size }} ref={ref} />;
});

const Area = styled.div`
  position: absolute;
  border: 1px solid ${color("brand-light")};
  background-color: ${alpha(color("brand"), 0.1)};
  will-change: top, right, bottom, left, width, height;
  z-index: 999;
`;
