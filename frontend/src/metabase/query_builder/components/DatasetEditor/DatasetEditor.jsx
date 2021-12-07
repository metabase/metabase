import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import ActionButton from "metabase/components/ActionButton";
import Button from "metabase/components/Button";
import DebouncedFrame from "metabase/components/DebouncedFrame";
import Icon from "metabase/components/Icon";

import QueryVisualization from "metabase/query_builder/components/QueryVisualization";

import ViewSidebar from "metabase/query_builder/components/view/ViewSidebar";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import TagEditorSidebar from "metabase/query_builder/components/template_tags/TagEditorSidebar";
import SnippetSidebar from "metabase/query_builder/components/template_tags/SnippetSidebar";

import { setDatasetEditorTab } from "metabase/query_builder/actions";
import { getDatasetEditorTab } from "metabase/query_builder/selectors";

import DatasetFieldMetadataSidebar from "./DatasetFieldMetadataSidebar";
import DatasetQueryEditor from "./DatasetQueryEditor";
import EditorTabs from "./EditorTabs";

import {
  Root,
  DatasetEditBar,
  MainContainer,
  QueryEditorContainer,
  TableHeaderColumnName,
  TableContainer,
} from "./DatasetEditor.styled";

const propTypes = {
  question: PropTypes.object.isRequired,
  datasetEditorTab: PropTypes.oneOf(["query", "metadata"]).isRequired,
  height: PropTypes.number,
  setQueryBuilderMode: PropTypes.func.isRequired,
  setDatasetEditorTab: PropTypes.func.isRequired,
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
const TABLE_HEADER_HEIGHT = 45;

const isSameField = (f1, f2) => {
  if (!f1 || !f2) {
    return false;
  }
  const canCompareIDs = f1.id != null && f2.id != null;
  return canCompareIDs
    ? f1.id === f2.id
    : _.isEqual(f1.field_ref, f2.field_ref);
};

function mapStateToProps(state) {
  return {
    datasetEditorTab: getDatasetEditorTab(state),
  };
}

const mapDispatchToProps = { setDatasetEditorTab };

function getSidebar(props, { datasetEditorTab, focusedField }) {
  const {
    question: dataset,
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
    toggleTemplateTagsEditor,
    toggleDataReference,
    toggleSnippetSidebar,
  } = props;

  if (datasetEditorTab === "metadata") {
    return <DatasetFieldMetadataSidebar field={focusedField} />;
  }

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
    datasetEditorTab,
    height,
    setQueryBuilderMode,
    setDatasetEditorTab,
    onCancelDatasetChanges,
    handleResize,
  } = props;

  const isEditingQuery = datasetEditorTab === "query";
  const isEditingMetadata = datasetEditorTab === "metadata";

  const [editorHeight, setEditorHeight] = useState(
    isEditingQuery ? INITIAL_NOTEBOOK_EDITOR_HEIGHT : 0,
  );

  const [focusedField, setFocusedField] = useState();

  useEffect(() => {
    const resultMetadata = dataset.getResultMetadata();
    if (!focusedField && resultMetadata?.length > 0) {
      setFocusedField(resultMetadata[0]);
    }
  }, [dataset, focusedField]);

  const onChangeEditorTab = tab => {
    setDatasetEditorTab(tab);
    setEditorHeight(tab === "query" ? INITIAL_NOTEBOOK_EDITOR_HEIGHT : 0);
  };

  const onCancel = () => {
    onCancelDatasetChanges();
    setQueryBuilderMode("view");
  };

  const onSave = async () => {
    await props.onSave(dataset.card());
    setQueryBuilderMode("view");
  };

  const sidebar = getSidebar(props, { datasetEditorTab, focusedField });

  const handleTableElementClick = ({ element, ...clickedObject }) => {
    const isColumnClick =
      clickedObject?.column && Object.keys(clickedObject)?.length === 1;

    if (isColumnClick) {
      const field = dataset
        .getResultMetadata()
        .find(f => isSameField(clickedObject.column, f));
      setFocusedField(field);
    }
  };

  const renderSelectableTableColumnHeader = (element, column) => (
    <TableHeaderColumnName
      isSelected={isSameField(column, focusedField)}
      onClick={() => handleTableElementClick({ column })}
    >
      <Icon name="three_dots" size={14} />
      <span>{column.display_name}</span>
    </TableHeaderColumnName>
  );

  const renderTableHeaderWrapper = isEditingMetadata
    ? renderSelectableTableColumnHeader
    : undefined;

  return (
    <React.Fragment>
      <DatasetEditBar
        title={t`You're editing ${dataset.displayName()}`}
        center={
          <EditorTabs
            currentTab={datasetEditorTab}
            onChange={onChangeEditorTab}
            options={[
              { id: "query", name: t`Query`, icon: "notebook" },
              { id: "metadata", name: t`Metadata`, icon: "label" },
            ]}
          />
        }
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
          <QueryEditorContainer isResizable={isEditingQuery}>
            <DatasetQueryEditor
              {...props}
              isActive={isEditingQuery}
              height={editorHeight}
              viewHeight={height}
              onResizeStop={handleResize}
            />
          </QueryEditorContainer>
          <TableContainer isSidebarOpen={!!sidebar}>
            <DebouncedFrame className="flex-full" enabled>
              <QueryVisualization
                {...props}
                className="spread"
                noHeader
                handleVisualizationClick={handleTableElementClick}
                tableHeaderHeight={isEditingMetadata && TABLE_HEADER_HEIGHT}
                renderTableHeaderWrapper={renderTableHeaderWrapper}
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

export default connect(mapStateToProps, mapDispatchToProps)(DatasetEditor);
