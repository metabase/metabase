import React, { useEffect, useCallback, useMemo, useState } from "react";
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

import { isSameField } from "metabase/lib/query/field_ref";
import { usePrevious } from "metabase/hooks/use-previous";
import { useToggle } from "metabase/hooks/use-toggle";

import { EDITOR_TAB_INDEXES } from "./constants";
import DatasetFieldMetadataSidebar from "./DatasetFieldMetadataSidebar";
import DatasetQueryEditor from "./DatasetQueryEditor";
import EditorTabs from "./EditorTabs";
import { TabHintToast } from "./TabHintToast";

import {
  Root,
  DatasetEditBar,
  MainContainer,
  QueryEditorContainer,
  TableHeaderColumnName,
  TableContainer,
  TabHintToastContainer,
} from "./DatasetEditor.styled";

const propTypes = {
  question: PropTypes.object.isRequired,
  datasetEditorTab: PropTypes.oneOf(["query", "metadata"]).isRequired,
  result: PropTypes.object,
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

function mapStateToProps(state) {
  return {
    datasetEditorTab: getDatasetEditorTab(state),
  };
}

const mapDispatchToProps = { setDatasetEditorTab };

function getSidebar(
  props,
  { datasetEditorTab, focusedField, focusedFieldIndex, focusFirstField },
) {
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
    const isLastField =
      focusedField &&
      focusedFieldIndex === dataset.getResultMetadata().length - 1;
    return (
      <DatasetFieldMetadataSidebar
        dataset={dataset}
        field={focusedField}
        isLastField={isLastField}
        handleFirstFieldFocus={focusFirstField}
      />
    );
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

function getColumnTabIndex(columnIndex, focusedFieldIndex) {
  return columnIndex === focusedFieldIndex
    ? EDITOR_TAB_INDEXES.FOCUSED_FIELD
    : columnIndex > focusedFieldIndex
    ? EDITOR_TAB_INDEXES.NEXT_FIELDS
    : EDITOR_TAB_INDEXES.PREVIOUS_FIELDS;
}

function DatasetEditor(props) {
  const {
    question: dataset,
    datasetEditorTab,
    result,
    height,
    setQueryBuilderMode,
    setDatasetEditorTab,
    onCancelDatasetChanges,
    onSave,
    handleResize,
  } = props;

  const isEditingQuery = datasetEditorTab === "query";
  const isEditingMetadata = datasetEditorTab === "metadata";

  const [editorHeight, setEditorHeight] = useState(
    isEditingQuery ? INITIAL_NOTEBOOK_EDITOR_HEIGHT : 0,
  );

  const [focusedField, setFocusedField] = useState();

  const focusFirstField = useCallback(() => {
    const [firstField] = dataset.getResultMetadata() || [];
    setFocusedField(firstField);
  }, [dataset]);

  useEffect(() => {
    // Focused field has to be set once the query is completed and the result is rendered
    // Visualization render can remove the focus
    const hasQueryResults = !!result;
    if (!focusedField && hasQueryResults) {
      focusFirstField();
    }
  }, [result, focusedField, focusFirstField]);

  const [
    isTabHintVisible,
    { turnOn: showTabHint, turnOff: hideTabHint },
  ] = useToggle(false);

  useEffect(() => {
    let timeoutId;
    if (result) {
      timeoutId = setTimeout(() => showTabHint(), 500);
    }
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const onChangeEditorTab = useCallback(
    tab => {
      setDatasetEditorTab(tab);
      setEditorHeight(tab === "query" ? INITIAL_NOTEBOOK_EDITOR_HEIGHT : 0);
    },
    [setDatasetEditorTab],
  );

  const handleCancel = useCallback(() => {
    onCancelDatasetChanges();
    setQueryBuilderMode("view");
  }, [setQueryBuilderMode, onCancelDatasetChanges]);

  const handleSave = useCallback(async () => {
    await onSave(dataset.card());
    setQueryBuilderMode("view");
  }, [dataset, onSave, setQueryBuilderMode]);

  const handleColumnSelect = useCallback(
    column => {
      const field = dataset
        .getResultMetadata()
        .find(f => isSameField(column?.field_ref, f?.field_ref));
      setFocusedField(field);
    },
    [dataset],
  );

  const handleTableElementClick = useCallback(
    ({ element, ...clickedObject }) => {
      const isColumnClick =
        clickedObject?.column && Object.keys(clickedObject)?.length === 1;

      if (isColumnClick) {
        handleColumnSelect(clickedObject.column);
      }
    },
    [handleColumnSelect],
  );

  const focusedFieldIndex = useMemo(() => {
    const fields = dataset.getResultMetadata();
    return fields.findIndex(f =>
      isSameField(focusedField?.field_ref, f?.field_ref),
    );
  }, [dataset, focusedField]);

  const previousFocusedFieldIndex = usePrevious(focusedFieldIndex);

  // This value together with focusedFieldIndex is used to
  // horizontally scroll the InteractiveTable to the focused column
  // (via react-virtualized's "scrollToColumn" prop)
  const scrollToColumnModifier = useMemo(() => {
    // Normally the modifier is either 1 or -1 and added to focusedFieldIndex,
    // so it's either the previous or the next column is visible
    // (depending on if we're tabbing forward or backwards)
    // But when the first field is selected, it's important to keep "scrollToColumn" 0
    // So when you hit "Tab" while the very last column is focused,
    // it'd jump exactly to the beginning of the table
    if (focusedFieldIndex === 0) {
      return 0;
    }
    const isGoingForward = focusedFieldIndex >= previousFocusedFieldIndex;
    return isGoingForward ? 1 : -1;
  }, [focusedFieldIndex, previousFocusedFieldIndex]);

  const renderSelectableTableColumnHeader = useCallback(
    (element, column, columnIndex) => (
      <TableHeaderColumnName
        tabIndex={getColumnTabIndex(columnIndex, focusedFieldIndex)}
        onFocus={() => handleColumnSelect(column)}
        isSelected={isSameField(column?.field_ref, focusedField?.field_ref)}
      >
        <Icon name="three_dots" size={14} />
        <span>{column.display_name}</span>
      </TableHeaderColumnName>
    ),
    [focusedField, focusedFieldIndex, handleColumnSelect],
  );

  const renderTableHeaderWrapper = useMemo(
    () =>
      datasetEditorTab === "metadata"
        ? renderSelectableTableColumnHeader
        : undefined,
    [datasetEditorTab, renderSelectableTableColumnHeader],
  );

  const sidebar = getSidebar(props, {
    datasetEditorTab,
    focusedField,
    focusedFieldIndex,
    focusFirstField,
  });

  return (
    <React.Fragment>
      <DatasetEditBar
        title={dataset.displayName()}
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
          <Button
            key="cancel"
            onClick={handleCancel}
            small
          >{t`Cancel`}</Button>,
          <ActionButton
            key="save"
            actionFn={handleSave}
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
                queryBuilderMode="dataset"
                handleVisualizationClick={handleTableElementClick}
                tableHeaderHeight={isEditingMetadata && TABLE_HEADER_HEIGHT}
                renderTableHeaderWrapper={renderTableHeaderWrapper}
                scrollToColumn={focusedFieldIndex + scrollToColumnModifier}
              />
            </DebouncedFrame>
            <TabHintToastContainer
              isVisible={isEditingMetadata && isTabHintVisible}
            >
              <TabHintToast onClose={hideTabHint} />
            </TabHintToastContainer>
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
