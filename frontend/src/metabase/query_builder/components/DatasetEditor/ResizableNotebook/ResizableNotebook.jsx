import React from "react";
import PropTypes from "prop-types";
import { ResizableBox } from "react-resizable";

import Notebook from "metabase/query_builder/components/notebook/Notebook";

import { NotebookContainer, Handle } from "./ResizableNotebook.styled";

const propTypes = {
  isResizing: PropTypes.bool.isRequired,
  resizableBoxProps: PropTypes.object.isRequired,
  onResizeStop: PropTypes.func.isRequired,
};

function ResizableNotebook({
  isResizing,
  onResizeStop,
  resizableBoxProps,
  ...notebookProps
}) {
  {
    /*reminder for me to handle width better*/
  }
  return (
    <ResizableBox
      className="border-top flex"
      axis="y"
      width={Infinity}
      handle={<Handle />}
      {...resizableBoxProps}
      onResizeStop={(...args) => {
        resizableBoxProps.onResizeStop(...args);
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
