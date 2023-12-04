import type { MouseEvent } from "react";
import { forwardRef, useMemo, useState } from "react";
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
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  });

  const nextCardPosition = useMemo(() => {
    const { x: col, y: row } = calculateUtils.calcXY(
      positionParams,
      position.top,
      position.left,
      1, // hardcode 1:1 square
      1,
    );
    const { w: size_x, h: size_y } = calculateUtils.calcWH(
      positionParams,
      position.width,
      position.height,
      col,
      row,
    );
    return { col, row, size_x, size_y };
  }, [position, positionParams]);

  const handleSelectionEnd = () => {
    setActive(true);
  };

  const handleReset = () => {
    setActive(false);
    setPosition({ top: 0, left: 0, width: 0, height: 0 });
  };

  return (
    <NewDashCardMenu
      opened={isActive}
      disabled={!isActive}
      nextCardPosition={nextCardPosition}
      onClose={handleReset}
    >
      <DragArea
        disabled={isActive}
        position={position}
        onSelectionStart={({ top, left }: Position) => {
          setPosition({ top, left, width: 0, height: 0 });
          setActive(false);
        }}
        onSelection={size => {
          setPosition(position => ({ ...position, ...size }));
        }}
        onSelectionEnd={handleSelectionEnd}
      />
    </NewDashCardMenu>
  );
}

interface DragAreaProps {
  position: Position & Size;
  disabled?: boolean;
  onSelectionStart: (position: Position) => void;
  onSelection: (size: Size) => void;
  onSelectionEnd: () => void;
}

const DragArea = forwardRef<HTMLDivElement, DragAreaProps>(function DragArea(
  { position, disabled, onSelectionStart, onSelection, onSelectionEnd },
  ref,
) {
  const [isDragging, setIsDragging] = useState(false);

  useEvent(
    "mousedown",
    (event: MouseEvent & { offsetX: number; offsetY: number }) => {
      if (disabled) {
        return;
      }
      setIsDragging(true);

      document.documentElement.classList.add("user-select-none");

      onSelectionStart({
        top: event.offsetY + GRID_TOP_MARGIN,
        left: event.offsetX,
      });
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
        onSelection({ width, height });
      }
    },
  );

  useEvent("mouseup", () => {
    if (disabled) {
      return;
    }
    setIsDragging(false);
    document.documentElement.classList.remove("user-select-none");

    if (position.width > 0 && position.height > 0) {
      onSelectionEnd();
    }
  });

  return <Area style={position} ref={ref} />;
});

const Area = styled.div`
  position: absolute;
  border: 1px solid ${color("brand-light")};
  background-color: ${alpha(color("brand"), 0.1)};
  will-change: top, right, bottom, left, width, height;
  z-index: 999;
`;
