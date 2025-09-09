import { useDndContext } from "@dnd-kit/core";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import type React from "react";
import { useMemo, useRef, useState } from "react";

import { Box } from "metabase/ui";

import styles from "./FlexContainer.module.css";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

const COLUMN_MIN_WIDTH = 200;

export interface FlexContainerAttributes {
  class?: string;
  columnWidths?: number[]; // Array of width percentages for each column
}

let editorViewRef: EditorView | null = null; // This will hold our editor view

export const FlexContainer: Node<{
  HTMLAttributes: FlexContainerAttributes;
}> = Node.create({
  name: "flexContainer",
  group: "block",
  content: "cardEmbed{1,3}", // Contains 1-3 CardEmbed nodes only
  defining: true,
  draggable: false,
  selectable: false,

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

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("silly-drag-handles"),

        view(editorView) {
          editorViewRef = editorView;

          return {
            destroy() {
              // Clean up if needed.
              editorViewRef = null;
            },
          };
        },

        props: {
          decorations: (state) => {
            const handleMouseDown = (
              handleIndex: number,
              e: MouseEvent,
              parent: PMNode,
            ) => {
              e.preventDefault();

              if (editorViewRef === null) {
                return;
              }

              let pos = 0;

              state.doc.descendants((node, _pos) => {
                if (node === parent) {
                  pos = _pos;
                }
              });

              const container = e.target?.closest("[data-type=flexContainer]");
              if (!container) {
                return;
              }

              const currentWidths = parent.attrs.columnWidths;
              const columnWidths =
                (currentWidths || []).length === parent.childCount
                  ? currentWidths
                  : (Array(parent.childCount).fill(
                      100 / parent.childCount,
                    ) as number[]);

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
                const minWidthPercent =
                  (COLUMN_MIN_WIDTH / containerWidth) * 100;

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
                  const totalWidth = newWidths.reduce(
                    (sum, width) => sum + width,
                    0,
                  );

                  const { state, dispatch } = editorViewRef;

                  if (Math.abs(totalWidth - 100) > 0.01) {
                    // Normalize to ensure exact 100%
                    const normalizedWidths = newWidths.map(
                      (width) => (width / totalWidth) * 100,
                    );

                    const transaction = state.tr.setNodeMarkup(pos, undefined, {
                      columnWidths: normalizedWidths,
                    });

                    dispatch(transaction);
                    // updateAttributes({ columnWidths: normalizedWidths });
                  } else {
                    const transaction = state.tr.setNodeMarkup(pos, undefined, {
                      columnWidths: newWidths,
                    });
                    dispatch(transaction);
                    // updateAttributes({ columnWidths: newWidths });
                  }
                }
              };

              const handleMouseUp = () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
              };

              document.addEventListener("mousemove", handleMouseMove);
              document.addEventListener("mouseup", handleMouseUp);
            };
            const decorations: Decoration[] = [];

            const flexContainers: { node: PMNode; pos: number }[] = [];

            state.doc.content.descendants((node, pos) => {
              // console.log(node);
              if (node.type.name === "flexContainer") {
                flexContainers.push({ node, pos });
                return false;
              }
            });

            flexContainers.forEach(({ node, pos }) => {
              node.forEach((n, offset, index) => {
                if (index !== 0) {
                  const widget = document.createElement("div");
                  widget.classList.add(styles.resizeHandle);
                  widget.onmousedown = (e: MouseEvent) => {
                    handleMouseDown(index - 1, e, node);
                  };

                  const deco = Decoration.widget(pos + offset + 1, widget, {
                    side: -1,
                  });
                  decorations.push(deco);
                }
              });
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FlexContainerComponent);
  },
});

const FlexContainerComponent: React.FC<NodeViewProps> = ({
  node,
  selected,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Get column count and current widths
  const columnCount = node.content.childCount;
  const currentWidths = node.attrs.columnWidths;

  // Calculate default equal widths if not set
  const columnWidths = useMemo(() => {
    if ((currentWidths || []).length === columnCount) {
      return currentWidths;
    }
    // Default to equal widths
    return Array(columnCount).fill(100 / columnCount) as number[];
  }, [currentWidths, columnCount]);

  return (
    <NodeViewWrapper
      className={cx(styles.flexContainer, {
        [styles.selected]: selected,
      })}
      data-type="flexContainer"
    >
      <Box ref={containerRef}>
        <NodeViewContent
          className={styles.flexContent}
          style={{
            "--mb-card-container-col-widths": columnWidths
              .map(
                (width: number) => `minmax(${COLUMN_MIN_WIDTH}px, ${width}%)`,
              )
              .join(" 0.25rem "),
          }}
        />

        {/* {renderResizeHandles(isDragging)} */}
      </Box>
    </NodeViewWrapper>
  );
};

FlexContainerComponent.displayName = "FlexContainerComponent";
