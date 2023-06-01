import { useEffect, useCallback, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import { merge } from "icepick";
import { usePrevious } from "react-use";

import ActionButton from "metabase/components/ActionButton";
import Button from "metabase/core/components/Button";
import DebouncedFrame from "metabase/components/DebouncedFrame";
import Confirm from "metabase/components/Confirm";

import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import ViewSidebar from "metabase/query_builder/components/view/ViewSidebar";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import TagEditorSidebar from "metabase/query_builder/components/template_tags/TagEditorSidebar";
import SnippetSidebar from "metabase/query_builder/components/template_tags/SnippetSidebar";
import { calcInitialEditorHeight } from "metabase/query_builder/components/NativeQueryEditor/utils";

import { modelIndexes } from "metabase/entities";

import { setDatasetEditorTab } from "metabase/query_builder/actions";
import {
  getDatasetEditorTab,
  getResultsMetadata,
  isResultsMetadataDirty,
} from "metabase/query_builder/selectors";
import { getMetadata } from "metabase/selectors/metadata";

import { getSemanticTypeIcon } from "metabase/lib/schema_metadata";
import { useToggle } from "metabase/hooks/use-toggle";

import { MODAL_TYPES } from "metabase/query_builder/constants";
import { isSameField } from "metabase-lib/queries/utils/field-ref";
import {
  checkCanBeModel,
  getSortedModelFields,
} from "metabase-lib/metadata/utils/models";
import { EDITOR_TAB_INDEXES } from "./constants";
import DatasetFieldMetadataSidebar from "./DatasetFieldMetadataSidebar";
import DatasetQueryEditor from "./DatasetQueryEditor";
import EditorTabs from "./EditorTabs";
import { TabHintToast } from "./TabHintToast";

import {
  Root,
  DatasetEditBar,
  FieldTypeIcon,
  MainContainer,
  QueryEditorContainer,
  TableHeaderColumnName,
  TableContainer,
  TabHintToastContainer,
} from "./DatasetEditor.styled";

const propTypes = {
  question: PropTypes.object.isRequired,
  datasetEditorTab: PropTypes.oneOf(["query", "metadata"]).isRequired,
  metadata: PropTypes.object,
  resultsMetadata: PropTypes.shape({ columns: PropTypes.array }),
  isMetadataDirty: PropTypes.bool.isRequired,
  result: PropTypes.object,
  height: PropTypes.number,
  isDirty: PropTypes.bool.isRequired,
  isRunning: PropTypes.bool.isRequired,
  setQueryBuilderMode: PropTypes.func.isRequired,
  setDatasetEditorTab: PropTypes.func.isRequired,
  setFieldMetadata: PropTypes.func.isRequired,
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
    datasetEditorTab: getDatasetEditorTab(state),
    isMetadataDirty: isResultsMetadataDirty(state),
    resultsMetadata: getResultsMetadata(state),
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
        modelIndexes={modelIndexes}
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

const FIELDS = [
  "id",
  "display_name",
  "description",
  "semantic_type",
  "fk_target_field_id",
  "visibility_type",
  "settings",
];

function DatasetEditor(props) {
  const {
    question: dataset,
    datasetEditorTab,
    result,
    resultsMetadata,
    metadata,
    isMetadataDirty,
    height,
    isDirty: isModelQueryDirty,
    setQueryBuilderMode,
    runQuestionQuery,
    setDatasetEditorTab,
    setFieldMetadata,
    onCancelDatasetChanges,
    onCancelCreateNewModel,
    onSave,
    handleResize,
    onOpenModal,
    modelIndexes = [],
  } = props;

  const fields = useMemo(
    () => getSortedModelFields(dataset, resultsMetadata?.columns),
    [dataset, resultsMetadata],
  );

  const isEditingQuery = datasetEditorTab === "query";
  const isEditingMetadata = datasetEditorTab === "metadata";

  const initialEditorHeight = useMemo(() => {
    if (dataset.isStructured()) {
      return INITIAL_NOTEBOOK_EDITOR_HEIGHT;
    }
    return calcInitialEditorHeight({
      query: dataset.query(),
      viewHeight: height,
    });
  }, [dataset, height]);

  const [editorHeight, setEditorHeight] = useState(
    isEditingQuery ? initialEditorHeight : 0,
  );

  const [focusedFieldRef, setFocusedFieldRef] = useState();

  const focusedFieldIndex = useMemo(() => {
    if (!focusedFieldRef) {
      return -1;
    }
    return fields.findIndex(field =>
      isSameField(focusedFieldRef, field.field_ref),
    );
  }, [focusedFieldRef, fields]);

  const previousFocusedFieldIndex = usePrevious(focusedFieldIndex);

  const focusedField = useMemo(() => {
    const field = fields[focusedFieldIndex];
    if (field) {
      const fieldMetadata = metadata?.field?.(field.id, field.table_id);
      return {
        ...fieldMetadata,
        ...field,
      };
    }
  }, [focusedFieldIndex, fields, metadata]);

  const focusFirstField = useCallback(() => {
    const [firstField] = fields;
    setFocusedFieldRef(firstField?.field_ref);
  }, [fields, setFocusedFieldRef]);

  useEffect(() => {
    // Focused field has to be set once the query is completed and the result is rendered
    // Visualization render can remove the focus
    const hasQueryResults = !!result;
    if (!focusedField && hasQueryResults && !result.error) {
      focusFirstField();
    }
  }, [result, focusedFieldRef, fields, focusFirstField, focusedField]);

  const inheritMappedFieldProperties = useCallback(
    changes => {
      const mappedField = metadata.field?.(changes.id)?.getPlainObject();
      const inheritedProperties = _.pick(mappedField, ...FIELDS);
      return mappedField ? merge(inheritedProperties, changes) : changes;
    },
    [metadata],
  );

  const onFieldMetadataChange = useCallback(
    _changes => {
      const changes = _changes.id
        ? inheritMappedFieldProperties(_changes)
        : _changes;
      setFieldMetadata({ field_ref: focusedFieldRef, changes });
    },
    [focusedFieldRef, setFieldMetadata, inheritMappedFieldProperties],
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

  const handleCancelCreate = useCallback(() => {
    onCancelCreateNewModel();
  }, [onCancelCreateNewModel]);

  const handleCancelEdit = useCallback(() => {
    onCancelDatasetChanges();
    setQueryBuilderMode("view");
  }, [setQueryBuilderMode, onCancelDatasetChanges]);

  const handleSave = useCallback(async () => {
    const canBeDataset = checkCanBeModel(dataset);
    const isBrandNewDataset = !dataset.id();

    if (canBeDataset && isBrandNewDataset) {
      onOpenModal(MODAL_TYPES.SAVE);
    } else if (canBeDataset) {
      await onSave(dataset, { rerunQuery: false });
      await setQueryBuilderMode("view");
      runQuestionQuery();
    } else {
      onOpenModal(MODAL_TYPES.CAN_NOT_CREATE_MODEL);
      throw new Error(t`Variables in models aren't supported yet`);
    }
  }, [dataset, onSave, setQueryBuilderMode, runQuestionQuery, onOpenModal]);

  const handleColumnSelect = useCallback(
    column => {
      setFocusedFieldRef(column.field_ref);
    },
    [setFocusedFieldRef],
  );

  const handleTableElementClick = useCallback(
    ({ element, ...clickedObject }) => {
      const isColumnClick =
        clickedObject?.column && Object.keys(clickedObject)?.length === 1;

      if (isColumnClick) {
        setFocusedFieldRef(clickedObject.column.field_ref);
      }
    },
    [setFocusedFieldRef],
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

  const canSaveChanges = useMemo(() => {
    if (dataset.query().isEmpty()) {
      return false;
    }
    const hasFieldWithoutDisplayName = fields.some(f => !f.display_name);
    return (
      !hasFieldWithoutDisplayName && (isModelQueryDirty || isMetadataDirty)
    );
  }, [dataset, fields, isModelQueryDirty, isMetadataDirty]);

  const sidebar = getSidebar(
    { ...props, modelIndexes },
    {
      datasetEditorTab,
      isQueryError: result?.error,
      focusedField,
      focusedFieldIndex,
      focusFirstField,
      onFieldMetadataChange,
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
            onChange={onChangeEditorTab}
            options={[
              { id: "query", name: t`Query`, icon: "notebook" },
              {
                id: "metadata",
                name: t`Metadata`,
                icon: "label",
                disabled: !resultsMetadata,
              },
            ]}
          />
        }
        buttons={[
          dataset.isSaved() ? (
            <Button
              key="cancel"
              small
              onClick={handleCancelEdit}
            >{t`Cancel`}</Button>
          ) : (
            <Confirm
              key="cancel"
              action={handleCancelCreate}
              title={t`Discard changes?`}
              message={t`Your model won't be created.`}
              confirmButtonText={t`Discard`}
            >
              <Button small>{t`Cancel`}</Button>
            </Confirm>
          ),
          <ActionButton
            key="save"
            disabled={!canSaveChanges}
            actionFn={handleSave}
            normalText={dataset.isSaved() ? t`Save changes` : t`Save`}
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
