import { match } from "ts-pattern";

import { useSelector } from "metabase/lib/redux";
import { PLUGIN_AI_ANALYSIS } from "metabase/plugins";
import { QuestionInfoSidebar } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "metabase/query_builder/components/view/sidebars/QuestionSettingsSidebar";
import { SummarizeSidebar } from "metabase/query_builder/components/view/sidebars/SummarizeSidebar";
import TimelineSidebar from "metabase/query_builder/components/view/sidebars/TimelineSidebar";
import * as Lib from "metabase-lib";

const getIsExplainSidebarVisible = (state) =>
  state.plugins?.aiAnalysisPlugin?.isExplainSidebarVisible || false;

const MetabotExplainSidebar = PLUGIN_AI_ANALYSIS.ExplainSidebar;

export const StructuredQueryRightSidebar = ({
  deselectTimelineEvents,
  hideTimelineEvents,
  isShowingQuestionInfoSidebar,
  isShowingQuestionSettingsSidebar,
  isShowingSummarySidebar,
  isShowingTimelineSidebar,
  onCloseQuestionInfo,
  onCloseSummary,
  onCloseTimelines,
  onOpenModal,
  onSave,
  question,
  selectTimelineEvents,
  selectedTimelineEventIds,
  showTimelineEvents,
  timelines,
  updateQuestion,
  visibleTimelineEventIds,
  xDomain,
}) => {
  const isShowingMetabotExplainSidebar = useSelector(
    getIsExplainSidebarVisible,
  );

  return match({
    isSaved: question.isSaved(),
    isShowingSummarySidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
    isShowingMetabotExplainSidebar,
  })
    .with(
      {
        isShowingMetabotExplainSidebar: true,
      },
      () => <MetabotExplainSidebar />,
    )
    .with(
      {
        isShowingSummarySidebar: true,
      },
      () => (
        <SummarizeSidebar
          query={question.query()}
          onQueryChange={(nextQuery) => {
            const datesetQuery = Lib.toLegacyQuery(nextQuery);
            const nextQuestion = question.setDatasetQuery(datesetQuery);
            updateQuestion(nextQuestion.setDefaultDisplay(), {
              run: true,
            });
          }}
          onClose={onCloseSummary}
          stageIndex={-1}
        />
      ),
    )
    .with({ isShowingTimelineSidebar: true }, () => (
      <TimelineSidebar
        question={question}
        timelines={timelines}
        visibleTimelineEventIds={visibleTimelineEventIds}
        selectedTimelineEventIds={selectedTimelineEventIds}
        xDomain={xDomain}
        onShowTimelineEvents={showTimelineEvents}
        onHideTimelineEvents={hideTimelineEvents}
        onSelectTimelineEvents={selectTimelineEvents}
        onDeselectTimelineEvents={deselectTimelineEvents}
        onOpenModal={onOpenModal}
        onClose={onCloseTimelines}
      />
    ))
    .with(
      {
        isSaved: true,
        isShowingQuestionInfoSidebar: true,
      },
      () => (
        <QuestionInfoSidebar
          question={question}
          onSave={onSave}
          onClose={onCloseQuestionInfo}
        />
      ),
    )
    .with(
      {
        isSaved: true,
        isShowingQuestionSettingsSidebar: true,
      },
      () => <QuestionSettingsSidebar question={question} />,
    )
    .otherwise(() => null);
};
