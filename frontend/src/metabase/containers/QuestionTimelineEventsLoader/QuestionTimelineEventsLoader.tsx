import React, { useMemo } from "react";
import { Timeline, TimelineEvent } from "metabase-types/api/timeline";
import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Timelines from "metabase/entities/timelines";

interface TimelineWithEvents extends Timeline {
  events: TimelineEvent[];
}

type TimelinesListLoaderRenderProps = {
  allError: null | boolean;
  allFetched: boolean;
  allLoaded: boolean;
  allLoading: boolean;
  fetched: boolean;
  loaded: boolean;
  loading: boolean;
  error: null | unknown;
  list: TimelineWithEvents[];
  timelines: TimelineWithEvents[];
};

const NO_TIMELINES_LOADER_PROPS: TimelinesListLoaderRenderProps = {
  allError: null,
  allFetched: false,
  allLoaded: false,
  allLoading: false,
  fetched: false,
  loaded: false,
  loading: false,
  error: null,
  list: [],
  timelines: [],
};

type Props = {
  question?: Question;
  children: (props: TimelinesListLoaderRenderProps) => JSX.Element;
};

function hasBreakdownByDatetime(question: Question) {
  const query = question.query() as StructuredQuery;
  const breakouts = query.breakouts();
  return breakouts.some(breakout => {
    const field = breakout.field();
    return field.isDate() || field.isTime();
  });
}

function QuestionTimelineEventsLoader({ question, children }: Props) {
  const timelinesQuery = useMemo(() => {
    if (
      !question ||
      !question.isStructured() ||
      !hasBreakdownByDatetime(question)
    ) {
      return;
    }
    if (question.isSaved()) {
      return {
        cardId: question.id(),
        include: "events",
      };
    }
  }, [question]);

  if (!timelinesQuery) {
    return children(NO_TIMELINES_LOADER_PROPS);
  }

  return (
    <Timelines.ListLoader query={timelinesQuery}>
      {children}
    </Timelines.ListLoader>
  );
}

export default QuestionTimelineEventsLoader;
