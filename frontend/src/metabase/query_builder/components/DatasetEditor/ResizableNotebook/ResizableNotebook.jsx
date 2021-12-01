import React, { useState } from "react";
import PropTypes from "prop-types";
import { ResizableBox } from "react-resizable";

import Notebook from "metabase/query_builder/components/notebook/Notebook";

import { NotebookContainer, Handle } from "./ResizableNotebook.styled";

const propTypes = {
  height: PropTypes.number.isRequired,
  isResizable: PropTypes.bool.isRequired,
  onResizeStop: PropTypes.func.isRequired,
};

const SMOOTH_RESIZE_STYLE = { transition: "height 0.25s" };

function ResizableNotebook({
  height,
  isResizable,
  onResizeStop,
  ...notebookProps
}) {
  const [isResizing, setResizing] = useState(false);

  // Disables resizing by removing a handle in "metadata" mode
  const resizeHandles = isResizable ? ["s"] : [];

  // The editor can change its size in two cases:
  // 1. By manually resizing the window with a handle
  // 2. Automatically when editor mode is changed between "query" and "metadata"
  // For the 2nd case, we're smoothing the resize effect by adding a `transition` style
  // For the 1st case, we need to make sure it's not included, so resizing doesn't lag
  const style = isResizing ? undefined : SMOOTH_RESIZE_STYLE;

  return (
    <ResizableBox
      className="border-top flex"
      axis="y"
      resizeHandles={resizeHandles}
      height={height}
      handle={<Handle />}
      style={style}
      onResizeStart={() => {
        setResizing(true);
      }}
      onResizeStop={(...args) => {
        setResizing(false);
        onResizeStop(...args);
      }}
    >
      <NotebookContainer isResizing={isResizing}>
        <Notebook {...notebookProps} hasVisualizeButton={false} />
      </NotebookContainer>
    </ResizableBox>
  );
}

ResizableNotebook.propTypes = propTypes;

export default ResizableNotebook;
