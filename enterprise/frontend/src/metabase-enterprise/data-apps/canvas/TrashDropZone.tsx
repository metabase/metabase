import classNames from "classnames";
import { useDrop } from "react-dnd";

import S from "./DndCanvas.module.css";
import type { DataAppWidget } from "./canvas-types";

const ACCEPTS = ["button", "section", "text"];

export const TrashDropZone = ({
  onDrop,
}: {
  onDrop: (item: DataAppWidget) => void;
}) => {
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ACCEPTS,
    drop: onDrop,
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const isActive = isOver && canDrop;
  return (
    <div
      className={classNames(S.trashDropZone, { [S.active]: isActive })}
      ref={drop}
    >
      TRASH
    </div>
  );
};
