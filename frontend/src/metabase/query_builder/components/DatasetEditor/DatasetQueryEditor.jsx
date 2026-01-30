import cx from "classnames";
import PropTypes from "prop-types";
import { memo, useMemo, useState } from "react";

import { isReducedMotionPreferred } from "metabase/lib/dom";
import { NativeQueryEditor } from "metabase/query_builder/components/NativeQueryEditor";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { DatasetNotebook } from "./DatasetNotebook";
import S from "./DatasetQueryEditor.module.css";

// eslint-disable-next-line react/prop-types
const QueryEditorContainer = ({ isActive, ...props }) => {
  return (
    <Box
      className={cx(S.QueryEditorContainer, { [S.isHidden]: !isActive })}
      {...props}
    />
  );
};

const SMOOTH_RESIZE_STYLE = { transition: "height 0.25s" };

const propTypes = {
  question: PropTypes.object.isRequired,
  isActive: PropTypes.bool.isRequired, // if QB mode is set to "query"
  height: PropTypes.number.isRequired,
  onSetDatabaseId: PropTypes.func,
};

function DatasetQueryEditorInner({
  question,
  isActive,
  height,
  onSetDatabaseId,
  ...props
}) {
  const { isNative } = Lib.queryDisplayInfo(question.query());

  const [isResizing, setResizing] = useState(false);

  const resizableBoxProps = useMemo(() => {
    // Disables resizing by removing a handle in "columns" mode
    const resizeHandles = isActive ? ["s"] : [];

    // The editor can change its size in two cases:
    // 1. By manually resizing the window with a handle
    // 2. Automatically when editor mode is changed between "query" and "columns"
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
      {isNative ? (
        <NativeQueryEditor
          {...props}
          question={question}
          query={question.legacyNativeQuery()} // memoized query
          isInitiallyOpen
          hasTopBar={isActive}
          hasEditingSidebar={isActive}
          hasParametersList={false}
          resizableBoxProps={resizableBoxProps}
          onSetDatabaseId={onSetDatabaseId}
        />
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

DatasetQueryEditorInner.propTypes = propTypes;

export const DatasetQueryEditor = memo(DatasetQueryEditorInner);
