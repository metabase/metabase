import classNames from "classnames";
import { useDrop } from "react-dnd";

import S from "./DndCanvas.module.css";
import type {
  DataAppWidget,
  DataAppWidgetSection,
  HandleDropFnArguments,
} from "./canvas-types";

const ACCEPTS = ["button", "section", "text"];

type DropZoneProps = {
  parent: DataAppWidgetSection;
  index: number;
  horizontal: boolean;
  onDrop: ({ item, over, index }: HandleDropFnArguments) => void;

  className?: string;
};

export const DropZone = ({
  parent,
  index,
  horizontal,
  onDrop,
  className,
}: DropZoneProps) => {
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ACCEPTS,
    drop: (item) => {
      onDrop({ item: item as DataAppWidget, over: parent, index });
    },
    canDrop: () => {
      // TODO: add logic to check if the dropped widget can be placed in this drop zone

      return true;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const isActive = isOver && canDrop;
  return (
    <div
      className={classNames(
        S.dropZone,
        { [S.active]: isActive, [S.horizontalDrag]: horizontal },
        className,
      )}
      ref={drop}
    />
  );
};
