import type { Dayjs } from "dayjs";
import { match } from "ts-pattern";

import { AIQuestionAnalysisSidebar } from "metabase/query_builder/components/AIQuestionAnalysisSidebar";
import { QuestionInfoSidebar } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "metabase/query_builder/components/view/sidebars/QuestionSettingsSidebar";
import { SummarizeSidebar } from "metabase/query_builder/components/view/sidebars/SummarizeSidebar";
import { TimelineSidebar } from "metabase/query_builder/components/view/sidebars/TimelineSidebar";
import type { QueryModalType } from "metabase/querying/constants";
import type Question from "metabase-lib/v1/Question";
import type { Timeline, TimelineEvent } from "metabase-types/api";

interface StructuredQueryRightSidebarProps {
  deselectTimelineEvents: () => void;
  hideTimelineEvents: (timelineEvents: TimelineEvent[]) => void;
  isShowingQuestionInfoSidebar: boolean;
  isShowingQuestionSettingsSidebar: boolean;
  isShowingAIQuestionAnalysisSidebar: boolean;
  isShowingSummarySidebar: boolean;
  isShowingTimelineSidebar: boolean;
  onCloseSummary: () => void;
  onCloseAIQuestionAnalysisSidebar: () => void;
  onCloseTimelines: () => void;
  onOpenModal: (modal: QueryModalType, modalContext?: unknown) => void;
  onSave: (question: Question) => Promise<void>;
  question: Question;
  selectTimelineEvents: (timelineEvents: TimelineEvent[]) => void;
  selectedTimelineEventIds: number[];
  showTimelineEvents: (timelineEvents: TimelineEvent[]) => void;
  timelineEvents?: TimelineEvent[];
  timelines: Timeline[];
  updateQuestion: (question: Question, opts?: { run?: boolean }) => void;
  visibleTimelineEventIds: number[];
  xDomain?: [Dayjs, Dayjs];
}

export const StructuredQueryRightSidebar = ({
  deselectTimelineEvents,
  hideTimelineEvents,
  isShowingQuestionInfoSidebar,
  isShowingQuestionSettingsSidebar,
  isShowingAIQuestionAnalysisSidebar,
  isShowingSummarySidebar,
  isShowingTimelineSidebar,
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
}: StructuredQueryRightSidebarProps) => {
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
        <AIQuestionAnalysisSidebar
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
        collectionId={question.collectionId()}
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
      () => <QuestionInfoSidebar question={question} onSave={onSave} />,
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
