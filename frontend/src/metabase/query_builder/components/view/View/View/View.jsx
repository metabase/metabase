/* eslint-disable react/prop-types */

import cx from "classnames";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { deletePermanently } from "metabase/archive/actions";
import ExplicitSize from "metabase/components/ExplicitSize";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Toaster from "metabase/components/Toaster";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import Bookmarks from "metabase/entities/bookmarks";
import Questions from "metabase/entities/questions";
import { connect } from "metabase/lib/redux";
import {
  rememberLastUsedDatabase,
  setArchivedQuestion,
} from "metabase/query_builder/actions";
import { SIDEBAR_SIZES } from "metabase/query_builder/constants";
import { MetricEditor } from "metabase/querying/metrics/components/MetricEditor";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import DatasetEditor from "../../../DatasetEditor";
import { QueryModals } from "../../../QueryModals";
import { SavedQuestionIntroModal } from "../../../SavedQuestionIntroModal";
import { ViewFooter } from "../../ViewFooter";
import ViewSidebar from "../../ViewSidebar";
import { ChartSettingsSidebar } from "../../sidebars/ChartSettingsSidebar";
import { NotebookContainer } from "../NotebookContainer";
import { ViewHeaderContainer } from "../ViewHeaderContainer";
import { ViewMainContainer } from "../ViewMainContainer";
import { ViewRightSidebarContainer } from "../ViewRightSidebarContainer";

import S from "./View.module.css";

const ViewInner = props => {
  const {
    question,
    result,
    rawSeries,
    databases,
    isShowingNewbModal,
    isShowingTimelineSidebar,
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
    isShowingSummarySidebar,
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
  } = props;

  // if we don't have a question at all or no databases then we are initializing, so keep it simple
  if (!question || !databases) {
    return <LoadingAndErrorWrapper className={CS.fullHeight} loading />;
  }

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(question.query());

  const isNewQuestion = !isNative && Lib.sourceTableOrCardId(query) === null;
  const isModel = question.type() === "model";
  const isMetric = question.type() === "metric";

  if ((isModel || isMetric) && queryBuilderMode === "dataset") {
    return (
      <>
        {isModel && <DatasetEditor {...props} />}
        {isMetric && (
          <MetricEditor
            question={question}
            result={result}
            rawSeries={rawSeries}
            reportTimezone={reportTimezone}
            isDirty={isDirty}
            isResultDirty={isResultDirty}
            isRunning={isRunning}
            onChange={updateQuestion}
            onCreate={async question => {
              const result = await onCreate(question);
              setQueryBuilderMode("view");
              return result;
            }}
            onSave={async question => {
              await onSave(question);
              setQueryBuilderMode("view");
            }}
            onCancel={question => {
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
          updateQuestion={updateQuestion}
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

  const showLeftSidebar = isShowingChartSettingsSidebar;
  const showRightSidebar =
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
    <div className={CS.fullHeight}>
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
            {isShowingChartSettingsSidebar && (
              <ChartSettingsSidebar question={question} result={result} />
            )}
          </ViewSidebar>
          <ViewMainContainer
            showLeftSidebar={showLeftSidebar}
            showRightSidebar={showRightSidebar}
            {...props}
          />
          <ViewSidebar
            side="right"
            isOpen={showRightSidebar}
            width={rightSidebarWidth}
          >
            <ViewRightSidebarContainer {...props} />
          </ViewSidebar>
        </Flex>

        {queryBuilderMode !== "notebook" && (
          <ViewFooter className={CS.flexNoShrink} />
        )}
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
        updateQuestion={updateQuestion}
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
};

const mapDispatchToProps = dispatch => ({
  onSetDatabaseId: id => dispatch(rememberLastUsedDatabase(id)),
  onUnarchive: async question => {
    await dispatch(setArchivedQuestion(question, false));
    await dispatch(Bookmarks.actions.invalidateLists());
  },
  onMove: (question, newCollection) =>
    dispatch(
      Questions.actions.setCollection({ id: question.id() }, newCollection, {
        notify: { undo: false },
      }),
    ),
  onDeletePermanently: id => {
    const deleteAction = Questions.actions.delete({ id });
    dispatch(deletePermanently(deleteAction));
  },
});

export const View = _.compose(
  ExplicitSize({ refreshMode: "debounceLeading" }),
  connect(null, mapDispatchToProps),
)(ViewInner);
