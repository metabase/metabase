import type { MouseEvent as ReactMouseEvent } from "react";
import { useRef } from "react";

import { Box, Flex } from "metabase/ui";

import S from "./AnalysisNode.module.css";

type AnalysisResizeHandleProps = {
  onDrag: (deltaY: number) => void;
  onDragEnd: (deltaY: number) => void;
};

/** The bottom-edge handle question cards in a document resize with. */
export const AnalysisResizeHandle = ({
  onDrag,
  onDragEnd,
}: AnalysisResizeHandleProps) => {
  const startYRef = useRef<number | null>(null);

  const handleMouseDown = (event: ReactMouseEvent) => {
    // The whole card is a drag handle for moving it; resizing isn't a move.
    event.preventDefault();
    event.stopPropagation();
    startYRef.current = event.pageY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (startYRef.current !== null) {
        onDrag(moveEvent.pageY - startYRef.current);
      }
    };
    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (startYRef.current !== null) {
        onDragEnd(upEvent.pageY - startYRef.current);
        startYRef.current = null;
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <Flex
      justify="center"
      className={S.resizeHandleContainer}
      contentEditable={false}
    >
      <Box
        className={S.resizeHandle}
        onMouseDown={handleMouseDown}
        onClick={(event) => event.stopPropagation()}
        data-testid="analysis-resize-handle"
      />
    </Flex>
  );
};
