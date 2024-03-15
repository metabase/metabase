import cx from "classnames";
import PropTypes from "prop-types";
import { ResizableBox } from "react-resizable";

import CS from "metabase/css/core/index.css";
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
  return (
    <ResizableBox
      className={cx(CS.borderTop, CS.flex)}
      axis="y"
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
