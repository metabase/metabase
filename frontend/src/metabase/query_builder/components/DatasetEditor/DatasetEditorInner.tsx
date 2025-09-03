import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { merge } from "icepick";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMount, usePrevious } from "react-use";
import { t } from "ttag";

import { useListModelIndexesQuery } from "metabase/api";
import ActionButton from "metabase/common/components/ActionButton";
import Button from "metabase/common/components/Button";
import DebouncedFrame from "metabase/common/components/DebouncedFrame";
import EditBar from "metabase/common/components/EditBar";
import { LeaveConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { connect, useDispatch } from "metabase/lib/redux";
import { getSemanticTypeIcon } from "metabase/lib/schema_metadata";
import {
  setDatasetEditorTab,
  setUIControls,
} from "metabase/query_builder/actions";
import { calcInitialEditorHeight } from "metabase/query_builder/components/NativeQueryEditor/utils";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import { SnippetSidebar } from "metabase/query_builder/components/template_tags/SnippetSidebar/SnippetSidebar";
import { TagEditorSidebar } from "metabase/query_builder/components/template_tags/TagEditorSidebar";
import ViewSidebar from "metabase/query_builder/components/view/ViewSidebar";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import {
  getDatasetEditorTab,
  getIsListViewConfigurationShown,
  getIsResultDirty,
  getMetadataDiff,
  getResultsMetadata,
  getVisualizationSettings,
  isResultsMetadataDirty,
} from "metabase/query_builder/selectors";
import { getWritableColumnProperties } from "metabase/query_builder/utils";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Flex, Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import {
  checkCanBeModel,
  getSortedModelFields,
} from "metabase-lib/v1/metadata/utils/models";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  DatasetColumn,
  Field,
  RawSeries,
  ResultsMetadata,
  VisualizationSettings,
} from "metabase-types/api";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

import DatasetEditorS from "./DatasetEditor.module.css";
import {
  DatasetEditorSettingsSidebar,
  type ModelSettings,
} from "./DatasetEditorSettingsSidebar/DatasetEditorSettingsSidebar";
import DatasetFieldMetadataSidebar from "./DatasetFieldMetadataSidebar";
import DatasetQueryEditor from "./DatasetQueryEditor";
import { EditorTabs } from "./EditorTabs";
import { EDITOR_TAB_INDEXES } from "./constants";

type MetadataDiff = Record<string, Partial<Field>>;

export type DatasetEditorInnerProps = {
  question: Question;
  rawSeries: RawSeries | null;
  visualizationSettings?: VisualizationSettings | null;
  datasetEditorTab: DatasetEditorTab;
  metadata?: Metadata;
  metadataDiff: MetadataDiff;
  resultsMetadata?: ResultsMetadata | null;
  isMetadataDirty: boolean;
  result?: { error?: unknown } | null;
  height?: number;
  isDirty: boolean;
  isResultDirty: boolean;
  isRunning: boolean;
  setQueryBuilderMode: (
    mode: QueryBuilderMode,
    opts?: unknown,
  ) => Promise<void> | void;
  runDirtyQuestionQuery: () => void;
  setDatasetEditorTab: (tab: DatasetEditorTab) => void;
  setMetadataDiff: (diff: {
    name: string;
    changes: Partial<DatasetColumn>;
  }) => void;
  onSave: (
    q: Question,
    opts?: { rerunQuery?: boolean },
  ) => Promise<void> | void;
  onCancelCreateNewModel: () => void;
  cancelQuestionChanges: () => void;
  handleResize: (...args: any[]) => void;
  updateQuestion: (q: Question, opts?: unknown) => Promise<void> | void;
  runQuestionQuery: () => void;
  onOpenModal: (type: string) => void;
  isShowingTemplateTagsEditor: boolean;
  isShowingDataReference: boolean;
  isShowingSnippetSidebar: boolean;
  isShowingListViewConfiguration: boolean;
  toggleTemplateTagsEditor: () => void;
  toggleDataReference: () => void;
  toggleSnippetSidebar: () => void;
  forwardedRef?: React.Ref<HTMLDivElement>;
};

const INITIAL_NOTEBOOK_EDITOR_HEIGHT = 500;
const TABLE_HEADER_HEIGHT = 45;

function mapStateToProps(state: any) {
  return {
    metadata: getMetadata(state),
    metadataDiff: getMetadataDiff(state),
    visualizationSettings: getVisualizationSettings(state),
    datasetEditorTab: getDatasetEditorTab(state),
    isMetadataDirty: isResultsMetadataDirty(state),
    resultsMetadata: getResultsMetadata(state),
    isResultDirty: getIsResultDirty(state),
    isShowingListViewConfiguration: getIsListViewConfigurationShown(state),
  };
}

const mapDispatchToProps = { setDatasetEditorTab };

function getSidebar(
  props: DatasetEditorInnerProps & { modelIndexes?: unknown },
  {
    datasetEditorTab,
    isQueryError,
    focusedField,
    focusedFieldIndex,
    focusFirstField,
    onFieldMetadataChange,
    onMappedDatabaseColumnChange,
    onUpdateModelSettings,
    modelSettings,
  }: {
    datasetEditorTab: DatasetEditorTab;
    isQueryError?: unknown;
    focusedField?: DatasetColumn;
    focusedFieldIndex: number;
    focusFirstField: () => void;
    onFieldMetadataChange: (values: Partial<DatasetColumn>) => void;
    onMappedDatabaseColumnChange: (value: number) => void;
    onUpdateModelSettings: (settings: ModelSettings) => void;
    modelSettings: ModelSettings;
  },
): ReactNode {
  const {
    question,
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
    toggleTemplateTagsEditor,
    toggleDataReference,
    toggleSnippetSidebar,
    modelIndexes,
  } = props;

  if (datasetEditorTab === "columns") {
    if (isQueryError) {
      return null;
    }
    if (!focusedField) {
      // Returning a div, so the sidebar is visible while the data is loading.
      // The field metadata sidebar will appear with an animation once a query completes
      return <div />;
    }
    const isLastField =
      focusedFieldIndex === question.getResultMetadata().length - 1;
    return (
      <DatasetFieldMetadataSidebar
        dataset={question}
        field={focusedField}
        isLastField={isLastField}
        handleFirstFieldFocus={focusFirstField}
        onFieldMetadataChange={onFieldMetadataChange}
        onMappedDatabaseColumnChange={onMappedDatabaseColumnChange}
        modelIndexes={modelIndexes}
      />
    );
  }

  if (datasetEditorTab === "metadata") {
    if (isQueryError || !props.rawSeries) {
      return null;
    }
    if (!focusedField) {
      // Returning a div, so the sidebar is visible while the data is loading.
      return <div />;
    }
    return (
      <DatasetEditorSettingsSidebar
        display={modelSettings.display}
        visualizationSettings={question.settings()}
        onUpdateModelSettings={onUpdateModelSettings}
      />
    );
  }

  const { isNative } = Lib.queryDisplayInfo(question.query());

  if (!isNative) {
    return null;
  }

  if (isShowingTemplateTagsEditor) {
    return (
      // @ts-expect-error Multiple types missing, but handled inside TagEditorSidebar
      <TagEditorSidebar
        {...props}
        query={question.legacyNativeQuery() as NativeQuery}
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

function getColumnTabIndex(columnIndex: number, focusedFieldIndex: number) {
  return Number(
    columnIndex === focusedFieldIndex
      ? EDITOR_TAB_INDEXES.FOCUSED_FIELD
      : columnIndex > focusedFieldIndex
        ? EDITOR_TAB_INDEXES.NEXT_FIELDS
        : EDITOR_TAB_INDEXES.PREVIOUS_FIELDS,
  );
}

const _DatasetEditorInner = (props: DatasetEditorInnerProps) => {
  const {
    question,
    visualizationSettings,
    datasetEditorTab,
    result,
    resultsMetadata,
    metadata,
    metadataDiff,
    isMetadataDirty,
    height,
    isDirty: isModelQueryDirty,
    isResultDirty,
    setQueryBuilderMode,
    runDirtyQuestionQuery,
    runQuestionQuery,
    setDatasetEditorTab,
    setMetadataDiff,
    cancelQuestionChanges,
    onCancelCreateNewModel,
    onSave,
    updateQuestion,
    handleResize,
    onOpenModal,
    isShowingListViewConfiguration,
    rawSeries,
  } = props;

  const dispatch = useDispatch();
  const { isNative, isEditable } = Lib.queryDisplayInfo(question.query());
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure();

  const fields = useMemo(
    () =>
      getSortedModelFields(
        (resultsMetadata?.columns as unknown as Field[]) ?? [],
        visualizationSettings ?? {},
      ),
    [resultsMetadata, visualizationSettings],
  );

  /**
   * tempModelSettings and tempRawSeries are introduced as a workaround to support new "list" display type for models.
   * - `tempModelSettings` stores local state for currently selected display and allows to switch between 'Columns'/'Settings' tabs
   * without triggering question changes detection, because otherwise updating `display` property would open LeaveConfirmationModal.
   * 'Columns' tab works only for "table" display type, so when user opens 'Settings' for Model saved with "list" display type,
   *  and wants to see 'Columns' tab, we need to update `display` property to "table".
   * - `tempRawSeries` is introduced for the same reason. It patches `rawSeries` property inside nested `VisualizationResult` component,
   *  so that it renders correct visualization for 'Columns' tab.
   */
  const [tempModelSettings, setTempModelSettings] = useState<ModelSettings>(
    () => {
      return {
        display: question.display(),
      };
    },
  );
  const tempRawSeries = useMemo(() => {
    if (!rawSeries || !rawSeries.length) {
      return rawSeries;
    }

    return [
      {
        ...rawSeries[0],
        card: { ...rawSeries[0].card, display: tempModelSettings.display },
      },
    ];
  }, [tempModelSettings, rawSeries]);

  const [isSettingsDirty, setSettingsDirty] = useState(false);
  const isDirty = isSettingsDirty || isModelQueryDirty || isMetadataDirty;

  const { data: modelIndexes } = useListModelIndexesQuery(
    {
      model_id: question.id(),
    },
    {
      skip: !question.isSaved() || question.type() !== "model",
    },
  );

  const isEditingQuery = datasetEditorTab === "query";
  const isEditingColumns = datasetEditorTab === "columns";

  const initialEditorHeight = useMemo(() => {
    const { isNative } = Lib.queryDisplayInfo(question.query());

    if (!isNative) {
      return INITIAL_NOTEBOOK_EDITOR_HEIGHT;
    }
    return calcInitialEditorHeight({
      query: question.legacyNativeQuery(),
      viewHeight: height ?? "full",
    });
  }, [question, height]);

  const [editorHeight, setEditorHeight] = useState(initialEditorHeight);

  const [focusedFieldName, setFocusedFieldName] = useState<
    string | undefined
  >();

  useMount(() => {
    if (question.isSaved() && Lib.canRun(question.query(), question.type())) {
      runQuestionQuery();
    }
  });

  const focusedFieldIndex = useMemo(() => {
    if (!focusedFieldName) {
      return -1;
    }
    return fields.findIndex((field: Field) => field.name === focusedFieldName);
  }, [focusedFieldName, fields]);

  const previousFocusedFieldIndex = usePrevious(focusedFieldIndex);

  const focusedField = fields[focusedFieldIndex] as unknown as DatasetColumn;

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
    (changes: { id: number } & Partial<DatasetColumn>) => {
      const mappedField = metadata?.field?.(changes.id)?.getPlainObject();
      const inheritedProperties =
        mappedField && getWritableColumnProperties(mappedField);
      return mappedField ? merge(inheritedProperties, changes) : changes;
    },
    [metadata],
  );

  const onFieldMetadataChange = useCallback(
    (values: Partial<DatasetColumn>) => {
      if (!focusedFieldName) {
        return;
      }
      setMetadataDiff({ name: focusedFieldName!, changes: values });
    },
    [focusedFieldName, setMetadataDiff],
  );

  const onMappedDatabaseColumnChange = useCallback(
    (value: number) => {
      if (!focusedFieldName) {
        return;
      }
      const changes = inheritMappedFieldProperties({ id: value });
      setMetadataDiff({ name: focusedFieldName!, changes });
    },
    [focusedFieldName, setMetadataDiff, inheritMappedFieldProperties],
  );

  const onChangeEditorTab = useCallback(
    (tab: DatasetEditorTab) => {
      setDatasetEditorTab(tab);
      setEditorHeight(tab === "query" ? initialEditorHeight : 0);
      /**
       * The only way to properly display interface for "Columns" tab is to
       * set model's display type to "table".
       * We use local `tempModelSettings` to store unsaved changes to avoid
       * affecting the `question` object in store, which triggers unwanted
       * `dirty` checks.
       */
      const display = question.display();
      const tempDisplay = tempModelSettings.display;
      const hasListViewSelected = display === "list" || tempDisplay === "list";
      if (hasListViewSelected) {
        if (tab !== "metadata") {
          setTempModelSettings({
            display: "table",
          });
        }
      }
      if (tab === "metadata") {
        setTempModelSettings({
          display: question.display(),
        });
      }
      if (hasListViewSelected && isShowingListViewConfiguration) {
        dispatch(setUIControls({ isShowingListViewConfiguration: false }));
      }
    },
    [
      initialEditorHeight,
      setDatasetEditorTab,
      question,
      dispatch,
      isShowingListViewConfiguration,
      tempModelSettings,
    ],
  );

  const handleCancelEdit = () => {
    closeModal();
    cancelQuestionChanges();
    setQueryBuilderMode("view");
    if (isShowingListViewConfiguration) {
      dispatch(setUIControls({ isShowingListViewConfiguration: false }));
    }
    runDirtyQuestionQuery();
  };

  const handleCancelClick = () => {
    if (question.isSaved()) {
      if (isDirty) {
        openModal();
      } else {
        handleCancelEdit();
      }
    } else {
      onCancelCreateNewModel();
    }
  };

  const handleSave = useCallback(async () => {
    const canBeDataset = checkCanBeModel(question);
    const isBrandNewDataset = !question.id();
    let questionWithUpdatedSettings = question;
    if (tempModelSettings?.display !== question.display()) {
      questionWithUpdatedSettings = question.setDisplay(
        tempModelSettings.display,
      );
    }
    const questionWithMetadata =
      questionWithUpdatedSettings.setResultMetadataDiff(metadataDiff);
    if (isShowingListViewConfiguration) {
      dispatch(setUIControls({ isShowingListViewConfiguration: false }));
    }

    if (canBeDataset && isBrandNewDataset) {
      await updateQuestion(questionWithMetadata, {
        rerunQuery: false,
      });
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
    question,
    tempModelSettings.display,
    metadataDiff,
    isShowingListViewConfiguration,
    dispatch,
    updateQuestion,
    onOpenModal,
    onSave,
    setQueryBuilderMode,
    runQuestionQuery,
  ]);

  const handleColumnSelect = useCallback(
    (column: DatasetColumn) => {
      setFocusedFieldName(column.name);
    },
    [setFocusedFieldName],
  );

  const handleTableElementClick = useCallback(
    ({
      element,
      ...clickedObject
    }: {
      element?: unknown;
      column?: DatasetColumn;
    }) => {
      const isColumnClick =
        clickedObject?.column && Object.keys(clickedObject)?.length === 1;

      if (isColumnClick) {
        setFocusedFieldName((clickedObject.column as DatasetColumn).name);
      }
    },
    [setFocusedFieldName],
  );

  const handleHeaderColumnReorder = useCallback(
    (dragColIndex: number) => {
      const field = fields[dragColIndex];

      if (!field) {
        return;
      }

      setFocusedFieldName(field.name);
    },
    [fields],
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
    const isGoingForward =
      typeof previousFocusedFieldIndex !== "undefined" &&
      focusedFieldIndex >= previousFocusedFieldIndex;
    return isGoingForward ? 1 : -1;
  }, [focusedFieldIndex, previousFocusedFieldIndex]);

  const renderSelectableTableColumnHeader = useCallback(
    (column: DatasetColumn, columnIndex: number) => {
      const isSelected = columnIndex === focusedFieldIndex;
      return (
        <Flex
          className={cx(DatasetEditorS.TableHeaderColumnName, {
            [DatasetEditorS.isSelected]: isSelected,
          })}
          tabIndex={getColumnTabIndex(columnIndex, focusedFieldIndex)}
          onFocus={() => handleColumnSelect(column)}
          data-testid="model-column-header-content"
        >
          <Icon
            className={cx(DatasetEditorS.FieldTypeIcon, {
              [DatasetEditorS.isSelected]: isSelected,
            })}
            size={14}
            name={getSemanticTypeIcon(column.semantic_type, "ellipsis")}
          />
          <span>{column.display_name}</span>
        </Flex>
      );
    },
    [focusedFieldIndex, handleColumnSelect],
  );

  const renderTableHeader = useMemo(
    () =>
      datasetEditorTab === "columns"
        ? renderSelectableTableColumnHeader
        : undefined,
    [datasetEditorTab, renderSelectableTableColumnHeader],
  );

  const canSaveChanges =
    isDirty &&
    (!isNative || !isResultDirty) &&
    fields.every((field) => field.display_name) &&
    Lib.canSave(question.query(), question.type());

  const saveButtonTooltipLabel = useMemo(() => {
    if (
      isNative &&
      isDirty &&
      isResultDirty &&
      Lib.rawNativeQuery(question.query()).length > 0
    ) {
      return t`You must run the query before you can save this model`;
    }
  }, [isNative, isDirty, isResultDirty, question]);

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
      onUpdateModelSettings: (settings: ModelSettings) => {
        setSettingsDirty(settings.display !== question.display());
        if (settings.display) {
          setTempModelSettings({ display: settings.display });
        }
      },
      modelSettings: tempModelSettings,
    },
  );

  return (
    <>
      <EditBar
        className={DatasetEditorS.DatasetEditBar}
        data-testid="dataset-edit-bar"
        title={question.displayName() as string}
        center={
          <EditorTabs
            currentTab={datasetEditorTab}
            disabledQuery={!isEditable}
            disabledColumns={!resultsMetadata}
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
              normalText={question.isSaved() ? t`Save changes` : t`Save`}
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
      <Flex className={DatasetEditorS.Root} ref={props.forwardedRef}>
        <Flex className={DatasetEditorS.MainContainer}>
          <Box
            className={cx(DatasetEditorS.QueryEditorContainer, {
              [DatasetEditorS.isResizable]: isEditingQuery,
            })}
          >
            {/**
             * Optimization: DatasetQueryEditor can be expensive to re-render
             * and we don't need it on the "Metadata" tab.
             *
             * @see https://github.com/metabase/metabase/pull/31142/files#r1211352364
             */}
            {isEditingQuery && editorHeight > 0 && (
              // @ts-expect-error TODO: Fix types in DatasetQueryEditor
              <DatasetQueryEditor
                {...props}
                isActive={isEditingQuery}
                height={editorHeight}
                viewHeight={height}
                onResizeStop={handleResize}
              />
            )}
          </Box>
          <Box
            className={cx(DatasetEditorS.TableContainer, {
              [DatasetEditorS.isSidebarOpen]: sidebar,
            })}
          >
            <DebouncedFrame className={cx(CS.flexFull)} enabled>
              <QueryVisualization
                {...props}
                rawSeries={tempRawSeries}
                className={CS.spread}
                noHeader
                queryBuilderMode="dataset"
                onHeaderColumnReorder={handleHeaderColumnReorder}
                isShowingDetailsOnlyColumns={datasetEditorTab === "columns"}
                hasMetadataPopovers={false}
                handleVisualizationClick={handleTableElementClick}
                tableHeaderHeight={isEditingColumns && TABLE_HEADER_HEIGHT}
                renderTableHeader={renderTableHeader}
                scrollToColumn={focusedFieldIndex + scrollToColumnModifier}
                renderEmptyMessage={isEditingColumns}
              />
            </DebouncedFrame>
          </Box>
        </Flex>
        <ViewSidebar side="right" isOpen={!!sidebar}>
          {sidebar}
        </ViewSidebar>
      </Flex>

      <LeaveConfirmModal
        opened={modalOpened}
        onConfirm={handleCancelEdit}
        onClose={closeModal}
      />
    </>
  );
};

export const DatasetEditorInner = connect(
  mapStateToProps,
  mapDispatchToProps,
  null,
  { forwardRef: true },
)(_DatasetEditorInner);
