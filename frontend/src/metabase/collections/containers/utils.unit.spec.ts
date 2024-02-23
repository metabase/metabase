import type { DragEvent } from "react";
import type { DropzoneRootProps } from "react-dropzone";

import { getComposedDragProps, composeFileEventHandler } from "./utils";
describe("Collections > containers > utils", () => {
  const testNonFileEvent = {
    dataTransfer: {
      types: ["text/plain"],
    },
  } as unknown as DragEvent<HTMLElement>;

  const testFileEvent = {
    dataTransfer: {
      types: ["Files"],
    },
  } as unknown as DragEvent<HTMLElement>;

  describe("getComposedDragProps", () => {
    it("should compose all drag event handlers to ignore non-file events", () => {
      const dragEventSpy = jest.fn();
      const nonDragEventSpy = jest.fn();

      const mockProps = {
        onDragEnter: dragEventSpy,
        onDragLeave: dragEventSpy,
        onDragOver: dragEventSpy,
        onDrop: dragEventSpy,
        onClick: nonDragEventSpy,
      } as DropzoneRootProps;

      const composedProps = getComposedDragProps(mockProps);

      composedProps.onDragEnter?.(testNonFileEvent);
      composedProps.onDragLeave?.(testNonFileEvent);
      composedProps.onDragOver?.(testNonFileEvent);
      composedProps.onDrop?.(testNonFileEvent);
      // this non-drag handler should not get composed
      composedProps.onClick?.(testNonFileEvent);

      expect(dragEventSpy).not.toHaveBeenCalled();
      expect(nonDragEventSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("composeFileEventHandler", () => {
    it("should return a function that ignores non-file drag events", () => {
      const testFn = jest.fn();

      const composedFn = composeFileEventHandler(testFn);

      composedFn(testNonFileEvent);
      expect(testFn).not.toHaveBeenCalled();
      composedFn(testFileEvent);
      expect(testFn).toHaveBeenCalledTimes(1);
    });
  });
});
