import type { DragEndEvent } from "@dnd-kit/core";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { useCallback } from "react";

export const useCardEmbedDnD = (editor: TiptapEditor | null) => {
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!active || !over || active.id === over.id) {
        return;
      }

      // Handle reordering of CardEmbed nodes
      if (editor && active.id.toString().startsWith("card-embed-")) {
        const sourceId = active.id.toString().replace("card-embed-", "");
        const targetZoneId = over.id.toString().replace("drop-zone-", "");
        const direction = over.id.toString().includes("-left")
          ? "left"
          : "right";
        const targetId = targetZoneId
          .replace("-left", "")
          .replace("-right", "");

        // Don't allow dropping next to itself
        if (sourceId === targetId) {
          return;
        }

        // Find the source and target nodes in the document
        let sourcePos = -1;
        let targetPos = -1;
        let sourceNode: any = null;
        let targetNode: any = null;
        let targetTablePos = -1;
        let targetTable: any = null;
        let targetRowPos = -1;
        let sourceTablePos = -1;
        let sourceTable: any = null;
        let sourceRowPos = -1;

        editor.state.doc.descendants((node, pos) => {
          if (
            node.type.name === "cardEmbed" &&
            node.attrs.id?.toString() === sourceId
          ) {
            sourcePos = pos;
            sourceNode = node;

            // Check if the source CardEmbed is inside a table
            const currentPos = pos;
            editor.state.doc.nodesBetween(
              0,
              editor.state.doc.content.size,
              (node, nodePos) => {
                if (
                  nodePos <= currentPos &&
                  currentPos < nodePos + node.nodeSize
                ) {
                  if (node.type.name === "table") {
                    sourceTablePos = nodePos;
                    sourceTable = node;
                  } else if (
                    node.type.name === "tableRow" &&
                    nodePos < currentPos
                  ) {
                    sourceRowPos = nodePos;
                  }
                }
              },
            );
          }
          if (
            node.type.name === "cardEmbed" &&
            node.attrs.id?.toString() === targetId
          ) {
            targetPos = pos;
            targetNode = node;

            // Check if this CardEmbed is inside a table by walking up the tree
            const currentPos = pos;
            editor.state.doc.nodesBetween(
              0,
              editor.state.doc.content.size,
              (node, nodePos) => {
                if (
                  nodePos <= currentPos &&
                  currentPos < nodePos + node.nodeSize
                ) {
                  if (node.type.name === "table") {
                    targetTablePos = nodePos;
                    targetTable = node;
                  } else if (
                    node.type.name === "tableRow" &&
                    nodePos < currentPos
                  ) {
                    targetRowPos = nodePos;
                  }
                }
              },
            );
          }
        });

        if (sourcePos !== -1 && targetPos !== -1 && sourceNode && targetNode) {
          const tr = editor.state.tr;

          // Check if both source and target are in the same table
          const bothInSameTable =
            sourceTablePos !== -1 &&
            targetTablePos !== -1 &&
            sourceTablePos === targetTablePos;

          if (bothInSameTable) {
            // Swap positions within the same table
            const table = sourceTable;
            const row = table.content.content
              ? table.content.content[0]
              : table.content[0];
            const rowContent = row.content.content
              ? row.content.content
              : row.content;

            // Find the cell indices for source and target
            let sourceCellIndex = -1;
            let targetCellIndex = -1;
            let cellPos = sourceRowPos + 1; // Start after row opening tag

            for (let i = 0; i < rowContent.length; i++) {
              const cell = rowContent[i];
              if (cellPos <= sourcePos && sourcePos < cellPos + cell.nodeSize) {
                sourceCellIndex = i;
              }
              if (cellPos <= targetPos && targetPos < cellPos + cell.nodeSize) {
                targetCellIndex = i;
              }
              cellPos += cell.nodeSize;
            }

            if (sourceCellIndex !== -1 && targetCellIndex !== -1) {
              // Create new row content with swapped cells
              const newRowContent = [...rowContent];

              if (direction === "left") {
                // Insert source before target, remove source from old position
                const sourceCell = newRowContent[sourceCellIndex];
                newRowContent.splice(sourceCellIndex, 1); // Remove source

                // Adjust target index if source was before it
                const adjustedTargetIndex =
                  sourceCellIndex < targetCellIndex
                    ? targetCellIndex - 1
                    : targetCellIndex;
                newRowContent.splice(adjustedTargetIndex, 0, sourceCell); // Insert before target
              } else {
                // Insert source after target, remove source from old position
                const sourceCell = newRowContent[sourceCellIndex];
                newRowContent.splice(sourceCellIndex, 1); // Remove source

                // Adjust target index if source was before it
                const adjustedTargetIndex =
                  sourceCellIndex < targetCellIndex
                    ? targetCellIndex - 1
                    : targetCellIndex;
                newRowContent.splice(adjustedTargetIndex + 1, 0, sourceCell); // Insert after target
              }

              // Create the updated table
              const newTable = {
                type: "table",
                attrs: table.attrs,
                content: [
                  {
                    type: "tableRow",
                    content: newRowContent.map((cell) =>
                      cell.toJSON ? cell.toJSON() : cell,
                    ),
                  },
                ],
              };

              // Replace the entire table
              tr.replaceWith(
                sourceTablePos,
                sourceTablePos + table.nodeSize,
                editor.schema.nodeFromJSON(newTable),
              );
            }
          } else if (targetTablePos !== -1 && targetTable) {
            // Target is already in a table - add a new cell to the existing row
            const newCell = {
              type: "tableCell",
              content: [sourceNode.toJSON()],
            };

            // Find the target row content
            const targetRow = targetTable.content.content
              ? targetTable.content.content[0]
              : targetTable.content[0];
            const rowContent = targetRow.content.content
              ? targetRow.content.content
              : targetRow.content;
            const newRowContent = [...rowContent];

            // Insert the new cell at the appropriate position based on direction
            if (direction === "left") {
              // Find the index of the target cell and insert before it
              let targetCellIndex = 0;
              let cellPos = targetRowPos + 1; // Start after row opening tag

              for (let i = 0; i < rowContent.length; i++) {
                const cell = rowContent[i];
                if (
                  cellPos <= targetPos &&
                  targetPos < cellPos + cell.nodeSize
                ) {
                  targetCellIndex = i;
                  break;
                }
                cellPos += cell.nodeSize;
              }

              newRowContent.splice(
                targetCellIndex,
                0,
                editor.schema.nodeFromJSON(newCell),
              );
            } else {
              // Insert after the target cell
              let targetCellIndex = 0;
              let cellPos = targetRowPos + 1;

              for (let i = 0; i < rowContent.length; i++) {
                const cell = rowContent[i];
                if (
                  cellPos <= targetPos &&
                  targetPos < cellPos + cell.nodeSize
                ) {
                  targetCellIndex = i + 1;
                  break;
                }
                cellPos += cell.nodeSize;
              }

              newRowContent.splice(
                targetCellIndex,
                0,
                editor.schema.nodeFromJSON(newCell),
              );
            }

            // Create the new resizable table with updated row
            const newTable = {
              type: "table",
              attrs: { resizable: true },
              content: [
                {
                  type: "tableRow",
                  content: newRowContent.map((cell) =>
                    cell.toJSON ? cell.toJSON() : cell,
                  ),
                },
              ],
            };

            // Replace the table and remove the source node
            tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);

            // Adjust table position if source was before it
            const adjustedTablePos =
              sourcePos < targetTablePos
                ? targetTablePos - sourceNode.nodeSize
                : targetTablePos;
            tr.replaceWith(
              adjustedTablePos,
              adjustedTablePos + targetTable.nodeSize,
              editor.schema.nodeFromJSON(newTable),
            );
          } else {
            // Target is not in a table - create a new table with two columns
            const leftCardEmbed =
              direction === "left" ? sourceNode.toJSON() : targetNode.toJSON();
            const rightCardEmbed =
              direction === "left" ? targetNode.toJSON() : sourceNode.toJSON();

            const tableContent = {
              type: "table",
              attrs: { resizable: true },
              content: [
                {
                  type: "tableRow",
                  content: [
                    {
                      type: "tableCell",
                      content: [leftCardEmbed],
                    },
                    {
                      type: "tableCell",
                      content: [rightCardEmbed],
                    },
                  ],
                },
              ],
            };

            // Delete nodes in reverse order to maintain positions
            if (sourcePos > targetPos) {
              tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
              tr.delete(targetPos, targetPos + targetNode.nodeSize);
            } else {
              tr.delete(targetPos, targetPos + targetNode.nodeSize);
              tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
            }

            // Insert the table at the position of whichever node was first
            const insertPos = Math.min(sourcePos, targetPos);
            tr.insert(insertPos, editor.schema.nodeFromJSON(tableContent));
          }

          editor.view.dispatch(tr);
        }
      }
    },
    [editor],
  );

  return {
    handleDragEnd,
  };
};
