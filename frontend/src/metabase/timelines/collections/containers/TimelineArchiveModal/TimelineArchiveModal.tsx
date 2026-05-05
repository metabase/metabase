import type { ComponentProps } from "react";
import { push } from "react-router-redux";
import _ from "underscore";

import { useSetArchive } from "metabase/common/hooks";
import { Timelines } from "metabase/entities/timelines";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineDetailsModal from "../../components/TimelineDetailsModal";
import type { ModalParams } from "../../types";

interface TimelineArchiveModalProps {
  params: ModalParams;
}

const timelineProps = {
  id: (state: State, props: TimelineArchiveModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events", archived: true },
  LoadingAndErrorWrapper,
};

const mapStateToProps = () => ({
  isArchive: true,
});

const mapDispatchToProps = (dispatch: any) => ({
  onGoBack: (timeline: Timeline) => {
    dispatch(push(Urls.timelineInCollection(timeline)));
  },
});

function TimelineArchiveModalContainer(
  props: ComponentProps<typeof TimelineDetailsModal>,
) {
  const archive = useSetArchive();
  const onUnarchive = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, false);
  return <TimelineDetailsModal {...props} onUnarchive={onUnarchive} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  connect(mapStateToProps, mapDispatchToProps),
)(TimelineArchiveModalContainer);
