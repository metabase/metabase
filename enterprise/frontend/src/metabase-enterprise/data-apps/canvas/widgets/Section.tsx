import { Fragment, useRef } from "react";
import { useDrag } from "react-dnd";

import { Flex } from "metabase/ui";
import { DropZone } from "metabase-enterprise/data-apps/canvas/DropZone";

import type {
  DataAppWidget,
  DataAppWidgetSection,
  RenderCanvasComponentFn,
} from "../canvas-types";

export const SectionWidget = ({
  widget,
  renderCanvasComponent,
  handleDrop,
}: {
  widget: DataAppWidgetSection;
  renderCanvasComponent: RenderCanvasComponentFn;
  handleDrop: ({
    item,
    over,
    index,
  }: {
    item: DataAppWidget;
    over: DataAppWidget;
    index: number;
  }) => void;
}) => {
  const ref = useRef(null);

  const isRoot = widget.id === "root";

  const [{ isDragging }, drag] = useDrag({
    item: {
      type: widget.type,
      id: widget.id,
    },
    canDrag: !isRoot,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const opacity = isDragging ? 0 : 1;
  drag(ref);

  return (
    <Flex
      p="1rem"
      justify="stretch"
      direction={widget.options.direction}
      gap={0}
      className={!isRoot ? "draggable" : undefined}
      mih="6rem"
      style={{
        flexBasis: `${widget.options.width / 3}`,
        border: "1px solid var(--mb-color-border)",
        // eslint-disable-next-line no-color-literals
        background: "rgba(0,0,0, 0.1)",

        opacity,
      }}
      ref={ref}
    >
      {widget.childrenIds.map((id, index) => (
        <Fragment key={id}>
          <DropZone
            parent={widget}
            index={index}
            horizontal={widget.options.direction === "row"}
            onDrop={handleDrop}
          />

          {renderCanvasComponent(id, handleDrop)}
        </Fragment>
      ))}

      <DropZone
        parent={widget}
        index={widget.childrenIds.length}
        horizontal={widget.options.direction === "row"}
        onDrop={handleDrop}
      />
    </Flex>
  );
};
