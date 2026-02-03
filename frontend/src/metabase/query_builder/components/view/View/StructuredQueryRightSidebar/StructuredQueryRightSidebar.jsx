import { match } from "ts-pattern";

import { PLUGIN_AI_ENTITY_ANALYSIS } from "metabase/plugins";
import { QuestionInfoSidebar } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "metabase/query_builder/components/view/sidebars/QuestionSettingsSidebar";
import { SummarizeSidebar } from "metabase/query_builder/components/view/sidebars/SummarizeSidebar";
import { TimelineSidebar } from "metabase/query_builder/components/view/sidebars/TimelineSidebar";

export const StructuredQueryRightSidebar = ({
  deselectTimelineEvents,
  hideTimelineEvents,
  isShowingQuestionInfoSidebar,
  isShowingQuestionSettingsSidebar,
  isShowingAIQuestionAnalysisSidebar,
  isShowingSummarySidebar,
  isShowingTimelineSidebar,
  onCloseQuestionInfo,
  onCloseSummary,
  onCloseAIQuestionAnalysisSidebar,
  onCloseTimelines,
  onOpenModal,
  onSave,
  question,
  selectTimelineEvents,
  selectedTimelineEventIds,
  showTimelineEvents,
  timelineEvents,
  timelines,
  updateQuestion,
  visibleTimelineEventIds,
  xDomain,
}) => {
  return match({
    isSaved: question.isSaved(),
    isShowingSummarySidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
    isShowingAIQuestionAnalysisSidebar,
  })
    .with(
      {
        isShowingAIQuestionAnalysisSidebar: true,
      },
      () => (
        <PLUGIN_AI_ENTITY_ANALYSIS.AIQuestionAnalysisSidebar
          question={question}
          visibleTimelineEvents={timelineEvents}
          timelines={timelines}
          onClose={onCloseAIQuestionAnalysisSidebar}
        />
      ),
    )
    .with(
      {
        isShowingSummarySidebar: true,
      },
      () => (
        <SummarizeSidebar
          query={question.query()}
          onQueryChange={(nextQuery) => {
            const nextQuestion = question.setQuery(nextQuery);
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
