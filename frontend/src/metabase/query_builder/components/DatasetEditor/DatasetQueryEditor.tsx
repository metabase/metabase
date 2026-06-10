import cx from "classnames";
import {
  type ComponentProps,
  type PropsWithChildren,
  memo,
  useMemo,
  useState,
} from "react";
import type { ResizableBoxProps } from "react-resizable";

import { NativeQueryEditor } from "metabase/querying/components/NativeQueryEditor";
import { Box } from "metabase/ui";
import { isReducedMotionPreferred } from "metabase/utils/dom";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";

import { DatasetNotebook } from "./DatasetNotebook";
import S from "./DatasetQueryEditor.module.css";

const QueryEditorContainer = ({
  isActive,
  ...props
}: PropsWithChildren<{ isActive: boolean }>) => {
  return (
    <Box
      className={cx(S.QueryEditorContainer, { [S.isHidden]: !isActive })}
      {...props}
    />
  );
};

const SMOOTH_RESIZE_STYLE = { transition: "height 0.25s" };

type DatasetQueryEditorProps = ComponentProps<typeof NativeQueryEditor> & {
  isActive: boolean; // if QB mode is set to "query"
  height: number;
  // optional: derived from a measured container, so it is undefined until
  // the container has been laid out (e.g. on first render and in jsdom).
  availableHeight?: number;
  onResizeStop: ResizableBoxProps["onResizeStop"];
};

function DatasetQueryEditorInner({
  question,
  isActive,
  height,
  onSetDatabaseId,
  ...props
}: DatasetQueryEditorProps) {
  const { isNative } = Lib.queryDisplayInfo(question.query());

  const [isResizing, setResizing] = useState(false);

  const resizableBoxProps = useMemo(() => {
    // Disables resizing by removing a handle in "columns" mode
    const resizeHandles: NonNullable<ResizableBoxProps["resizeHandles"]> =
      isActive ? ["s"] : [];

    // The editor can change its size in two cases:
    // 1. By manually resizing the window with a handle
    // 2. Automatically when editor mode is changed between "query" and "columns"
    // For the 2nd case, we're smoothing the resize effect by adding a `transition` style
    // For the 1st case, we need to make sure it's not included, so resizing doesn't lag
    const style =
      isResizing || isReducedMotionPreferred()
        ? undefined
        : SMOOTH_RESIZE_STYLE;

    const resizableBoxProps: Partial<ResizableBoxProps> & { height: number } = {
      height,
      resizeHandles,
      onResizeStart: () => setResizing(true),
      onResizeStop: () => setResizing(false),
      style,
    };

    if (!isActive) {
      // Overwrites native query editor's resizable area constraints,
      // so the automatic "close" animation doesn't get stuck
      resizableBoxProps.minConstraints = [0, 0];
    }

    return resizableBoxProps;
  }, [height, isResizing, isActive]);

  return (
    <QueryEditorContainer isActive={isActive}>
      {isNative ? (
        <NativeQueryEditor
          {...props}
          question={question}
          query={checkNotNull(question.legacyNativeQuery())} // memoized query
          isInitiallyOpen
          onSetDatabaseId={onSetDatabaseId}
        >
          {isActive && (
            <NativeQueryEditor.TopBar>
              <NativeQueryEditor.Sidebar />
              <NativeQueryEditor.VisibilityToggler />
            </NativeQueryEditor.TopBar>
          )}
          {isActive && <NativeQueryEditor.RunButton />}
        </NativeQueryEditor>
      ) : (
        <DatasetNotebook
          {...props}
          question={question}
          isResizing={isResizing}
          resizableBoxProps={resizableBoxProps}
        />
      )}
    </QueryEditorContainer>
  );
}

export const DatasetQueryEditor = memo(DatasetQueryEditorInner);
