import React, { useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import * as Urls from "metabase/lib/urls";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import MetabaseSettings from "metabase/lib/settings";

import ButtonBar from "metabase/components/ButtonBar";
import Link from "metabase/core/components/Link";
import ViewButton from "metabase/query_builder/components/view/ViewButton";

import { usePrevious } from "metabase/hooks/use-previous";
import { useToggle } from "metabase/hooks/use-toggle";

import SavedQuestionHeaderButton from "metabase/query_builder/components/SavedQuestionHeaderButton/SavedQuestionHeaderButton";

import RunButtonWithTooltip from "../RunButtonWithTooltip";

import { HeadBreadcrumbs } from "./HeaderBreadcrumbs";
import QuestionDataSource from "./QuestionDataSource";
import QuestionDescription from "./QuestionDescription";
import QuestionLineage from "./QuestionLineage";
import QuestionPreviewToggle from "./QuestionPreviewToggle";
import QuestionNotebookButton from "./QuestionNotebookButton";
import QuestionFilters, {
  FilterHeaderToggle,
  FilterHeader,
  QuestionFilterWidget,
} from "./QuestionFilters";
import { QuestionSummarizeWidget } from "./QuestionSummaries";
import NativeQueryButton from "./NativeQueryButton";
import {
  AdHocViewHeading,
  DatasetHeaderButtonContainer,
  SaveButton,
  SavedQuestionHeaderButtonContainer,
  ViewHeaderMainLeftContentContainer,
  ViewHeaderLeftSubHeading,
  ViewHeaderContainer,
  ViewSubHeaderRoot,
  StyledLastEditInfoLabel,
  StyledCollectionBadge,
  StyledQuestionDataSource,
} from "./ViewHeader.styled";

const viewTitleHeaderPropTypes = {
  question: PropTypes.object.isRequired,
  originalQuestion: PropTypes.object,

  queryBuilderMode: PropTypes.oneOf(["view", "notebook"]),
  setQueryBuilderMode: PropTypes.func,

  result: PropTypes.object,

  isDirty: PropTypes.bool,
  isRunnable: PropTypes.bool,
  isRunning: PropTypes.bool,
  isResultDirty: PropTypes.bool,
  isNativeEditorOpen: PropTypes.bool,
  isShowingFilterSidebar: PropTypes.bool,
  isShowingSummarySidebar: PropTypes.bool,
  isShowingQuestionDetailsSidebar: PropTypes.bool,
  isObjectDetail: PropTypes.bool,

  runQuestionQuery: PropTypes.func,
  cancelQuery: PropTypes.func,

  onOpenModal: PropTypes.func,
  onEditSummary: PropTypes.func,
  onCloseSummary: PropTypes.func,
  onAddFilter: PropTypes.func,
  onCloseFilter: PropTypes.func,
  onOpenQuestionDetails: PropTypes.func,
  onCloseQuestionDetails: PropTypes.func,
  onOpenQuestionHistory: PropTypes.func,

  isPreviewable: PropTypes.bool,
  isPreviewing: PropTypes.bool,
  setIsPreviewing: PropTypes.func,

  className: PropTypes.string,
  style: PropTypes.object,
};

export function ViewTitleHeader(props) {
  const { question, className, style } = props;

  const [
    areFiltersExpanded,
    { turnOn: expandFilters, turnOff: collapseFilters },
  ] = useToggle(!question?.isSaved());

  const previousQuestion = usePrevious(question);

  useEffect(() => {
    if (!question.isStructured() || !previousQuestion?.isStructured()) {
      return;
    }

    const filtersCount = question.query().filters().length;
    const previousFiltersCount = previousQuestion.query().filters().length;

    if (filtersCount > previousFiltersCount) {
      expandFilters();
    }
  }, [previousQuestion, question, expandFilters]);

  const lastEditInfo = question.lastEditInfo();

  const isStructured = question.isStructured();
  const isNative = question.isNative();
  const isSaved = question.isSaved();
  const isDataset = question.isDataset();

  const isSummarized =
    isStructured &&
    question
      .query()
      .topLevelQuery()
      .hasAggregations();

  return (
    <>
      <ViewHeaderContainer
        className={className}
        style={style}
        data-testid="qb-header"
      >
        {isDataset ? (
          <DatasetLeftSide {...props} />
        ) : isSaved ? (
          <SavedQuestionLeftSide {...props} lastEditInfo={lastEditInfo} />
        ) : (
          <AhHocQuestionLeftSide
            {...props}
            isNative={isNative}
            isSummarized={isSummarized}
          />
        )}
        <ViewTitleHeaderRightSide
          {...props}
          isSaved={isSaved}
          isDataset={isDataset}
          isNative={isNative}
          isSummarized={isSummarized}
          areFiltersExpanded={areFiltersExpanded}
          onExpandFilters={expandFilters}
          onCollapseFilters={collapseFilters}
        />
      </ViewHeaderContainer>
      {QuestionFilters.shouldRender(props) && (
        <FilterHeader
          {...props}
          expanded={areFiltersExpanded}
          question={question}
        />
      )}
    </>
  );
}

SavedQuestionLeftSide.propTypes = {
  question: PropTypes.object.isRequired,
  lastEditInfo: PropTypes.object,
  isShowingQuestionDetailsSidebar: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
  onOpenQuestionDetails: PropTypes.func.isRequired,
  onCloseQuestionDetails: PropTypes.func.isRequired,
  onOpenQuestionHistory: PropTypes.func.isRequired,
};

function SavedQuestionLeftSide(props) {
  const {
    question,
    isObjectDetail,
    isShowingQuestionDetailsSidebar,
    onOpenQuestionDetails,
    onCloseQuestionDetails,
    lastEditInfo,
    onOpenQuestionHistory,
  } = props;

  const onHeaderClick = useCallback(() => {
    if (isShowingQuestionDetailsSidebar) {
      onCloseQuestionDetails();
    } else {
      onOpenQuestionDetails({ closeOtherSidebars: true });
    }
  }, [
    isShowingQuestionDetailsSidebar,
    onOpenQuestionDetails,
    onCloseQuestionDetails,
  ]);

  return (
    <div>
      <ViewHeaderMainLeftContentContainer>
        <SavedQuestionHeaderButtonContainer>
          <SavedQuestionHeaderButton
            question={question}
            isActive={isShowingQuestionDetailsSidebar}
            onClick={onHeaderClick}
          />
        </SavedQuestionHeaderButtonContainer>
        {lastEditInfo && (
          <StyledLastEditInfoLabel
            item={question.card()}
            onClick={onOpenQuestionHistory}
          />
        )}
      </ViewHeaderMainLeftContentContainer>
      <ViewHeaderLeftSubHeading>
        <StyledCollectionBadge collectionId={question.collectionId()} />
        {QuestionDataSource.shouldRender(props) && (
          <StyledQuestionDataSource
            question={question}
            isObjectDetail={isObjectDetail}
            subHead
          />
        )}
      </ViewHeaderLeftSubHeading>
    </div>
  );
}

AhHocQuestionLeftSide.propTypes = {
  question: PropTypes.object.isRequired,
  originalQuestion: PropTypes.object,
  isNative: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
  isSummarized: PropTypes.bool,
  onExpandFilters: PropTypes.func.isRequired,
  onCollapseFilters: PropTypes.func.isRequired,
};

function AhHocQuestionLeftSide(props) {
  const {
    question,
    originalQuestion,
    isNative,
    isObjectDetail,
    isSummarized,
  } = props;
  return (
    <div>
      <ViewHeaderMainLeftContentContainer>
        <AdHocViewHeading>
          {isNative ? (
            t`New question`
          ) : (
            <QuestionDescription
              question={question}
              originalQuestion={originalQuestion}
              isObjectDetail={isObjectDetail}
            />
          )}
        </AdHocViewHeading>
        {QuestionLineage.shouldRender(props) && (
          <QuestionLineage
            question={question}
            originalQuestion={originalQuestion}
          />
        )}
      </ViewHeaderMainLeftContentContainer>
      <ViewHeaderLeftSubHeading>
        {isSummarized && (
          <QuestionDataSource
            className="mb1"
            question={question}
            isObjectDetail={isObjectDetail}
            subHead
            data-metabase-event={`Question Data Source Click`}
          />
        )}
      </ViewHeaderLeftSubHeading>
    </div>
  );
}

DatasetLeftSide.propTypes = {
  question: PropTypes.object.isRequired,
  isShowingQuestionDetailsSidebar: PropTypes.bool,
  onOpenQuestionDetails: PropTypes.func.isRequired,
  onCloseQuestionDetails: PropTypes.func.isRequired,
};

function DatasetLeftSide(props) {
  const {
    question,
    isShowingQuestionDetailsSidebar,
    onOpenQuestionDetails,
    onCloseQuestionDetails,
  } = props;

  const onHeaderClick = useCallback(() => {
    if (isShowingQuestionDetailsSidebar) {
      onCloseQuestionDetails();
    } else {
      onOpenQuestionDetails({ closeOtherSidebars: true });
    }
  }, [
    isShowingQuestionDetailsSidebar,
    onOpenQuestionDetails,
    onCloseQuestionDetails,
  ]);

  return (
    <div>
      <ViewHeaderMainLeftContentContainer>
        <AdHocViewHeading>
          <HeadBreadcrumbs
            divider="/"
            parts={[
              <DatasetCollectionBadge key="collection" dataset={question} />,
              <DatasetHeaderButtonContainer key="dataset-header-button">
                <SavedQuestionHeaderButton
                  question={question}
                  isActive={isShowingQuestionDetailsSidebar}
                  onClick={onHeaderClick}
                />
              </DatasetHeaderButtonContainer>,
            ]}
          />
        </AdHocViewHeading>
      </ViewHeaderMainLeftContentContainer>
    </div>
  );
}

DatasetCollectionBadge.propTypes = {
  dataset: PropTypes.object.isRequired,
};

function DatasetCollectionBadge({ dataset }) {
  const { collection } = dataset.card();
  return (
    <HeadBreadcrumbs.Badge to={Urls.collection(collection)} icon="model">
      {collection?.name || t`Our analytics`}
    </HeadBreadcrumbs.Badge>
  );
}

ViewTitleHeaderRightSide.propTypes = {
  question: PropTypes.object.isRequired,
  result: PropTypes.object,
  queryBuilderMode: PropTypes.oneOf(["view", "notebook"]),
  isDataset: PropTypes.bool,
  isSaved: PropTypes.bool,
  isNative: PropTypes.bool,
  isRunnable: PropTypes.bool,
  isRunning: PropTypes.bool,
  isPreviewing: PropTypes.bool,
  isNativeEditorOpen: PropTypes.bool,
  isShowingFilterSidebar: PropTypes.bool,
  isShowingSummarySidebar: PropTypes.bool,
  isDirty: PropTypes.bool,
  isResultDirty: PropTypes.bool,
  runQuestionQuery: PropTypes.func,
  cancelQuery: PropTypes.func,
  onOpenModal: PropTypes.func,
  onAddFilter: PropTypes.func,
  onCloseFilter: PropTypes.func,
  onEditSummary: PropTypes.func,
  onCloseSummary: PropTypes.func,
  setQueryBuilderMode: PropTypes.func,
  areFiltersExpanded: PropTypes.bool,
  onExpandFilters: PropTypes.func,
  onCollapseFilters: PropTypes.func,
};

function ViewTitleHeaderRightSide(props) {
  const {
    question,
    result,
    queryBuilderMode,
    isSaved,
    isDataset,
    isNative,
    isRunnable,
    isRunning,
    isPreviewing,
    isNativeEditorOpen,
    isShowingFilterSidebar,
    isShowingSummarySidebar,
    isDirty,
    isResultDirty,
    runQuestionQuery,
    cancelQuery,
    onOpenModal,
    onAddFilter,
    onCloseFilter,
    onEditSummary,
    onCloseSummary,
    setQueryBuilderMode,
    areFiltersExpanded,
    onExpandFilters,
    onCollapseFilters,
  } = props;
  const isShowingNotebook = queryBuilderMode === "notebook";
  const query = question.query();
  const isReadOnlyQuery = query.readOnly();
  const canEditQuery = !isReadOnlyQuery;
  const canRunAdhocQueries = !isReadOnlyQuery;
  const canNest = query.canNest();
  const hasExploreResultsLink =
    isNative &&
    canNest &&
    isSaved &&
    canRunAdhocQueries &&
    MetabaseSettings.get("enable-nested-queries");

  const isNewQuery = !query.hasData();
  const hasSaveButton = !isDataset && !!isDirty && (isNewQuery || canEditQuery);
  const isMissingPermissions =
    result?.error_type === SERVER_ERROR_TYPES.missingPermissions;
  const hasRunButton =
    isRunnable && !isNativeEditorOpen && !isMissingPermissions;

  return (
    <div
      className="ml-auto flex align-center"
      data-testid="qb-header-action-panel"
    >
      {hasSaveButton && (
        <SaveButton
          disabled={!question.canRun() || !canEditQuery}
          tooltip={{
            tooltip: t`You don't have permission to save this question.`,
            isEnabled: !canEditQuery,
            placement: "left",
          }}
          data-metabase-event={
            isShowingNotebook
              ? `Notebook Mode; Click Save`
              : `View Mode; Click Save`
          }
          onClick={() => onOpenModal("save")}
        >
          {t`Save`}
        </SaveButton>
      )}
      {QuestionFilters.shouldRender(props) && (
        <FilterHeaderToggle
          className="ml2 mr1"
          question={question}
          expanded={areFiltersExpanded}
          onExpand={onExpandFilters}
          onCollapse={onCollapseFilters}
        />
      )}
      {QuestionFilterWidget.shouldRender(props) && (
        <QuestionFilterWidget
          className="hide sm-show"
          ml={1}
          isShowingFilterSidebar={isShowingFilterSidebar}
          onAddFilter={onAddFilter}
          onCloseFilter={onCloseFilter}
          data-metabase-event={`View Mode; Open Filter Widget`}
        />
      )}
      {QuestionSummarizeWidget.shouldRender(props) && (
        <QuestionSummarizeWidget
          className="hide sm-show"
          ml={1}
          isShowingSummarySidebar={isShowingSummarySidebar}
          onEditSummary={onEditSummary}
          onCloseSummary={onCloseSummary}
          data-metabase-event={`View Mode; Open Summary Widget`}
        />
      )}
      {QuestionNotebookButton.shouldRender({ question }) && (
        <QuestionNotebookButton
          className="hide sm-show"
          ml={2}
          question={question}
          isShowingNotebook={isShowingNotebook}
          setQueryBuilderMode={setQueryBuilderMode}
          data-metabase-event={
            isShowingNotebook
              ? `Notebook Mode;Go to View Mode`
              : `View Mode; Go to Notebook Mode`
          }
        />
      )}
      {NativeQueryButton.shouldRender(props) && (
        <NativeQueryButton
          size={16}
          question={question}
          data-metabase-event={`Notebook Mode; Convert to SQL Click`}
        />
      )}
      {hasExploreResultsLink && <ExploreResultsLink question={question} />}
      {hasRunButton && (
        <RunButtonWithTooltip
          className={cx("text-brand-hover text-dark hide", {
            "sm-show": !isShowingNotebook || isNative,
            "text-white-hover": isResultDirty,
          })}
          medium
          borderless
          ml={1}
          compact
          result={result}
          isRunning={isRunning}
          isDirty={isResultDirty}
          isPreviewing={isPreviewing}
          onRun={() => runQuestionQuery({ ignoreCache: true })}
          onCancel={cancelQuery}
        />
      )}
    </div>
  );
}

ExploreResultsLink.propTypes = {
  question: PropTypes.object.isRequired,
};

function ExploreResultsLink({ question }) {
  const url = question
    .composeThisQuery()
    .setDisplay("table")
    .setSettings({})
    .getUrl();

  return (
    <Link to={url}>
      <ViewButton medium p={[2, 1]} icon="insight" labelBreakpoint="sm">
        {t`Explore results`}
      </ViewButton>
    </Link>
  );
}

ViewTitleHeader.propTypes = viewTitleHeaderPropTypes;

const viewSubHeaderPropTypes = {
  isPreviewable: PropTypes.bool,
  isPreviewing: PropTypes.bool,
  setIsPreviewing: PropTypes.func,
};

export class ViewSubHeader extends React.Component {
  render() {
    const { isPreviewable, isPreviewing, setIsPreviewing } = this.props;

    const middle = [];
    const left = [];
    const right = [];

    if (isPreviewable) {
      right.push(
        <QuestionPreviewToggle
          key="preview"
          className="ml2"
          isPreviewing={isPreviewing}
          setIsPreviewing={setIsPreviewing}
        />,
      );
    }

    return left.length > 0 || middle.length > 0 || right.length > 0 ? (
      <ViewSubHeaderRoot>
        <ButtonBar
          className="flex-full"
          left={left}
          center={middle}
          right={right}
        />
      </ViewSubHeaderRoot>
    ) : null;
  }
}

ViewSubHeader.propTypes = viewSubHeaderPropTypes;
