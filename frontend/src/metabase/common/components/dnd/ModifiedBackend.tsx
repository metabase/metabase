import type { BackendFactory } from "dnd-core";
import HTML5Backend from "react-dnd-html5-backend";

import { DND_IGNORE_CLASS_NAME } from ".";

const shouldIgnoreTarget = (domNode: Element) => {
  return domNode.closest(`.${DND_IGNORE_CLASS_NAME}`);
};

export const ModifiedBackend: BackendFactory = (...args) => {
  // HACK: Check if this workaround is still needed whenever upgrading react-dnd
  // @ts-expect-error https://github.com/react-dnd/react-dnd/issues/802#issuecomment-1872949603
  const instance = new HTML5Backend(...args);

  const listeners = [
    "handleTopDragStart",
    "handleTopDragStartCapture",
    "handleTopDragEndCapture",
    "handleTopDragEnter",
    "handleTopDragEnterCapture",
    "handleTopDragLeaveCapture",
    "handleTopDragOver",
    "handleTopDragOverCapture",
    "handleTopDrop",
    "handleTopDropCapture",
  ];
  listeners.forEach((name) => {
    const original = instance[name];
    instance[name] = (e: Event, ...extraArgs: unknown[]) => {
      if (e.target instanceof Element && shouldIgnoreTarget(e.target)) {
        return;
      }
      original(e, ...extraArgs);
    };
  });

  return instance;
};
