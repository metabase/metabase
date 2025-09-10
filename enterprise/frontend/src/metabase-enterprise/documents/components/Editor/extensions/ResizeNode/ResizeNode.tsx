import { Node, type NodeViewProps, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import type React from "react";
import { useRef, useState } from "react";

import { Box, Flex } from "metabase/ui";

import S from "./ResizeNode.module.css";

export const ResizeNode: Node<{
  HTMLAttributes: {
    height: number;
    minHeight: number;
  };
}> = Node.create({
  name: "resizeNode",
  group: "block",
  content: "block",
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      height: {
        default: 442,
        parseHTML: (element) => element.getAttribute("data-height"),
      },
      minHeight: {
        default: 250,
        parseHTML: (element) => element.getAttribute("data-min-height"),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${ResizeNode.name}"]`,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        {
          "data-type": ResizeNode.name,
          "data-height": node.attrs.height,
          "data-min-height": node.attrs.minHeight,
        },
        this.options.HTMLAttributes,
      ),
      0,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizeNodeView);
  },
});

const ResizeNodeView = ({
  node: { attrs },
  updateAttributes,
}: NodeViewProps) => {
  const { minHeight } = attrs;

  const [height, setHeight] = useState(attrs.height);
  const _height = useRef(attrs.height);

  const computeHeight = (delta: number) => {
    const newHeight = _height.current + delta;

    return newHeight < minHeight ? minHeight : newHeight;
  };

  const handleDrag = (delta: number) => {
    setHeight(computeHeight(delta));
  };

  const handleDragEnd = (delta: number) => {
    const newHeight = computeHeight(delta);
    setHeight(newHeight);
    updateAttributes({
      height: newHeight,
    });
    _height.current = newHeight;
  };

  return (
    <NodeViewWrapper style={{ height }} className={S.wrapper}>
      <NodeViewContent className={S.content} />
      <DragHandle onDrag={handleDrag} onDragEnd={handleDragEnd} />
    </NodeViewWrapper>
  );
};

const DragHandle = ({
  onDrag,
  onDragEnd,
}: {
  onDrag: (val: number) => void;
  onDragEnd: (val: number) => void;
}) => {
  const startY = useRef<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    startY.current = e.pageY;

    const handleMouseMove = (e: MouseEvent) => {
      if (startY.current) {
        const delta = e.pageY - startY.current;
        onDrag?.(delta);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", (e) => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (startY.current) {
        onDragEnd?.(e.pageY - startY.current);
        startY.current = null;
      }
    });
  };

  return (
    <Flex justify="center" className={S.dragContainer} contentEditable={false}>
      <Box className={S.dragHandle} onMouseDown={handleMouseDown} />
    </Flex>
  );
};
