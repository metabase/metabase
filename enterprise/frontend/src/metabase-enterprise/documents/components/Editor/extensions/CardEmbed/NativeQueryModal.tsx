import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAsync } from "react-use";
import { c, t } from "ttag";

import EmptyCodeResult from "assets/img/empty-states/code.svg";
import { skipToken } from "metabase/api";
import {
  datasetApi,
  useGetAdhocQueryMetadataQuery,
} from "metabase/api/dataset";
import { ErrorMessage } from "metabase/common/components/ErrorMessage";
import { isMac } from "metabase/lib/browser";
import { useDispatch } from "metabase/lib/redux";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import { TagEditorSidebar } from "metabase/query_builder/components/template_tags/TagEditorSidebar";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Flex, Loader, Modal, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import NoResultsView from "metabase/visualizations/components/Visualization/NoResultsView/NoResultsView";
import Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Card,
  DatabaseId,
  Dataset,
  DatasetQuery,
} from "metabase-types/api";

import {
  createDraftCard,
  generateDraftCardId,
} from "../../../../documents.slice";
import {
  useDocumentsDispatch,
  useDocumentsSelector,
} from "../../../../redux-utils";

type DataReferenceStackItem = {
  type: string;
  item: unknown;
};

interface NativeQueryModalProps {
  card: Card;
  isOpen: boolean;
  onClose: () => void;
  onSave: (result: { card_id: number; name: string }) => void;
  editor?: Editor;
  initialDataset?: Dataset;
}

const EDITOR_HEIGHT_RATIO = 0.4;
const EDITOR_MIN_HEIGHT = 200;
const EDITOR_HEIGHT_OFFSET = 80;

const MODAL_SIDEBAR_FEATURES = {
  dataReference: true,
  variables: false,
  snippets: false,
  promptInput: false,
  formatQuery: false,
  aiGeneration: false,
} as const;

const getRunQueryShortcut = () => (isMac() ? t`⌘ + return` : t`Ctrl + enter`);

const isFailedDataset = (dataset: Dataset | null | undefined): boolean => {
  return !!(dataset?.error || dataset?.status === "failed");
};

const hasEmptyResults = (dataset: Dataset | null | undefined): boolean => {
  return (
    !isFailedDataset(dataset) &&
    !!dataset?.data &&
    Array.isArray(dataset.data.rows) &&
    dataset.data.rows.length === 0
  );
};

const getErrorMessage = (sqlError: any, queryError: unknown): string => {
  if (sqlError?.error) {
    return sqlError.error;
  }
  if (typeof queryError === "object" && queryError && "message" in queryError) {
    return String(queryError.message);
  }
  return t`An error occurred while running your query. Please check your query and try again.`;
};

const QueryExecutionEmptyState = ({
  hasInitialData,
}: {
  hasInitialData: boolean;
}) => {
  if (hasInitialData) {
    return <NoResultsView />;
  }

  const keyboardShortcut = getRunQueryShortcut();

  return (
    <Flex w="100%" h="100%" align="center" justify="center">
      <Stack maw="25rem" gap={0} ta="center" align="center">
        <Box maw="3rem" mb="0.75rem">
          <img src={EmptyCodeResult} alt="Code prompt icon" />
        </Box>
        <Text c="text-medium">
          {c("{0} refers to the keyboard shortcut")
            .jt`To run your code, click on the Run button or type ${(
            <b key="shortcut">({keyboardShortcut})</b>
          )}`}
        </Text>
        <Text c="text-medium">{t`Here's where your results will appear`}</Text>
      </Stack>
    </Flex>
  );
};

const LoadingModal = ({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) => (
  <Modal opened={isOpen} onClose={onClose} size="95%" title={t`Edit SQL Query`}>
    <Box
      style={{
        height: "400px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </Box>
  </Modal>
);

export const NativeQueryModal = ({
  card,
  isOpen,
  onClose,
  onSave,
  editor,
  initialDataset,
}: NativeQueryModalProps) => {
  const dispatch = useDispatch();
  const documentsDispatch = useDocumentsDispatch();
  const metadata = useDocumentsSelector(getMetadata);

  const [modifiedQuestion, setModifiedQuestion] = useState<Question | null>(
    null,
  );
  const [currentQuery, setCurrentQuery] = useState<DatasetQuery | null>(null);
  const [hasExecutedQuery, setHasExecutedQuery] = useState(false);
  const [isShowingTemplateTagsEditor, setIsShowingTemplateTagsEditor] =
    useState(false);
  const [isShowingDataReference, setIsShowingDataReference] = useState(false);
  const [dataReferenceStack, setDataReferenceStack] = useState<
    DataReferenceStackItem[]
  >([]);

  const {
    data: queryResult,
    isLoading: isQueryRunning,
    error: queryError,
    refetch: refetchQuery,
  } = datasetApi.useGetAdhocQueryQuery(currentQuery || skipToken, {
    skip: !currentQuery,
  });

  const datasetToUse =
    queryResult || (!hasExecutedQuery ? initialDataset : null);
  const sqlError = isFailedDataset(datasetToUse) ? datasetToUse : null;

  const isDraftCard = card.id < 0;
  const { data: adhocMetadata, isLoading: isAdhocMetadataLoading } =
    useGetAdhocQueryMetadataQuery(
      isDraftCard && card.dataset_query ? card.dataset_query : skipToken,
      { skip: !isDraftCard || !card.dataset_query },
    );

  const metadataState = useAsync(async () => {
    if (isOpen && card && !isDraftCard) {
      await dispatch(loadMetadataForCard(card));
    }
  }, [isOpen, card, dispatch, isDraftCard]);

  // Question initialization
  const question = useMemo(() => {
    const isMetadataLoading = isDraftCard
      ? isAdhocMetadataLoading
      : metadataState.loading;
    const hasMetadataError = isDraftCard ? false : metadataState.error;
    const hasMetadata = isDraftCard ? !!adhocMetadata : !!metadata;

    if (
      isMetadataLoading ||
      hasMetadataError ||
      !card ||
      !hasMetadata ||
      !isOpen
    ) {
      return null;
    }

    const baseQuestion = new Question(card, metadata);
    if (!modifiedQuestion) {
      setModifiedQuestion(baseQuestion);
    }
    return baseQuestion;
  }, [
    isDraftCard,
    isAdhocMetadataLoading,
    metadataState.loading,
    metadataState.error,
    adhocMetadata,
    card,
    metadata,
    isOpen,
    modifiedQuestion,
  ]);

  // Reset query execution state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentQuery(null);
      setHasExecutedQuery(false);
    }
  }, [isOpen]);

  // Dataset query handler following QB patterns
  const setDatasetQuery = useCallback(
    async (query: NativeQuery | DatasetQuery) => {
      if (!modifiedQuestion) {
        return modifiedQuestion;
      }

      try {
        let datasetQuery: DatasetQuery;
        const isNativeQueryObject =
          "queryText" in query && typeof query.queryText === "function";
        if (isNativeQueryObject) {
          // Handle NativeQuery object
          const nativeQuery = query as NativeQuery;
          datasetQuery = {
            type: "native",
            native: {
              query: nativeQuery.queryText() || "",
              "template-tags": nativeQuery.templateTagsMap() || {},
            },
            database: modifiedQuestion.databaseId(),
          } as DatasetQuery;
        } else {
          // Handle dataset_query object (including database changes)
          datasetQuery = query as DatasetQuery;
        }

        const newQuestion = modifiedQuestion.setDatasetQuery(datasetQuery);
        setModifiedQuestion(newQuestion);
        return newQuestion;
      } catch (error) {
        console.error("Failed to update dataset query:", error);
        return modifiedQuestion;
      }
    },
    [modifiedQuestion],
  );

  // Query execution handler
  const handleRunQuery = useCallback(() => {
    if (!modifiedQuestion) {
      return;
    }

    const datasetQuery = modifiedQuestion.datasetQuery();

    // Check if query has changed from what we currently have
    const queryChanged =
      !currentQuery ||
      JSON.stringify(currentQuery) !== JSON.stringify(datasetQuery);

    if (queryChanged) {
      // Query changed, set new query which will trigger RTK Query
      setCurrentQuery(datasetQuery);
    } else {
      // Same query, use refetch for proper loading state
      refetchQuery();
    }

    setHasExecutedQuery(true);
  }, [modifiedQuestion, currentQuery, refetchQuery]);

  // Save handler
  const handleSave = async () => {
    if (!modifiedQuestion || !editor) {
      return;
    }

    try {
      const modifiedData = {
        dataset_query: modifiedQuestion.datasetQuery(),
        display: modifiedQuestion.display(),
        visualization_settings:
          modifiedQuestion.card().visualization_settings ?? {},
      };

      const newCardId = generateDraftCardId();

      documentsDispatch(
        createDraftCard({
          originalCard: card,
          modifiedData,
          draftId: newCardId,
        }),
      );

      onSave({ card_id: newCardId, name: card.name });
      onClose();
    } catch (error) {
      console.error("Failed to save modified question:", error);
    }
  };

  // Transform query results to visualization series following QB patterns
  const rawSeries = useMemo(() => {
    if (!modifiedQuestion || !datasetToUse || sqlError) {
      return null;
    }

    try {
      const data = datasetToUse.data || datasetToUse;
      return [
        {
          card: {
            ...modifiedQuestion.card(),
            display: "table" as const, // Force table display for results
            visualization_settings: {
              ...modifiedQuestion.card().visualization_settings,
              "table.pivot": false,
              "table.columns": undefined,
            },
          },
          data: {
            rows: data.rows || [],
            cols: data.cols || [],
            results_metadata: data.results_metadata || [],
            insights: data.insights,
            rows_truncated: data.rows_truncated || 0,
          },
          json_query: datasetToUse.json_query,
          started_at: datasetToUse.started_at || new Date().toISOString(),
          running_time: datasetToUse.running_time,
          row_count: datasetToUse.row_count,
          status: "completed",
        },
      ];
    } catch (error) {
      console.error("Error formatting series data:", error);
      return null;
    }
  }, [modifiedQuestion, datasetToUse, sqlError]);

  const modalStyles = {
    content: {
      height: "90vh",
      maxHeight: "90vh",
      display: "flex",
      flexDirection: "column" as const,
    },
    body: {
      flex: 1,
      display: "flex",
      flexDirection: "column" as const,
      padding: 0,
      minHeight: 0,
      overflow: "hidden" as const,
    },
  };

  const editorContainerStyle = {
    flexShrink: 0,
    borderBottom: "1px solid var(--mb-color-border)",
    position: "relative" as const,
  };

  if (isDraftCard ? isAdhocMetadataLoading : metadataState.loading) {
    return (
      <LoadingModal isOpen={isOpen} onClose={onClose}>
        <Loader size="lg" />
      </LoadingModal>
    );
  }

  if (!question || !modifiedQuestion) {
    return (
      <LoadingModal isOpen={isOpen} onClose={onClose}>
        <Text>{t`Failed to load question data`}</Text>
      </LoadingModal>
    );
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="95%"
      title={t`Edit SQL Query`}
      padding="lg"
      styles={modalStyles}
    >
      <Box style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Main content area with horizontal layout */}
        <Box
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "row",
            minHeight: 0,
          }}
        >
          {/* Left side - Editor and Results */}
          <Box
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <Box style={editorContainerStyle}>
              {/* NativeQueryEditor with minimal configuration for modal context */}
              {(modifiedQuestion?.legacyNativeQuery() ||
                question?.legacyNativeQuery()) && (
                <NativeQueryEditor
                  question={modifiedQuestion}
                  query={
                    modifiedQuestion?.legacyNativeQuery() ||
                    question?.legacyNativeQuery() ||
                    ({} as any)
                  }
                  isNativeEditorOpen
                  isInitiallyOpen
                  hasTopBar
                  hasEditingSidebar
                  hasParametersList={false}
                  sidebarFeatures={MODAL_SIDEBAR_FEATURES}
                  viewHeight={400}
                  isRunnable
                  isRunning={isQueryRunning}
                  isResultDirty={false}
                  isShowingDataReference={isShowingDataReference}
                  isShowingTemplateTagsEditor={isShowingTemplateTagsEditor}
                  isShowingSnippetSidebar={false}
                  setDatasetQuery={setDatasetQuery}
                  runQuestionQuery={handleRunQuery}
                  runQuery={handleRunQuery}
                  toggleTemplateTagsEditor={() =>
                    setIsShowingTemplateTagsEditor(!isShowingTemplateTagsEditor)
                  }
                  toggleDataReference={() => {
                    if (!isShowingDataReference && modifiedQuestion) {
                      const databaseId = modifiedQuestion.databaseId();
                      if (databaseId) {
                        setDataReferenceStack([
                          { type: "database", item: { id: databaseId } },
                        ]);
                      }
                    }
                    setIsShowingDataReference(!isShowingDataReference);
                  }}
                  toggleSnippetSidebar={() => {}}
                  setNativeEditorSelectedRange={() => {}}
                  openDataReferenceAtQuestion={() => {}}
                  openSnippetModalWithSelectedText={() => {}}
                  insertSnippet={() => {}}
                  setParameterValue={() => {}}
                  onOpenModal={() => {}}
                  cancelQuery={() => {}}
                  closeSnippetModal={() => {}}
                  handleResize={() => {}}
                  canChangeDatabase
                  toggleEditor={() => {}}
                  onSetDatabaseId={(databaseId: DatabaseId) => {
                    if (modifiedQuestion) {
                      const updatedDatasetQuery = {
                        ...modifiedQuestion.datasetQuery(),
                        database: databaseId,
                      };
                      const newQuestion =
                        modifiedQuestion.setDatasetQuery(updatedDatasetQuery);
                      setModifiedQuestion(newQuestion);
                    }
                  }}
                  resizable
                  resizableBoxProps={{
                    height: Math.max(
                      EDITOR_MIN_HEIGHT,
                      Math.floor(
                        window.innerHeight * EDITOR_HEIGHT_RATIO -
                          EDITOR_HEIGHT_OFFSET,
                      ),
                    ),
                    style: { border: "none" },
                  }}
                />
              )}
            </Box>

            {/* Results area */}
            <Box
              id="results-container"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                paddingTop: "0.25rem",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {!isQueryRunning && (sqlError || queryError) ? (
                <ErrorMessage
                  type="serverError"
                  title={t`Query execution failed`}
                  message={getErrorMessage(sqlError, queryError)}
                  action={null}
                />
              ) : !isQueryRunning && hasEmptyResults(datasetToUse) ? (
                <QueryExecutionEmptyState hasInitialData={!!datasetToUse} />
              ) : !isQueryRunning && rawSeries ? (
                <Box style={{ flex: 1, minHeight: "300px" }}>
                  <Visualization
                    rawSeries={rawSeries}
                    metadata={metadata}
                    onChangeCardAndRun={() => {}}
                    getExtraDataForClick={() => ({})}
                    isEditing={false}
                    isDashboard={false}
                    showTitle={false}
                  />
                </Box>
              ) : !isQueryRunning ? (
                <QueryExecutionEmptyState hasInitialData={false} />
              ) : !datasetToUse ? (
                <Box
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Loader size="lg" />
                </Box>
              ) : null}

              {/* Loading overlay for when rerunning queries with existing results */}
              {isQueryRunning && datasetToUse && (
                <Box
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "var(--mb-color-bg-white)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                  }}
                >
                  <Loader size="lg" />
                </Box>
              )}
            </Box>
          </Box>

          {/* Right side - Sidebars */}
          {/* Template tags sidebar */}
          {isShowingTemplateTagsEditor && modifiedQuestion && (
            <Box
              style={{
                width: "300px",
                flexShrink: 0,
                backgroundColor: "var(--mb-color-bg-white)",
                borderLeft: "1px solid var(--mb-color-border)",
                overflow: "auto",
              }}
            >
              <TagEditorSidebar
                question={modifiedQuestion}
                query={modifiedQuestion.legacyNativeQuery()!}
                onClose={() => setIsShowingTemplateTagsEditor(false)}
                setDatasetQuery={setDatasetQuery}
              />
            </Box>
          )}

          {/* Data reference sidebar */}
          {isShowingDataReference && modifiedQuestion && (
            <Box
              style={{
                width: "350px",
                flexShrink: 0,
                backgroundColor: "var(--mb-color-bg-white)",
                borderLeft: "1px solid var(--mb-color-border)",
                overflow: "auto",
              }}
            >
              <DataReference
                dataReferenceStack={dataReferenceStack}
                onClose={() => setIsShowingDataReference(false)}
                popDataReferenceStack={() => {
                  if (dataReferenceStack.length === 1) {
                    setIsShowingDataReference(false);
                  } else {
                    setDataReferenceStack(dataReferenceStack.slice(0, -1));
                  }
                }}
                pushDataReferenceStack={(item: DataReferenceStackItem) => {
                  setDataReferenceStack([...dataReferenceStack, item]);
                }}
              />
            </Box>
          )}
        </Box>

        {/* Footer with actions */}
        <Box
          style={{
            position: "sticky",
            bottom: 0,
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            borderTop: "1px solid var(--mb-color-border)",
            padding: "1rem",
            flexShrink: 0,
            backgroundColor: "var(--mb-color-bg-white)",
            zIndex: 10,
          }}
        >
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            onClick={handleSave}
            disabled={!modifiedQuestion}
          >
            {t`Save and use`}
          </Button>
        </Box>
      </Box>
    </Modal>
  );
};
