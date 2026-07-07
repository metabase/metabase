import cx from "classnames";
import { type ComponentProps, forwardRef } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { Api, cardApi } from "metabase/api";
import { listTag } from "metabase/api/tags";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { deletePermanently } from "metabase/archive/actions";
import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Toaster } from "metabase/common/components/Toaster";
import {
  type SetCollectionDestination,
  useSetCollection,
} from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import {
  rememberLastUsedDatabase,
  runOrCancelQuestionOrSelectedQuery,
  setArchivedQuestion,
} from "metabase/query_builder/actions";
import { SIDEBAR_SIZES } from "metabase/query_builder/constants";
import type { QueryModalType } from "metabase/querying/constants";
import { MetricEditor } from "metabase/querying/metrics/components/MetricEditor";
import { connect, useDispatch } from "metabase/redux";
import { updateQuestionCard } from "metabase/redux/cards";
import { API_UPDATE_QUESTION } from "metabase/redux/query-builder";
import type { Dispatch } from "metabase/redux/store";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Card, CardId, DatabaseId, Dataset } from "metabase-types/api";

import { DatasetEditor } from "../../../DatasetEditor";
import { QueryModals } from "../../../QueryModals";
import { SavedQuestionIntroModal } from "../../../SavedQuestionIntroModal";
import { ViewSidebar } from "../../ViewSidebar";
import { NotebookContainer } from "../NotebookContainer";
import { ViewHeaderContainer } from "../ViewHeaderContainer";
import { ViewLeftSidebarContainer } from "../ViewLeftSidebarContainer";
import { ViewMainContainer } from "../ViewMainContainer";
import { ViewRightSidebarContainer } from "../ViewRightSidebarContainer";

import S from "./View.module.css";

type SpreadProps = ComponentProps<typeof ViewHeaderContainer> &
  ComponentProps<typeof ViewMainContainer> &
  ComponentProps<typeof ViewRightSidebarContainer> &
  ComponentProps<typeof DatasetEditor>;

type ViewProps = Omit<
  SpreadProps,
  | "onSave"
  | "result"
  | "updateQuestion"
  | "runQuestionQuery"
  | "cancelQuery"
  | "setQueryBuilderMode"
  | "ref"
> & {
  result: Dataset;
  onSave: (
    question: Question,
    config?: { rerunQuery?: boolean },
  ) => Promise<void>;
  onCreate: (question: Question) => Promise<Question>;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery: () => Promise<void>;
  cancelQuery: () => void;
  setQueryBuilderMode: (mode: string) => void;
  onChangeLocation: (location: string) => void;
  onCloseModal: () => void;
  closeQbNewbModal: () => void;
  onDismissToast: () => void;
  onConfirmToast: () => void;
  modal: QueryModalType;
  modalContext: number;
  card: Card;
  originalQuestion: Question;
  reportTimezone: string;
  hasVisualizeButton: boolean;
  isHeaderVisible: boolean;
  isShowingNewbModal: boolean;
  isShowingToaster: boolean;
  isShowingChartSettingsSidebar: boolean;
  isShowingChartTypeSidebar: boolean;
};

type ViewInnerProps = Omit<ViewProps, "onMove">;

const ViewInner = forwardRef<HTMLDivElement, ViewInnerProps>(
  function ViewInnerImpl(propsIn, ref) {
    const dispatch = useDispatch();
    const setCollection = useSetCollection();
    const props: ViewProps = {
      ...propsIn,
      onMove: async (question, newCollection) => {
        const item = match(question.type())
          .with("question", () => ({
            model: "card" as const,
            id: question.id(),
          }))
          .with("model", () => ({
            model: "dataset" as const,
            id: question.id(),
          }))
          .with("metric", () => ({
            model: "metric" as const,
            id: question.id(),
          }))
          .exhaustive();
        const destination: SetCollectionDestination =
          newCollection.model === "dashboard"
            ? { model: "dashboard", id: newCollection.id }
            : {
                model: "collection",
                id: newCollection.id,
                // preserve the Trash type so moving there still archives the question
                type: newCollection.type === "trash" ? "trash" : undefined,
              };
        const updated = await setCollection(item, destination);
        // keep the QB in sync with where the question now lives
        dispatch({ type: API_UPDATE_QUESTION, payload: updated });
      },
    };
    const {
      question,
      result,
      rawSeries,
      databases,
      isShowingNewbModal,
      isShowingTimelineSidebar,
      isShowingAIQuestionAnalysisSidebar,
      queryBuilderMode,
      closeQbNewbModal,
      onDismissToast,
      onConfirmToast,
      isShowingToaster,
      isHeaderVisible,
      updateQuestion,
      reportTimezone,
      readOnly,
      isDirty,
      isRunning,
      isRunnable,
      isResultDirty,
      hasVisualizeButton,
      runQuestionQuery,
      cancelQuery,
      setQueryBuilderMode,
      runDirtyQuestionQuery,
      isShowingQuestionInfoSidebar,
      isShowingQuestionSettingsSidebar,
      cancelQuestionChanges,
      onCreate,
      onSave,
      onChangeLocation,
      modal,
      modalContext,
      card,
      onCloseModal,
      onOpenModal,
      originalQuestion,
      isShowingChartSettingsSidebar,
      isShowingChartTypeSidebar,
      isShowingSummarySidebar,
      isShowingTemplateTagsEditor,
      isShowingDataReference,
      isShowingSnippetSidebar,
    } = props;

    // if we don't have a question at all or no databases then we are initializing, so keep it simple
    if (!question || !databases) {
      return (
        <LoadingAndErrorWrapper className={CS.fullHeight} loading ref={ref} />
      );
    }

    const query = question.query();
    const { isNative } = Lib.queryDisplayInfo(question.query());

    const isNewQuestion = !isNative && Lib.sourceTableOrCardId(query) === null;
    const isModel = question.type() === "model";
    const isMetric = question.type() === "metric";

    if ((isModel || isMetric) && queryBuilderMode === "dataset") {
      return (
        <>
          {isModel && <DatasetEditor {...props} ref={ref} />}
          {isMetric && (
            <MetricEditor
              ref={ref}
              question={question}
              result={result}
              rawSeries={rawSeries}
              reportTimezone={reportTimezone}
              isDirty={isDirty}
              isResultDirty={isResultDirty}
              isRunning={isRunning}
              onChange={updateQuestion}
              onCreate={async (question) => {
                const result = await onCreate(question);
                setQueryBuilderMode("view");
                return result;
              }}
              onSave={async (question) => {
                await onSave(question);
                setQueryBuilderMode("view");
              }}
              onCancel={(question) => {
                if (question.isSaved()) {
                  cancelQuestionChanges();
                  runDirtyQuestionQuery();
                  setQueryBuilderMode("view");
                } else {
                  onChangeLocation("/");
                }
              }}
              onRunQuery={runQuestionQuery}
              onCancelQuery={cancelQuery}
            />
          )}
          <QueryModals
            onSave={onSave}
            onCreate={onCreate}
            modal={modal}
            modalContext={modalContext}
            card={card}
            question={question}
            onCloseModal={onCloseModal}
            onOpenModal={onOpenModal}
            setQueryBuilderMode={setQueryBuilderMode}
            originalQuestion={originalQuestion}
            onChangeLocation={onChangeLocation}
          />
        </>
      );
    }

    const isNotebookContainerOpen =
      isNewQuestion || queryBuilderMode === "notebook";

    const showLeftSidebar =
      isShowingChartSettingsSidebar || isShowingChartTypeSidebar;
    const showRightSidebar =
      isShowingAIQuestionAnalysisSidebar ||
      isShowingTimelineSidebar ||
      isShowingQuestionInfoSidebar ||
      isShowingQuestionSettingsSidebar ||
      (!isNative && isShowingSummarySidebar) ||
      (isNative &&
        (isShowingTemplateTagsEditor ||
          isShowingDataReference ||
          isShowingSnippetSidebar));

    const rightSidebarWidth = match({
      isShowingTimelineSidebar,
      isShowingQuestionInfoSidebar,
      isShowingQuestionSettingsSidebar,
    })
      .with({ isShowingTimelineSidebar: true }, () => SIDEBAR_SIZES.TIMELINE)
      .with({ isShowingQuestionInfoSidebar: true }, () => 0)
      .with({ isShowingQuestionSettingsSidebar: true }, () => 0)
      .otherwise(() => SIDEBAR_SIZES.NORMAL);
    return (
      <div className={CS.fullHeight} ref={ref}>
        <Flex
          className={cx(QueryBuilderS.QueryBuilder, S.QueryBuilderViewRoot)}
          data-testid="query-builder-root"
        >
          {isHeaderVisible && <ViewHeaderContainer {...props} />}

          <Flex className={S.QueryBuilderContentContainer}>
            {!isNative && (
              <NotebookContainer
                isOpen={isNotebookContainerOpen}
                updateQuestion={updateQuestion}
                reportTimezone={reportTimezone}
                readOnly={readOnly}
                question={question}
                isDirty={isDirty}
                isRunnable={isRunnable}
                isResultDirty={isResultDirty}
                hasVisualizeButton={hasVisualizeButton}
                runQuestionQuery={runQuestionQuery}
                setQueryBuilderMode={setQueryBuilderMode}
              />
            )}
            <ViewSidebar side="left" isOpen={showLeftSidebar}>
              <ViewLeftSidebarContainer
                question={question}
                result={result}
                isShowingChartSettingsSidebar={isShowingChartSettingsSidebar}
                isShowingChartTypeSidebar={isShowingChartTypeSidebar}
              />
            </ViewSidebar>
            <ViewMainContainer
              {...props}
              showLeftSidebar={showLeftSidebar}
              showRightSidebar={showRightSidebar}
            />
            <ViewSidebar
              side="right"
              isOpen={showRightSidebar}
              width={rightSidebarWidth}
            >
              <ViewRightSidebarContainer {...props} />
            </ViewSidebar>
          </Flex>
        </Flex>

        {isShowingNewbModal && (
          <SavedQuestionIntroModal
            question={question}
            isShowingNewbModal={isShowingNewbModal}
            onClose={() => closeQbNewbModal()}
          />
        )}

        <QueryModals
          onSave={onSave}
          onCreate={onCreate}
          modal={modal}
          modalContext={modalContext}
          card={card}
          question={question}
          onCloseModal={onCloseModal}
          onOpenModal={onOpenModal}
          setQueryBuilderMode={setQueryBuilderMode}
          originalQuestion={originalQuestion}
          onChangeLocation={onChangeLocation}
        />

        <Toaster
          message={t`Would you like to be notified when this question is done loading?`}
          isShown={isShowingToaster}
          onDismiss={onDismissToast}
          onConfirm={onConfirmToast}
          fixed
        />
      </div>
    );
  },
);

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onSetDatabaseId: (id: DatabaseId) => dispatch(rememberLastUsedDatabase(id)),
  onUnarchive: async (question: Question) => {
    await dispatch(updateQuestionCard({ id: question.id(), archived: false }));
    await dispatch(setArchivedQuestion(question, false));
    dispatch(Api.util.invalidateTags([listTag("bookmark")]));
  },
  onDeletePermanently: (id: CardId) => {
    const deleteAction = (dispatch: Dispatch) =>
      runRtkEndpoint(id, dispatch, cardApi.endpoints.deleteCard);
    dispatch(deletePermanently(deleteAction));
  },
  runQuery: () => {
    dispatch(runOrCancelQuestionOrSelectedQuery());
  },
});

export const View = _.compose(
  ExplicitSize({ refreshMode: "debounceLeading" }),
  connect(null, mapDispatchToProps, null, { forwardRef: true }),
)(ViewInner);
