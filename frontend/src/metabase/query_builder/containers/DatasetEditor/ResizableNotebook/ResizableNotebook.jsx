import React from "react";
import PropTypes from "prop-types";
import { ResizableBox } from "react-resizable";

import Notebook from "metabase/query_builder/components/notebook/Notebook";

import { NotebookContainer, Handle } from "./ResizableNotebook.styled";

const propTypes = {
  height: PropTypes.number.isRequired,
  onResizeStop: PropTypes.func.isRequired,
};

function ResizableNotebook({ height, onResizeStop, ...notebookProps }) {
  return (
    <ResizableBox
      className="border-top flex"
      axis="y"
      resizeHandles={["s"]}
      height={height}
      handle={<Handle />}
      onResizeStop={onResizeStop}
    >
      <NotebookContainer>
        <Notebook {...notebookProps} hasVisualizeButton={false} />
      </NotebookContainer>
    </ResizableBox>
  );
}

ResizableNotebook.propTypes = propTypes;

export default ResizableNotebook;
