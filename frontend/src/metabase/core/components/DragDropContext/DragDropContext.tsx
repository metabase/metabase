import { withEmotionCache } from "@emotion/react";
import type { DragDropContextProps } from "react-beautiful-dnd";
import { DragDropContext as ReactDragDropContext } from "react-beautiful-dnd";

export const DragDropContext = withEmotionCache(
  ({ children, ...props }: DragDropContextProps, cache) => {
    return (
      <ReactDragDropContext {...props} nonce={cache.nonce}>
        {children}
      </ReactDragDropContext>
    );
  },
);
