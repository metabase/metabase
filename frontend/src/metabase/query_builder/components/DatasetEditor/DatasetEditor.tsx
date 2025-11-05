import { type ComponentProps, forwardRef } from "react";

import { DatasetEditorInner } from "./DatasetEditorInner";

export const DatasetEditor = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof DatasetEditorInner>
>(function _DatasetEditor(props, ref) {
  return <DatasetEditorInner {...props} forwardedRef={ref} />;
});
