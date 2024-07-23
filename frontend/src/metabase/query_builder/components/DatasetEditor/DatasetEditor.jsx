import cx from "classnames";
import { merge } from "icepick";
import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import { usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import ActionButton from "metabase/components/ActionButton";
import DebouncedFrame from "metabase/components/DebouncedFrame";
import { LeaveConfirmationModalContent } from "metabase/components/LeaveConfirmationModal";
import Modal from "metabase/components/Modal";
import Button from "metabase/core/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { modelIndexes } from "metabase/entities";
import { useToggle } from "metabase/hooks/use-toggle";
import { getSemanticTypeIcon } from "metabase/lib/schema_metadata";
import { setDatasetEditorTab } from "metabase/query_builder/actions";
import { calcInitialEditorHeight } from "metabase/query_builder/components/NativeQueryEditor/utils";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import { SnippetSidebar } from "metabase/query_builder/components/template_tags/SnippetSidebar/SnippetSidebar";
import { TagEditorSidebar } from "metabase/query_builder/components/template_tags/TagEditorSidebar";
import ViewSidebar from "metabase/query_builder/components/view/ViewSidebar";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import {
  getDatasetEditorTab,
  getIsResultDirty,
  getMetadataDiff,
  getResultsMetadata,
  getVisualizationSettings,
  isResultsMetadataDirty,
} from "metabase/query_builder/selectors";
import { getWritableColumnProperties } from "metabase/query_builder/utils";
import { getMetadata } from "metabase/selectors/metadata";
import { Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import {
  checkCanBeModel,
  getSortedModelFields,
} from "metabase-lib/v1/metadata/utils/models";

import {
  DatasetEditBar,
  FieldTypeIcon,
  MainContainer,
  QueryEditorContainer,
  Root,
  TabHintToastContainer,
  TableContainer,
  TableHeaderColumnName,
} from "./DatasetEditor.styled";
import DatasetFieldMetadataSidebar from "./DatasetFieldMetadataSidebar";
import DatasetQueryEditor from "./DatasetQueryEditor";
import { EditorTabs } from "./EditorTabs";
import { TabHintToast } from "./TabHintToast";
import { EDITOR_TAB_INDEXES } from "./constants";

const propTypes = {
  question: PropTypes.object.isRequired,
  visualizationSettings: PropTypes.object,
  datasetEditorTab: PropTypes.oneOf(["query", "metadata"]).isRequired,
  metadata: PropTypes.object,
  metadataDiff: PropTypes.object.isRequired,
  resultsMetadata: PropTypes.shape({ columns: PropTypes.array }),
  isMetadataDirty: PropTypes.bool.isRequired,
  result: PropTypes.object,
  height: PropTypes.number,
  isDirty: PropTypes.bool.isRequired,
  isResultDirty: PropTypes.bool.isRequired,
  isRunning: PropTypes.bool.isRequired,
  setQueryBuilderMode: PropTypes.func.isRequired,
  setDatasetEditorTab: PropTypes.func.isRequired,
  setMetadataDiff: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onCancelCreateNewModel: PropTypes.func.isRequired,
  onCancelDatasetChanges: PropTypes.func.isRequired,
  handleResize: PropTypes.func.isRequired,
  runQuestionQuery: PropTypes.func.isRequired,
  onOpenModal: PropTypes.func.isRequired,
  modelIndexes: PropTypes.array.isRequired,

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
    metadata: getMetadata(state),
    metadataDiff: getMetadataDiff(state),
    visualizationSettings: getVisualizationSettings(state),
    datasetEditorTab: getDatasetEditorTab(state),
    isMetadataDirty: isResultsMetadataDirty(state),
    resultsMetadata: getResultsMetadata(state),
    isResultDirty: getIsResultDirty(state),
  };
}

const mapDispatchToProps = { setDatasetEditorTab };

function getSidebar(
  props,
  {
    datasetEditorTab,
    isQueryError,
    focusedField,
    focusedFieldIndex,
    focusFirstField,
    onFieldMetadataChange,
    onMappedDatabaseColumnChange,
  },
) {
  const {
    question: dataset,
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
    toggleTemplateTagsEditor,
    toggleDataReference,
    toggleSnippetSidebar,
    modelIndexes,
  } = props;

  if (datasetEditorTab === "metadata") {
    if (isQueryError) {
      return null;
    }
    if (!focusedField) {
      // Returning a div, so the sidebar is visible while the data is loading.
      // The field metadata sidebar will appear with an animation once a query completes
      return <div />;
    }
    const isLastField =
      focusedFieldIndex === dataset.getResultMetadata().length - 1;
    return (
      <DatasetFieldMetadataSidebar
        dataset={dataset}
        field={focusedField}
        isLastField={isLastField}
        handleFirstFieldFocus={focusFirstField}
        onFieldMetadataChange={onFieldMetadataChange}
        onMappedDatabaseColumnChange={onMappedDatabaseColumnChange}
        modelIndexes={modelIndexes}
      />
    );
  }

  const { isNative } = Lib.queryDisplayInfo(dataset.query());

  if (!isNative) {
    return null;
  }

  if (isShowingTemplateTagsEditor) {
    return (
      <TagEditorSidebar
        {...props}
        query={dataset.legacyQuery()}
        onClose={toggleTemplateTagsEditor}
      />
    );
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
    metadataDiff,
    visualizationSettings,
    datasetEditorTab,
    result,
    resultsMetadata,
    metadata,
    isMetadataDirty,
    height,
    isDirty: isModelQueryDirty,
    isResultDirty,
    setQueryBuilderMode,
    runQuestionQuery,
    setDatasetEditorTab,
    setMetadataDiff,
    onCancelDatasetChanges,
    onCancelCreateNewModel,
    onSave,
    handleResize,
    onOpenModal,
    modelIndexes = [],
  } = props;

  const isDirty = isModelQueryDirty || isMetadataDirty;
  const [showCancelEditWarning, setShowCancelEditWarning] = useState(false);
  const fields = useMemo(
    () =>
      getSortedModelFields(
        resultsMetadata?.columns ?? [],
        visualizationSettings ?? {},
      ),
    [resultsMetadata, visualizationSettings],
  );

  const isEditingQuery = datasetEditorTab === "query";
  const isEditingMetadata = datasetEditorTab === "metadata";

  const initialEditorHeight = useMemo(() => {
    const { isNative } = Lib.queryDisplayInfo(dataset.query());

    if (!isNative) {
      return INITIAL_NOTEBOOK_EDITOR_HEIGHT;
    }
    return calcInitialEditorHeight({
      query: dataset.legacyQuery(),
      viewHeight: height,
    });
  }, [dataset, height]);

  const [editorHeight, setEditorHeight] = useState(
    isEditingQuery ? initialEditorHeight : 0,
  );

  const [focusedFieldName, setFocusedFieldName] = useState();

  const focusedFieldIndex = useMemo(() => {
    if (!focusedFieldName) {
      return -1;
    }
    return fields.findIndex(field => field.name === focusedFieldName);
  }, [focusedFieldName, fields]);

  const previousFocusedFieldIndex = usePrevious(focusedFieldIndex);

  const focusedField = fields[focusedFieldIndex];

  const focusFirstField = useCallback(() => {
    const [firstField] = fields;
    setFocusedFieldName(firstField?.name);
  }, [fields, setFocusedFieldName]);

  useEffect(() => {
    // Focused field has to be set once the query is completed and the result is rendered
    // Visualization render can remove the focus
    const hasQueryResults = !!result;
    if (!focusedField && hasQueryResults && !result.error) {
      focusFirstField();
    }
  }, [result, focusedFieldName, fields, focusFirstField, focusedField]);

  const inheritMappedFieldProperties = useCallback(
    changes => {
      const mappedField = metadata.field?.(changes.id)?.getPlainObject();
      const inheritedProperties =
        mappedField && getWritableColumnProperties(mappedField);
      return mappedField ? merge(inheritedProperties, changes) : changes;
    },
    [metadata],
  );

  const onFieldMetadataChange = useCallback(
    values => {
      setMetadataDiff({ name: focusedFieldName, changes: values });
    },
    [focusedFieldName, setMetadataDiff],
  );

  const onMappedDatabaseColumnChange = useCallback(
    value => {
      const changes = inheritMappedFieldProperties({ id: value });
      setMetadataDiff({ name: focusedFieldName, changes });
    },
    [focusedFieldName, setMetadataDiff, inheritMappedFieldProperties],
  );

  const [isTabHintVisible, { turnOn: showTabHint, turnOff: hideTabHint }] =
    useToggle(false);

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
      setEditorHeight(tab === "query" ? initialEditorHeight : 0);
    },
    [initialEditorHeight, setDatasetEditorTab],
  );

  const handleCancelEdit = () => {
    setShowCancelEditWarning(false);
    onCancelDatasetChanges();
    setQueryBuilderMode("view");
  };

  const handleCancelEditWarningClose = () => {
    setShowCancelEditWarning(false);
  };

  const handleCancelClick = () => {
    if (dataset.isSaved()) {
      if (isDirty) {
        setShowCancelEditWarning(true);
      } else {
        handleCancelEdit();
      }
    } else {
      onCancelCreateNewModel();
    }
  };

  const handleSave = useCallback(async () => {
    const questionWithMetadata = dataset.setResultMetadataDiff(metadataDiff);
    const canBeDataset = checkCanBeModel(questionWithMetadata);
    const isBrandNewDataset = !questionWithMetadata.id();

    if (canBeDataset && isBrandNewDataset) {
      onOpenModal(MODAL_TYPES.SAVE);
    } else if (canBeDataset) {
      await onSave(questionWithMetadata, { rerunQuery: true });
      await setQueryBuilderMode("view");
      runQuestionQuery();
    } else {
      onOpenModal(MODAL_TYPES.CAN_NOT_CREATE_MODEL);
      throw new Error(t`Variables in models aren't supported yet`);
    }
  }, [
    dataset,
    metadataDiff,
    onSave,
    setQueryBuilderMode,
    runQuestionQuery,
    onOpenModal,
  ]);

  const handleColumnSelect = useCallback(
    column => {
      setFocusedFieldName(column.name);
    },
    [setFocusedFieldName],
  );

  const handleTableElementClick = useCallback(
    ({ element, ...clickedObject }) => {
      const isColumnClick =
        clickedObject?.column && Object.keys(clickedObject)?.length === 1;

      if (isColumnClick) {
        setFocusedFieldName(clickedObject.column.name);
      }
    },
    [setFocusedFieldName],
  );

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
    (element, column, columnIndex) => {
      const isSelected = columnIndex === focusedFieldIndex;
      return (
        <TableHeaderColumnName
          tabIndex={getColumnTabIndex(columnIndex, focusedFieldIndex)}
          onFocus={() => handleColumnSelect(column)}
          isSelected={isSelected}
        >
          <FieldTypeIcon
            name={getSemanticTypeIcon(column.semantic_type, "ellipsis")}
            isSelected={isSelected}
          />
          <span>{column.display_name}</span>
        </TableHeaderColumnName>
      );
    },
    [focusedFieldIndex, handleColumnSelect],
  );

  const renderTableHeaderWrapper = useMemo(
    () =>
      datasetEditorTab === "metadata"
        ? renderSelectableTableColumnHeader
        : undefined,
    [datasetEditorTab, renderSelectableTableColumnHeader],
  );

  const { isNative } = Lib.queryDisplayInfo(dataset.query());

  const canSaveChanges =
    isDirty &&
    (!isNative || !isResultDirty) &&
    fields.every(field => field.display_name) &&
    Lib.canSave(dataset.query());

  const saveButtonTooltipLabel =
    isDirty &&
    isNative &&
    isResultDirty &&
    Lib.rawNativeQuery(dataset.query()).length > 0
      ? t`You must run the query before you can save this model`
      : undefined;

  const sidebar = getSidebar(
    { ...props, modelIndexes },
    {
      datasetEditorTab,
      isQueryError: result?.error,
      focusedField,
      focusedFieldIndex,
      focusFirstField,
      onFieldMetadataChange,
      onMappedDatabaseColumnChange,
    },
  );

  return (
    <>
      <DatasetEditBar
        data-testid="dataset-edit-bar"
        title={dataset.displayName()}
        center={
          <EditorTabs
            currentTab={datasetEditorTab}
            disabledMetadata={!resultsMetadata}
            onChange={onChangeEditorTab}
          />
        }
        buttons={[
          <Button
            key="cancel"
            small
            onClick={handleCancelClick}
          >{t`Cancel`}</Button>,
          <Tooltip
            key="save"
            refProp="innerRef"
            label={saveButtonTooltipLabel}
            disabled={!saveButtonTooltipLabel}
          >
            <ActionButton
              key="save"
              disabled={!canSaveChanges}
              actionFn={handleSave}
              normalText={dataset.isSaved() ? t`Save changes` : t`Save`}
              activeText={t`Saving…`}
              failedText={t`Save failed`}
              successText={t`Saved`}
              className={cx(
                ButtonsS.Button,
                ButtonsS.ButtonPrimary,
                ButtonsS.ButtonSmall,
              )}
            />
          </Tooltip>,
        ]}
      />
      <Root>
        <MainContainer>
          <QueryEditorContainer isResizable={isEditingQuery}>
            {/**
             * Optimization: DatasetQueryEditor can be expensive to re-render
             * and we don't need it on the "Metadata" tab.
             *
             * @see https://github.com/metabase/metabase/pull/31142/files#r1211352364
             */}
            {isEditingQuery && editorHeight > 0 && (
              <DatasetQueryEditor
                {...props}
                isActive={isEditingQuery}
                height={editorHeight}
                viewHeight={height}
                onResizeStop={handleResize}
              />
            )}
          </QueryEditorContainer>
          <TableContainer isSidebarOpen={!!sidebar}>
            <DebouncedFrame className={cx(CS.flexFull)} enabled>
              <QueryVisualization
                {...props}
                className={CS.spread}
                noHeader
                queryBuilderMode="dataset"
                isShowingDetailsOnlyColumns={datasetEditorTab === "metadata"}
                hasMetadataPopovers={false}
                handleVisualizationClick={handleTableElementClick}
                tableHeaderHeight={isEditingMetadata && TABLE_HEADER_HEIGHT}
                renderTableHeaderWrapper={renderTableHeaderWrapper}
                scrollToColumn={focusedFieldIndex + scrollToColumnModifier}
              />
            </DebouncedFrame>
            <TabHintToastContainer
              isVisible={isEditingMetadata && isTabHintVisible && !result.error}
            >
              <TabHintToast onClose={hideTabHint} />
            </TabHintToastContainer>
          </TableContainer>
        </MainContainer>
        <ViewSidebar side="right" isOpen={!!sidebar}>
          {sidebar}
        </ViewSidebar>
      </Root>

      <Modal isOpen={showCancelEditWarning}>
        <LeaveConfirmationModalContent
          onAction={handleCancelEdit}
          onClose={handleCancelEditWarningClose}
        />
      </Modal>
    </>
  );
}

DatasetEditor.propTypes = propTypes;

export default _.compose(
  modelIndexes.loadList({
    query: (_state, props) => ({ model_id: props?.question?.id() }),
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(DatasetEditor);
