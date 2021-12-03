import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import ActionButton from "metabase/components/ActionButton";
import Button from "metabase/components/Button";
import DebouncedFrame from "metabase/components/DebouncedFrame";
import EditBar from "metabase/components/EditBar";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";

import ViewSidebar from "metabase/query_builder/components/view/ViewSidebar";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import TagEditorSidebar from "metabase/query_builder/components/template_tags/TagEditorSidebar";
import SnippetSidebar from "metabase/query_builder/components/template_tags/SnippetSidebar";

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
  onCancelDatasetChanges: PropTypes.func.isRequired,
  handleResize: PropTypes.func.isRequired,

  // Native editor sidebars
  isShowingTemplateTagsEditor: PropTypes.bool.isRequired,
  isShowingDataReference: PropTypes.bool.isRequired,
  isShowingSnippetSidebar: PropTypes.bool.isRequired,
  toggleTemplateTagsEditor: PropTypes.func.isRequired,
  toggleDataReference: PropTypes.func.isRequired,
  toggleSnippetSidebar: PropTypes.func.isRequired,
};

const INITIAL_NOTEBOOK_EDITOR_HEIGHT = 500;

function getSidebar(props) {
  const {
    question: dataset,
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
    toggleTemplateTagsEditor,
    toggleDataReference,
    toggleSnippetSidebar,
  } = props;
  if (!dataset.isNative()) {
    return null;
  }
  if (isShowingTemplateTagsEditor) {
    return <TagEditorSidebar {...props} onClose={toggleTemplateTagsEditor} />;
  }
  if (isShowingDataReference) {
    return <DataReference {...props} onClose={toggleDataReference} />;
  }
  if (isShowingSnippetSidebar) {
    return <SnippetSidebar {...props} onClose={toggleSnippetSidebar} />;
  }
  return null;
}

function DatasetEditor(props) {
  const {
    question: dataset,
    height,
    setQueryBuilderMode,
    onCancelDatasetChanges,
    handleResize,
  } = props;

  const onCancel = () => {
    onCancelDatasetChanges();
    setQueryBuilderMode("view");
  };

  const onSave = async () => {
    await props.onSave(dataset.card());
    setQueryBuilderMode("view");
  };

  const sidebar = getSidebar(props);

  return (
    <React.Fragment>
      <EditBar
        title={t`You're editing ${dataset.displayName()}`}
        buttons={[
          <Button key="cancel" onClick={onCancel} small>{t`Cancel`}</Button>,
          <ActionButton
            key="save"
            actionFn={onSave}
            normalText={t`Save changes`}
            activeText={t`Saving…`}
            failedText={t`Save failed`}
            successText={t`Saved`}
            className="Button Button--primary Button--small"
          />,
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
          <TableContainer isSidebarOpen={!!sidebar}>
            <DebouncedFrame className="flex-full" enabled={false}>
              <QueryVisualization
                {...props}
                className="spread"
                noHeader
                isVisualizationClickable={false}
              />
            </DebouncedFrame>
          </TableContainer>
        </MainContainer>
        <ViewSidebar side="right" isOpen={!!sidebar}>
          {sidebar}
        </ViewSidebar>
      </Root>
    </React.Fragment>
  );
}

DatasetEditor.propTypes = propTypes;

export default DatasetEditor;
