import { useElementSize } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";

import EmptyCodeResult from "assets/img/empty-states/code.svg";
import { datasetApi } from "metabase/api/dataset";
import { ErrorMessage } from "metabase/common/components/ErrorMessage";
import {
  createDraftCard,
  generateDraftCardId,
  loadMetadataForDocumentCard,
} from "metabase/documents/documents.slice";
import { isMac } from "metabase/lib/browser";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { NativeQueryEditor } from "metabase/query_builder/components/NativeQueryEditor";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import { createRawSeries } from "metabase/query_builder/utils";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Flex, Loader, Modal, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import NoResultsView from "metabase/visualizations/components/Visualization/NoResultsView/NoResultsView";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type { Card, DatabaseId, Dataset, RawSeries } from "metabase-types/api";

import S from "./NativeQueryModal.module.css";

type DataReferenceStackItem = {
  type: string;
  item: unknown;
};

interface NativeQueryModalProps {
  card: Card;
  isOpen: boolean;
  onClose: () => void;
  onSave: (result: { card_id: number }) => void;
  initialDataset?: Dataset;
}

const MODAL_SIDEBAR_FEATURES = {
  dataReference: true,
  variables: false,
  snippets: false,
  promptInput: false,
  formatQuery: false,
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

const getErrorMessage = (
  failedDataset: Dataset | null | undefined,
  queryError: unknown,
): string => {
  if (failedDataset?.error) {
    return typeof failedDataset.error === "string"
      ? failedDataset.error
      : failedDataset.error?.data || t`Query execution failed`;
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
        <Text c="text-secondary">
          {c("{0} refers to the keyboard shortcut")
            .jt`To run your code, click on the Run button or type ${(
            <b key="shortcut">({keyboardShortcut})</b>
          )}`}
        </Text>
        <Text c="text-secondary">{t`Here's where your results will appear`}</Text>
      </Stack>
    </Flex>
  );
};

export const NativeQueryModal = ({
  card,
  isOpen,
  onClose,
  onSave,
  initialDataset,
}: NativeQueryModalProps) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  const [modifiedQuestion, setModifiedQuestion] = useState<Question | null>(
    null,
  );
  const [hasExecutedQuery, setHasExecutedQuery] = useState(false);
  const [isShowingTemplateTagsEditor, setIsShowingTemplateTagsEditor] =
    useState(false);
  const [isShowingDataReference, setIsShowingDataReference] = useState(false);
  const [dataReferenceStack, setDataReferenceStack] = useState<
    DataReferenceStackItem[]
  >([]);

  const [
    triggerQuery,
    { data: queryResult, isLoading, isFetching, error: queryError, reset },
  ] = datasetApi.useLazyGetAdhocQueryQuery();

  const [currentQueryPromise, setCurrentQueryPromise] = useState<ReturnType<
    typeof triggerQuery
  > | null>(null);

  const { ref: mainRef, height: totalHeight } = useElementSize();

  const isQueryRunning = isLoading || isFetching;

  const datasetToUse =
    queryResult || (!hasExecutedQuery ? initialDataset : null);
  const failedDataset = isFailedDataset(datasetToUse) ? datasetToUse : null;

  const isNewQuestion = !card?.id;

  useEffect(() => {
    if (isOpen && card) {
      dispatch(loadMetadataForDocumentCard(card));
    }
  }, [isOpen, card, dispatch]);

  const question = useMemo(() => {
    if (!card || !metadata || !isOpen) {
      return null;
    }

    const baseQuestion = new Question(card, metadata);
    if (!modifiedQuestion) {
      setModifiedQuestion(baseQuestion);
    }
    return baseQuestion;
  }, [card, metadata, isOpen, modifiedQuestion]);

  const canSave =
    modifiedQuestion &&
    Lib.canSave(modifiedQuestion.query(), modifiedQuestion.type());

  useEffect(() => {
    if (isOpen) {
      setHasExecutedQuery(false);
    } else {
      // Clean up any running queries when modal closes
      if (currentQueryPromise) {
        currentQueryPromise.abort();
        setCurrentQueryPromise(null);
      }
    }
  }, [isOpen, currentQueryPromise]);

  const setDatasetQuery = useCallback(
    async (query: NativeQuery) => {
      if (!modifiedQuestion) {
        return modifiedQuestion;
      }

      const datasetQuery = query.datasetQuery();
      const newQuestion = modifiedQuestion.setDatasetQuery(datasetQuery);
      setModifiedQuestion(newQuestion);
      return newQuestion;
    },
    [modifiedQuestion],
  );

  const handleRunQuery = useCallback(() => {
    if (!modifiedQuestion) {
      return;
    }

    reset();

    const datasetQuery = modifiedQuestion.datasetQuery();
    const queryPromise = triggerQuery(datasetQuery);
    setCurrentQueryPromise(queryPromise);
    setHasExecutedQuery(true);
  }, [modifiedQuestion, triggerQuery, reset]);

  const handleCancelQuery = useCallback(() => {
    if (currentQueryPromise) {
      currentQueryPromise.abort();
      setCurrentQueryPromise(null);
    }
  }, [currentQueryPromise]);

  const handleSave = useCallback(() => {
    if (!modifiedQuestion) {
      return;
    }

    const newCardId = generateDraftCardId();
    if (!isNewQuestion) {
      const modifiedData = {
        dataset_query: modifiedQuestion.datasetQuery(),
        display: modifiedQuestion.display(),
        visualization_settings:
          modifiedQuestion.card().visualization_settings ?? {},
      };

      dispatch(
        createDraftCard({
          originalCard: card,
          modifiedData,
          draftId: newCardId,
        }),
      );
    } else {
      const dataset_query = modifiedQuestion.datasetQuery();
      const name =
        modifiedQuestion.displayName() ||
        modifiedQuestion.generateQueryDescription() ||
        t`New question`;

      const modifiedData = {
        name,
        database_id: dataset_query.database || undefined,
        dataset_query: dataset_query,
        display: modifiedQuestion.display(),
        visualization_settings:
          modifiedQuestion.card().visualization_settings ?? {},
      };

      dispatch(
        createDraftCard({
          originalCard: undefined,
          modifiedData,
          draftId: newCardId,
        }),
      );
    }

    onSave({ card_id: newCardId });
    onClose();
  }, [modifiedQuestion, isNewQuestion, onSave, onClose, dispatch, card]);

  const rawSeries = useMemo<RawSeries | null>(() => {
    if (!modifiedQuestion || !datasetToUse || failedDataset) {
      return null;
    }

    const visualizationCard = {
      ...modifiedQuestion.card(),
      display: "table" as const,
      visualization_settings: {
        ...modifiedQuestion.card().visualization_settings,
        "table.pivot": false,
        "table.columns": undefined,
      },
    };

    return createRawSeries({
      card: visualizationCard,
      queryResult: datasetToUse,
      datasetQuery: modifiedQuestion.datasetQuery(),
    });
  }, [modifiedQuestion, datasetToUse, failedDataset]);

  if (!question || !modifiedQuestion) {
    return (
      <Modal
        opened={isOpen}
        onClose={onClose}
        size="95%"
        title={t`Edit SQL Query`}
      >
        <Flex h="400px" align="center" justify="center">
          <Loader size="lg" />
        </Flex>
      </Modal>
    );
  }

  const nativeQuery =
    modifiedQuestion?.legacyNativeQuery() ??
    question?.legacyNativeQuery() ??
    null;

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="95%"
      title={t`Edit SQL Query`}
      padding="lg"
      classNames={{
        content: S.modalContent,
        body: S.modalBody,
      }}
    >
      <Flex h="100%" direction="column">
        <Flex flex={1} direction="row" mih={0} className={S.mainContent}>
          <Flex
            flex={1}
            direction="column"
            mih={0}
            miw={0}
            className={S.mainContent}
            ref={mainRef}
          >
            <Box pos="relative" className={S.editorContainer}>
              {nativeQuery && (
                <NativeQueryEditor
                  question={modifiedQuestion}
                  query={nativeQuery}
                  isNativeEditorOpen
                  isInitiallyOpen
                  hasTopBar
                  hasEditingSidebar
                  hasParametersList={false}
                  sidebarFeatures={MODAL_SIDEBAR_FEATURES}
                  availableHeight={totalHeight}
                  isRunnable
                  isRunning={isQueryRunning}
                  isResultDirty={false}
                  isShowingDataReference={isShowingDataReference}
                  isShowingTemplateTagsEditor={isShowingTemplateTagsEditor}
                  isShowingSnippetSidebar={false}
                  setDatasetQuery={setDatasetQuery}
                  runQuery={handleRunQuery}
                  cancelQuery={handleCancelQuery}
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
                  canChangeDatabase
                  onSetDatabaseId={(databaseId: DatabaseId) => {
                    if (!modifiedQuestion) {
                      return;
                    }

                    const updatedDatasetQuery = {
                      ...modifiedQuestion.datasetQuery(),
                      database: databaseId,
                    };
                    const newQuestion =
                      modifiedQuestion.setDatasetQuery(updatedDatasetQuery);
                    setModifiedQuestion(newQuestion);
                  }}
                  resizable
                />
              )}
            </Box>

            <Flex
              id="results-container"
              flex={1}
              direction="column"
              mih={0}
              pt="0.25rem"
              pos="relative"
              className={S.resultsContainer}
            >
              {isQueryRunning ? (
                <Flex h="100%" align="center" justify="center">
                  <Loader size="lg" />
                </Flex>
              ) : failedDataset || queryError ? (
                <Flex h="100%" className={S.errorContainer}>
                  <ErrorMessage
                    type="serverError"
                    title={t`Query execution failed`}
                    message={getErrorMessage(failedDataset, queryError)}
                    action={null}
                    className={S.errorMessage}
                  />
                </Flex>
              ) : hasEmptyResults(datasetToUse) ? (
                <QueryExecutionEmptyState hasInitialData={!!datasetToUse} />
              ) : rawSeries ? (
                <Box flex={1} mih="300px">
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
              ) : (
                <QueryExecutionEmptyState hasInitialData={false} />
              )}
            </Flex>
          </Flex>

          {isShowingDataReference && modifiedQuestion && (
            <Box
              w="350px"
              miw="350px"
              bg="background-primary"
              className={S.dataReferenceSidebar}
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
        </Flex>

        <Flex
          pos="sticky"
          bottom={0}
          justify="flex-end"
          gap="0.5rem"
          p="1rem"
          bg="background-primary"
          className={S.footer}
        >
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            onClick={handleSave}
            disabled={!canSave || !modifiedQuestion}
          >
            {t`Save and use`}
          </Button>
        </Flex>
      </Flex>
    </Modal>
  );
};
