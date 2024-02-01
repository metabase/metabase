import { useEffect, useCallback, useState } from "react";
import PropTypes from "prop-types";
import { t, ngettext, msgid } from "ttag";
import { usePrevious } from "react-use";

import * as Lib from "metabase-lib";
import * as Urls from "metabase/lib/urls";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import MetabaseSettings from "metabase/lib/settings";
import { useToggle } from "metabase/hooks/use-toggle";
import Link from "metabase/core/components/Link";
import Tooltip from "metabase/core/components/Tooltip";

import SavedQuestionHeaderButton from "metabase/query_builder/components/SavedQuestionHeaderButton/SavedQuestionHeaderButton";

import { navigateBackToDashboard } from "metabase/query_builder/actions";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { getDashboard } from "metabase/query_builder/selectors";
import QuestionActions from "../QuestionActions";
import { ExploreResultsLink } from "./ExploreResultsLink";
import { FilterHeaderButton } from "./FilterHeaderButton";
import { HeadBreadcrumbs } from "./HeaderBreadcrumbs";
import QuestionDataSource from "./QuestionDataSource";
import QuestionDescription from "./QuestionDescription";
import { QuestionNotebookButton } from "./QuestionNotebookButton";
import ConvertQueryButton from "./ConvertQueryButton";
import { FilterHeaderToggle, FilterHeader } from "./QuestionFilters";
import { QuestionSummarizeWidget } from "./QuestionSummaries";
import {
  AdHocViewHeading,
  SaveButton,
  SavedQuestionHeaderButtonContainer,
  ViewHeaderMainLeftContentContainer,
  ViewHeaderLeftSubHeading,
  ViewHeaderContainer,
  StyledLastEditInfoLabel,
  StyledQuestionDataSource,
  SavedQuestionLeftSideRoot,
  AdHocLeftSideRoot,
  HeaderDivider,
  ViewHeaderActionPanel,
  ViewHeaderIconButtonContainer,
  BackButton,
  BackButtonContainer,
  ViewRunButtonWithTooltip,
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
  isNavBarOpen: PropTypes.bool,
  isShowingSummarySidebar: PropTypes.bool,
  isShowingQuestionDetailsSidebar: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
  isAdditionalInfoVisible: PropTypes.bool,

  runQuestionQuery: PropTypes.func,
  cancelQuery: PropTypes.func,
  updateQuestion: PropTypes.func,

  onOpenModal: PropTypes.func,
  onEditSummary: PropTypes.func,
  onCloseSummary: PropTypes.func,
  onOpenQuestionDetails: PropTypes.func,

  className: PropTypes.string,
  style: PropTypes.object,

  requiredTemplateTags: PropTypes.array,
};

export function ViewTitleHeader(props) {
  const { question, className, style, isNavBarOpen, updateQuestion } = props;

  const [
    areFiltersExpanded,
    { turnOn: expandFilters, turnOff: collapseFilters },
  ] = useToggle(!question?.isSaved());

  const previousQuestion = usePrevious(question);

  const query = question.query();
  const previousQuery = usePrevious(query);

  useEffect(() => {
    const { isNative } = Lib.queryDisplayInfo(query);
    const isPreviousQuestionNative =
      previousQuery && Lib.queryDisplayInfo(previousQuery).isNative;

    if (isNative || isPreviousQuestionNative) {
      return;
    }

    const filtersCount = Lib.filters(query, -1).length;
    const previousFiltersCount =
      previousQuery && Lib.filters(previousQuery, -1).length;

    if (filtersCount > previousFiltersCount) {
      expandFilters();
    }
  }, [previousQuestion, question, expandFilters, previousQuery, query]);

  const { isNative } = Lib.queryDisplayInfo(query);
  const isSaved = question.isSaved();
  const isDataset = question.isDataset();
  const isSummarized = Lib.aggregations(query, -1).length > 0;

  const onQueryChange = useCallback(
    newQuery => {
      updateQuestion(newQuery.question(), { run: true });
    },
    [updateQuestion],
  );

  return (
    <>
      <ViewHeaderContainer
        className={className}
        style={style}
        data-testid="qb-header"
        isNavBarOpen={isNavBarOpen}
      >
        <DashboardBackButton />
        {isSaved ? (
          <SavedQuestionLeftSide {...props} />
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
          onQueryChange={onQueryChange}
        />
      </ViewHeaderContainer>
      {FilterHeader.shouldRender(props) && (
        <FilterHeader
          {...props}
          expanded={areFiltersExpanded}
          question={question}
          onQueryChange={onQueryChange}
        />
      )}
    </>
  );
}

function DashboardBackButton() {
  const dashboard = useSelector(getDashboard);
  const dispatch = useDispatch();

  const handleClick = () => {
    dispatch(navigateBackToDashboard(dashboard.id));
  };

  if (!dashboard) {
    return null;
  }

  const label = t`Back to ${dashboard.name}`;

  return (
    <Tooltip tooltip={label}>
      <BackButtonContainer>
        <BackButton
          as={Link}
          to={Urls.dashboard(dashboard)}
          round
          icon="arrow_left"
          aria-label={label}
          onClick={handleClick}
        />
      </BackButtonContainer>
    </Tooltip>
  );
}

SavedQuestionLeftSide.propTypes = {
  question: PropTypes.object.isRequired,
  isObjectDetail: PropTypes.bool,
  isAdditionalInfoVisible: PropTypes.bool,
  isShowingQuestionDetailsSidebar: PropTypes.bool,
  onOpenQuestionInfo: PropTypes.func.isRequired,
  onSave: PropTypes.func,
};

function SavedQuestionLeftSide(props) {
  const {
    question,
    isObjectDetail,
    isAdditionalInfoVisible,
    onOpenQuestionInfo,
    onSave,
  } = props;

  const [showSubHeader, setShowSubHeader] = useState(true);

  useEffect(() => {
    const timerId = setTimeout(() => {
      setShowSubHeader(false);
    }, 4000);
    return () => clearTimeout(timerId);
  }, []);

  const hasLastEditInfo = question.lastEditInfo() != null;
  const isDataset = question.isDataset();

  const onHeaderChange = useCallback(
    name => {
      if (name && name !== question.displayName()) {
        onSave(question.setDisplayName(name));
      }
    },
    [question, onSave],
  );

  return (
    <SavedQuestionLeftSideRoot
      data-testid="qb-header-left-side"
      showSubHeader={showSubHeader}
    >
      <ViewHeaderMainLeftContentContainer>
        <SavedQuestionHeaderButtonContainer isDataset={isDataset}>
          <HeadBreadcrumbs
            divider={<HeaderDivider>/</HeaderDivider>}
            parts={[
              ...(isAdditionalInfoVisible && isDataset
                ? [
                    <DatasetCollectionBadge
                      key="collection"
                      dataset={question}
                    />,
                  ]
                : []),

              <SavedQuestionHeaderButton
                key={question.displayName()}
                question={question}
                onSave={onHeaderChange}
              />,
            ]}
          />
        </SavedQuestionHeaderButtonContainer>
      </ViewHeaderMainLeftContentContainer>
      {isAdditionalInfoVisible && (
        <ViewHeaderLeftSubHeading>
          {QuestionDataSource.shouldRender(props) && !isDataset && (
            <StyledQuestionDataSource
              question={question}
              isObjectDetail={isObjectDetail}
              subHead
            />
          )}
          {hasLastEditInfo && isAdditionalInfoVisible && (
            <StyledLastEditInfoLabel
              item={question.card()}
              onClick={onOpenQuestionInfo}
            />
          )}
        </ViewHeaderLeftSubHeading>
      )}
    </SavedQuestionLeftSideRoot>
  );
}

AhHocQuestionLeftSide.propTypes = {
  question: PropTypes.object.isRequired,
  originalQuestion: PropTypes.object,
  isNative: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
  isSummarized: PropTypes.bool,
  onOpenModal: PropTypes.func,
};

function AhHocQuestionLeftSide(props) {
  const {
    question,
    originalQuestion,
    isNative,
    isObjectDetail,
    isSummarized,
    onOpenModal,
  } = props;

  const handleTitleClick = () => {
    const { isEditable } = Lib.queryDisplayInfo(question.query());

    if (isEditable) {
      onOpenModal(MODAL_TYPES.SAVE);
    }
  };

  return (
    <AdHocLeftSideRoot>
      <ViewHeaderMainLeftContentContainer>
        <AdHocViewHeading color="medium">
          {isNative ? (
            t`New question`
          ) : (
            <QuestionDescription
              question={question}
              originalQuestion={originalQuestion}
              isObjectDetail={isObjectDetail}
              onClick={handleTitleClick}
            />
          )}
        </AdHocViewHeading>
      </ViewHeaderMainLeftContentContainer>
      <ViewHeaderLeftSubHeading>
        {isSummarized && (
          <QuestionDataSource
            className="mb1"
            question={question}
            isObjectDetail={isObjectDetail}
            subHead
          />
        )}
      </ViewHeaderLeftSubHeading>
    </AdHocLeftSideRoot>
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
  isNativeEditorOpen: PropTypes.bool,
  isShowingSummarySidebar: PropTypes.bool,
  isDirty: PropTypes.bool,
  isResultDirty: PropTypes.bool,
  isActionListVisible: PropTypes.bool,
  runQuestionQuery: PropTypes.func,
  updateQuestion: PropTypes.func.isRequired,
  cancelQuery: PropTypes.func,
  onOpenModal: PropTypes.func,
  onEditSummary: PropTypes.func,
  onCloseSummary: PropTypes.func,
  setQueryBuilderMode: PropTypes.func,
  turnDatasetIntoQuestion: PropTypes.func,
  areFiltersExpanded: PropTypes.bool,
  onExpandFilters: PropTypes.func,
  onCollapseFilters: PropTypes.func,
  isBookmarked: PropTypes.bool,
  toggleBookmark: PropTypes.func,
  onOpenQuestionInfo: PropTypes.func,
  onCloseQuestionInfo: PropTypes.func,
  isShowingQuestionInfoSidebar: PropTypes.bool,
  onModelPersistenceChange: PropTypes.func,
  onQueryChange: PropTypes.func,
  requiredTemplateTags: PropTypes.array,
};

function ViewTitleHeaderRightSide(props) {
  const {
    question,
    result,
    queryBuilderMode,
    isBookmarked,
    toggleBookmark,
    isSaved,
    isDataset,
    isRunnable,
    isRunning,
    isNativeEditorOpen,
    isShowingSummarySidebar,
    isDirty,
    isResultDirty,
    isActionListVisible,
    runQuestionQuery,
    cancelQuery,
    onOpenModal,
    onEditSummary,
    onCloseSummary,
    setQueryBuilderMode,
    turnDatasetIntoQuestion,
    areFiltersExpanded,
    onExpandFilters,
    onCollapseFilters,
    isShowingQuestionInfoSidebar,
    onCloseQuestionInfo,
    onOpenQuestionInfo,
    onModelPersistenceChange,
    requiredTemplateTags,
  } = props;
  const isShowingNotebook = queryBuilderMode === "notebook";
  const { isEditable } = Lib.queryDisplayInfo(question.query());
  const hasExploreResultsLink =
    question.canExploreResults() &&
    MetabaseSettings.get("enable-nested-queries");

  // Models can't be saved. But changing anything about the model will prompt the user
  // to save it as a new question (based on that model). In other words, at this point
  // the `dataset` field is set to false.
  const hasSaveButton = !isDataset && !!isDirty && isActionListVisible;
  const isMissingPermissions =
    result?.error_type === SERVER_ERROR_TYPES.missingPermissions;
  const hasRunButton =
    isRunnable && !isNativeEditorOpen && !isMissingPermissions;

  const handleInfoClick = useCallback(() => {
    if (isShowingQuestionInfoSidebar) {
      onCloseQuestionInfo();
    } else {
      onOpenQuestionInfo();
    }
  }, [isShowingQuestionInfoSidebar, onOpenQuestionInfo, onCloseQuestionInfo]);

  const getRunButtonLabel = useCallback(
    () => (isRunning ? t`Cancel` : t`Refresh`),
    [isRunning],
  );

  const isSaveDisabled = !question.canRun() || !isEditable;
  const disabledSaveTooltip = getDisabledSaveTooltip(
    question,
    isEditable,
    requiredTemplateTags,
  );

  return (
    <ViewHeaderActionPanel data-testid="qb-header-action-panel">
      {FilterHeaderToggle.shouldRender(props) && (
        <FilterHeaderToggle
          className="ml2 mr1"
          query={question.query()}
          isExpanded={areFiltersExpanded}
          onExpand={onExpandFilters}
          onCollapse={onCollapseFilters}
        />
      )}
      {FilterHeaderButton.shouldRender(props) && (
        <FilterHeaderButton
          className="hide sm-show"
          onOpenModal={onOpenModal}
        />
      )}
      {QuestionSummarizeWidget.shouldRender(props) && (
        <QuestionSummarizeWidget
          className="hide sm-show"
          isShowingSummarySidebar={isShowingSummarySidebar}
          onEditSummary={onEditSummary}
          onCloseSummary={onCloseSummary}
        />
      )}
      {QuestionNotebookButton.shouldRender(props) && (
        <ViewHeaderIconButtonContainer>
          <QuestionNotebookButton
            iconSize={16}
            question={question}
            isShowingNotebook={isShowingNotebook}
            setQueryBuilderMode={setQueryBuilderMode}
          />
        </ViewHeaderIconButtonContainer>
      )}
      {ConvertQueryButton.shouldRender(props) && (
        <ConvertQueryButton question={question} onOpenModal={onOpenModal} />
      )}
      {hasExploreResultsLink && <ExploreResultsLink question={question} />}
      {hasRunButton && !isShowingNotebook && (
        <ViewHeaderIconButtonContainer>
          <ViewRunButtonWithTooltip
            iconSize={16}
            onlyIcon
            medium
            compact
            result={result}
            isRunning={isRunning}
            isDirty={isResultDirty}
            onRun={() => runQuestionQuery({ ignoreCache: true })}
            onCancel={cancelQuery}
            getTooltip={getRunButtonLabel}
          />
        </ViewHeaderIconButtonContainer>
      )}
      {isSaved && (
        <QuestionActions
          isShowingQuestionInfoSidebar={isShowingQuestionInfoSidebar}
          isBookmarked={isBookmarked}
          handleBookmark={toggleBookmark}
          onOpenModal={onOpenModal}
          question={question}
          setQueryBuilderMode={setQueryBuilderMode}
          turnDatasetIntoQuestion={turnDatasetIntoQuestion}
          onInfoClick={handleInfoClick}
          onModelPersistenceChange={onModelPersistenceChange}
        />
      )}
      {hasSaveButton && (
        <SaveButton
          role="button"
          disabled={isSaveDisabled}
          tooltip={{
            tooltip: disabledSaveTooltip,
            isEnabled: isSaveDisabled,
            placement: "left",
          }}
          onClick={() => onOpenModal("save")}
        >
          {t`Save`}
        </SaveButton>
      )}
    </ViewHeaderActionPanel>
  );
}

ViewTitleHeader.propTypes = viewTitleHeaderPropTypes;

function getDisabledSaveTooltip(
  question,
  isEditable,
  requiredTemplateTags = [],
) {
  if (!isEditable) {
    return t`You don't have permission to save this question.`;
  }

  const missingValueRequiredTTags = requiredTemplateTags.filter(
    tag => tag.required && !tag.default,
  );

  if (!question.canRun()) {
    return getMissingRequiredTemplateTagsTooltip(missingValueRequiredTTags);
  }

  // Having an empty tooltip text is ok because it won't be shown.
  return "";
}

function getMissingRequiredTemplateTagsTooltip(requiredTemplateTags = []) {
  if (!requiredTemplateTags.length) {
    return "";
  }

  const names = requiredTemplateTags
    .map(tag => `"${tag["display-name"] ?? tag.name}"`)
    .join(", ");

  return ngettext(
    msgid`The ${names} variable requires a default value but none was provided.`,
    `The ${names} variables require default values but none were provided.`,
    requiredTemplateTags.length,
  );
}
