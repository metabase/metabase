import type { DragDropContextProps } from "react-beautiful-dnd";
import { DragDropContext as ReactDragDropContext } from "react-beautiful-dnd";
import { withEmotionCache } from "@emotion/react";

export const DragDropContext = withEmotionCache(
  ({ children, ...props }: DragDropContextProps, cache) => {
    return (
      <ReactDragDropContext {...props} nonce={cache.nonce}>
        {children}
      </ReactDragDropContext>
    );
  },
);
