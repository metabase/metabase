import React, { useMemo, useState } from "react";
import PropTypes from "prop-types";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import { isReducedMotionPreferred } from "metabase/lib/dom";
import ResizableNotebook from "./ResizableNotebook";

const SMOOTH_RESIZE_STYLE = { transition: "height 0.25s" };

const propTypes = {
  question: PropTypes.object.isRequired,
  isActive: PropTypes.bool.isRequired, // if QB mode is set to "query"
  height: PropTypes.number.isRequired,
};

function DatasetQueryEditor({ question: dataset, isActive, height, ...props }) {
  const [isResizing, setResizing] = useState(false);

  const resizableBoxProps = useMemo(() => {
    // Disables resizing by removing a handle in "metadata" mode
    const resizeHandles = isActive ? ["s"] : [];

    // The editor can change its size in two cases:
    // 1. By manually resizing the window with a handle
    // 2. Automatically when editor mode is changed between "query" and "metadata"
    // For the 2nd case, we're smoothing the resize effect by adding a `transition` style
    // For the 1st case, we need to make sure it's not included, so resizing doesn't lag
    const style =
      isResizing || isReducedMotionPreferred()
        ? undefined
        : SMOOTH_RESIZE_STYLE;

    const resizableBoxProps = {
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

  return dataset.isNative() ? (
    <NativeQueryEditor
      {...props}
      question={dataset}
      isInitiallyOpen
      hasTopBar={isActive}
      hasEditingSidebar={isActive}
      hasParametersList={false}
      resizableBoxProps={resizableBoxProps}
    />
  ) : (
    <ResizableNotebook
      {...props}
      question={dataset}
      isResizing={isResizing}
      resizableBoxProps={resizableBoxProps}
    />
  );
}

DatasetQueryEditor.propTypes = propTypes;

export default React.memo(
  DatasetQueryEditor,
  // should prevent the editor from re-rendering in "metadata" mode
  // when it's completely covered with the results table
  (prevProps, nextProps) => prevProps.height === 0 && nextProps.height === 0,
);
