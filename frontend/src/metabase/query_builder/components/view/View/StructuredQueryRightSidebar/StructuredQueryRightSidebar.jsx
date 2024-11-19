import { match } from "ts-pattern";

import { QuestionInfoSidebar } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "metabase/query_builder/components/view/sidebars/QuestionSettingsSidebar";
import { SummarizeSidebar } from "metabase/query_builder/components/view/sidebars/SummarizeSidebar";
import TimelineSidebar from "metabase/query_builder/components/view/sidebars/TimelineSidebar";
import * as Lib from "metabase-lib";

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
}) =>
  match({
    isSaved: question.isSaved(),
    isShowingSummarySidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
  })
    .with(
      {
        isShowingSummarySidebar: true,
      },
      () => (
        <SummarizeSidebar
          query={question.query()}
          onQueryChange={nextQuery => {
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
