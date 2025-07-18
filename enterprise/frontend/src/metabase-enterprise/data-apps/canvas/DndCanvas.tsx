import { useCallback } from "react";

import { TrashDropZone } from "metabase-enterprise/data-apps/canvas/TrashDropZone";
import type {
  CanvasComponentsMap,
  DataAppWidget,
  HandleDropFnArguments,
  RenderCanvasComponentFn,
} from "metabase-enterprise/data-apps/canvas/canvas-types";

import S from "./DndCanvas.module.css";
import {
  findParent,
  handleMoveSidebarComponentIntoParent,
  handleMoveToDifferentParent,
  handleMoveWithinParent,
  handleRemoveItemFromLayout,
} from "./helpers";

interface Props {
  components: DataAppWidget[];
  componentsMap: CanvasComponentsMap;
  onComponentsUpdate: (newComponents: DataAppWidget[]) => void;
  renderCanvasComponent: RenderCanvasComponentFn;
}

export const Container = ({
  components,
  componentsMap,
  onComponentsUpdate,
  renderCanvasComponent,
}: Props) => {
  const handleDrop = useCallback(
    ({ item, over, index }: HandleDropFnArguments) => {
      console.log("dropZone", over);
      console.log("item", item);

      // sidebar into
      if (item.fromSidebar) {
        // 1. Move sidebar item into page
        const newItem = {
          ...item,
        };
        delete newItem.fromSidebar;

        onComponentsUpdate(
          handleMoveSidebarComponentIntoParent(
            components,
            {
              item: newItem,
              over,
            },
            index,
          ),
        );
        return;
      }

      // move down here since sidebar items dont have path
      const itemParent = findParent(item.id, components);

      // 2. Pure move (no create)
      // 2.a. move within parent
      if (itemParent.id === over.id) {
        onComponentsUpdate(handleMoveWithinParent(components, item, index));
        return;
      }
      // 2.b. OR move different parent
      if (itemParent.id !== over.id) {
        onComponentsUpdate(
          handleMoveToDifferentParent(components, { item, over }, index),
        );
        return;
      }

      // // 3. Move + Create
      // onComponentsUpdate(
      //   handleMoveToDifferentParent(
      //     layout,
      //     splitDropZonePath,
      //     splitItemPath,
      //     newItem,
      //   ),
      // );
    },
    [onComponentsUpdate, components],
  );

  const handleDropToTrashBin = useCallback(
    (item: DataAppWidget) => {
      onComponentsUpdate(handleRemoveItemFromLayout(components, item));
    },
    [components, onComponentsUpdate],
  );

  return (
    <div className={S.container}>
      {renderCanvasComponent("root", handleDrop, componentsMap)}

      <TrashDropZone onDrop={handleDropToTrashBin} />
    </div>
  );
};
