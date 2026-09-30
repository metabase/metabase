import { match } from "ts-pattern";

import type { Dayjs } from "metabase/dayjs";
import type { QueryModalType } from "metabase/redux/store";
import type Question from "metabase-lib/v1/Question";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import { QuestionInfoSidebar } from "../../sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "../../sidebars/QuestionSettingsSidebar";
import { SummarizeSidebar } from "../../sidebars/SummarizeSidebar";
import { TimelineSidebar } from "../../sidebars/TimelineSidebar";

interface StructuredQueryRightSidebarProps {
  deselectTimelineEvents: () => void;
  hideTimelineEvents: (timelineEvents: TimelineEvent[]) => void;
  isShowingQuestionInfoSidebar: boolean;
  isShowingQuestionSettingsSidebar: boolean;
  isShowingSummarySidebar: boolean;
  isShowingTimelineSidebar: boolean;
  onCloseSummary: () => void;
  onCloseTimelines: () => void;
  onOpenModal: (modal: QueryModalType, modalContext?: unknown) => void;
  onSave: (question: Question) => Promise<void>;
  question: Question;
  selectTimelineEvents: (timelineEvents: TimelineEvent[]) => void;
  selectedTimelineEventIds: number[];
  showTimelineEvents: (timelineEvents: TimelineEvent[]) => void;
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
  isShowingSummarySidebar,
  isShowingTimelineSidebar,
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
}: StructuredQueryRightSidebarProps) => {
  return match({
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
