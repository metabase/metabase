import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Button from "metabase/components/Button";
import DebouncedFrame from "metabase/components/DebouncedFrame";
import EditBar from "metabase/components/EditBar";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";

import ResizableNotebook from "./ResizableNotebook";
import {
  Root,
  MainContainer,
  QueryEditorContainer,
  TableContainer,
} from "./DatasetEditor.styled";

const propTypes = {
  question: PropTypes.object.isRequired,
  height: PropTypes.number,
  setQueryBuilderMode: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  handleResize: PropTypes.func.isRequired,
};

const INITIAL_NOTEBOOK_EDITOR_HEIGHT = 500;

function DatasetEditor(props) {
  const {
    question: dataset,
    height,
    setQueryBuilderMode,
    handleResize,
  } = props;

  const onCancel = () => {
    setQueryBuilderMode("view");
  };

  const onSave = async () => {
    await props.onSave(dataset.card());
    setQueryBuilderMode("view");
  };

  return (
    <React.Fragment>
      <EditBar
        title={`You're editing ${dataset.displayName()}`}
        buttons={[
          <Button key="cancel" onClick={onCancel} small>{t`Cancel`}</Button>,
          <Button key="save" onClick={onSave} small>{t`Save changes`}</Button>,
        ]}
      />
      <Root>
        <MainContainer>
          <QueryEditorContainer>
            {dataset.isNative() ? (
              <NativeQueryEditor
                {...props}
                isInitiallyOpen
                viewHeight={height}
                hasParametersList={false}
              />
            ) : (
              <ResizableNotebook
                {...props}
                height={INITIAL_NOTEBOOK_EDITOR_HEIGHT}
                onResizeStop={handleResize}
              />
            )}
          </QueryEditorContainer>
          <TableContainer>
            <DebouncedFrame className="flex-full" enabled={false}>
              <QueryVisualization {...props} className="spread" noHeader />
            </DebouncedFrame>
          </TableContainer>
        </MainContainer>
      </Root>
    </React.Fragment>
  );
}

DatasetEditor.propTypes = propTypes;

export default DatasetEditor;
