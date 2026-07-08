import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import { Box } from "metabase/ui";

import styles from "./FlexContainer.module.css";

const COLUMN_MIN_WIDTH = 200;

export interface FlexContainerAttributes {
  class?: string;
  columnWidths?: number[]; // Array of width percentages for each column
}

export const FlexContainer: Node<{
  HTMLAttributes: FlexContainerAttributes;
}> = Node.create({
  name: "flexContainer",
  group: "block",
  content: "(supportingText|cardEmbed){1,3}", // Contains 1-3 CardEmbed or SupportingText nodes only
  defining: true,
  draggable: false,
  selectable: false,
  disableDropCursor: true,

  addAttributes() {
    return {
      columnWidths: {
        default: null,
        parseHTML: (element) => {
          const widths = element.getAttribute("data-column-widths");
          return widths ? JSON.parse(widths) : null;
        },
        renderHTML: (attributes) => {
          return attributes.columnWidths
            ? {
                "data-column-widths": JSON.stringify(attributes.columnWidths),
              }
            : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${FlexContainer.name}"]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        {
          "data-type": FlexContainer.name,
          class: "flex-container",
        },
        this.options.HTMLAttributes,
      ),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FlexContainerComponent);
  },
});

const FlexContainerComponent: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  selected,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Get column count and current widths
  const columnCount = node.content.childCount;
  const currentWidths: number[] = node.attrs.columnWidths;

  // Calculate default equal widths if not set
  const columnWidths = useMemo(() => {
    if ((currentWidths || []).length === columnCount) {
      return currentWidths;
    }
    // Default to equal widths
    return Array(columnCount).fill(100 / columnCount) as number[];
  }, [currentWidths, columnCount]);

  const handleMouseDown = useCallback(
    (handleIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const container = containerRef.current;
      if (!container) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const startX = e.clientX;
      const startWidths = [...columnWidths];

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX;
        const containerWidth = containerRect.width;
        const deltaPercent = (deltaX / containerWidth) * 100;

        const newWidths = [...startWidths];

        // Adjust the current column and next column
        const leftColumnIndex = handleIndex;
        const rightColumnIndex = handleIndex + 1;

        // Calculate minimum width percentage based on 200px minimum
        const minWidthPercent = (COLUMN_MIN_WIDTH / containerWidth) * 100;

        // Calculate new widths ensuring minimum column width
        let leftNewWidth = Math.max(
          minWidthPercent,
          startWidths[leftColumnIndex] + deltaPercent,
        );
        let rightNewWidth = Math.max(
          minWidthPercent,
          startWidths[rightColumnIndex] - deltaPercent,
        );

        // Ensure the two adjusted columns don't exceed their total original width
        const originalTotal =
          startWidths[leftColumnIndex] + startWidths[rightColumnIndex];
        const newTotal = leftNewWidth + rightNewWidth;

        if (newTotal !== originalTotal) {
          // Adjust proportionally to maintain the original total
          const ratio = originalTotal / newTotal;
          leftNewWidth *= ratio;
          rightNewWidth *= ratio;

          // Re-check minimum constraints after adjustment
          if (
            leftNewWidth < minWidthPercent ||
            rightNewWidth < minWidthPercent
          ) {
            return; // Don't update if constraints would be violated
          }
        }

        // Only apply if both columns meet minimum requirements
        if (
          leftNewWidth >= minWidthPercent &&
          rightNewWidth >= minWidthPercent
        ) {
          newWidths[leftColumnIndex] = leftNewWidth;
          newWidths[rightColumnIndex] = rightNewWidth;

          // Verify total width is still 100%
          const totalWidth = newWidths.reduce((sum, width) => sum + width, 0);
          if (Math.abs(totalWidth - 100) > 0.01) {
            // Normalize to ensure exact 100%
            const normalizedWidths = newWidths.map(
              (width) => (width / totalWidth) * 100,
            );
            updateAttributes({ columnWidths: normalizedWidths });
          } else {
            updateAttributes({ columnWidths: newWidths });
          }
        }
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [columnWidths, updateAttributes],
  );

  const renderResizeHandles = () => {
    if (columnCount <= 1) {
      return null;
    }

    const handles = [];
    for (let i = 0; i < columnCount - 1; i++) {
      // Calculate the cumulative width of columns before this handle
      const leftWidth = columnWidths
        .slice(0, i + 1)
        .reduce((sum: number, width: number) => sum + width, 0);

      handles.push(
        <div
          key={i}
          className={styles.resizeHandle}
          style={{
            left: `${leftWidth}%`,
          }}
          contentEditable={false}
          onMouseDown={(e) => handleMouseDown(i, e)}
          data-testid="flex-container-drag-handle"
        />,
      );
    }
    return handles;
  };

  return (
    <NodeViewWrapper
      className={cx(styles.flexContainer, {
        [styles.selected]: selected,
        [styles.resizing]: isResizing,
      })}
      data-type="flexContainer"
    >
      <Box h="100%" ref={containerRef}>
        <NodeViewContent
          className={styles.flexContent}
          style={
            {
              "--mb-card-container-col-widths": columnWidths
                .map(
                  (width: number) => `minmax(${COLUMN_MIN_WIDTH}px, ${width}%)`,
                )
                .join(" "),
            } as React.CSSProperties
          }
        />

        {renderResizeHandles()}
      </Box>
    </NodeViewWrapper>
  );
};

FlexContainerComponent.displayName = "FlexContainerComponent";
