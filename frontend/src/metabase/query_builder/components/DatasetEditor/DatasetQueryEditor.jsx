import React, { memo, useMemo, useState } from "react";
import PropTypes from "prop-types";
import styled from "@emotion/styled";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import { isReducedMotionPreferred } from "metabase/lib/dom";
import ResizableNotebook from "./ResizableNotebook";

const QueryEditorContainer = styled.div`
  visibility: ${props => (props.isActive ? "visible" : "hidden")};
`;

const SMOOTH_RESIZE_STYLE = { transition: "height 0.25s" };

const propTypes = {
  question: PropTypes.object.isRequired,
  isActive: PropTypes.bool.isRequired, // if QB mode is set to "query"
  height: PropTypes.number.isRequired,
};

function DatasetQueryEditor({
  // See below, where we convert the dataset/model question back into a "normal" question
  // so that we can do question-y things and not dataset-y things within the Notebook editor
  question: dataset_DO_NOT_USE,
  isActive,
  height,
  ...props
}) {
  // Datasets/models by default behave like they are already nested,
  // so we need to edit the dataset/model question like it is a normal question
  const question = dataset_DO_NOT_USE.setDataset(false);

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

  return (
    <QueryEditorContainer isActive={isActive}>
      {question.isNative() ? (
        <NativeQueryEditor
          {...props}
          question={question}
          isInitiallyOpen
          hasTopBar={isActive}
          hasEditingSidebar={isActive}
          hasParametersList={false}
          resizableBoxProps={resizableBoxProps}
          // We need to rerun the query after saving changes or canceling edits
          // By default, NativeQueryEditor cancels an active query on unmount,
          // which can also cancel the expected query rerun
          // (see https://github.com/metabase/metabase/issues/19180)
          cancelQueryOnLeave={false}
        />
      ) : (
        <ResizableNotebook
          {...props}
          question={question}
          isResizing={isResizing}
          resizableBoxProps={resizableBoxProps}
        />
      )}
    </QueryEditorContainer>
  );
}

DatasetQueryEditor.propTypes = propTypes;

export default memo(DatasetQueryEditor);
