import type { DragEventHandler, DragEvent } from "react";
import type { DropzoneRootProps } from "react-dropzone";

export const composeFileEventHandler =
  (fn: DragEventHandler<HTMLElement> | undefined) =>
  (event: DragEvent<HTMLElement>) => {
    if (!event?.dataTransfer?.types.includes("Files")) {
      return;
    }
    fn?.(event);
  };

export const getComposedDragProps = (
  props: DropzoneRootProps,
): DropzoneRootProps => {
  return {
    ...props,
    onDragEnter: composeFileEventHandler(props.onDragEnter),
    onDragLeave: composeFileEventHandler(props.onDragLeave),
    onDragOver: composeFileEventHandler(props.onDragOver),
    onDrop: composeFileEventHandler(props.onDrop),
  };
};
