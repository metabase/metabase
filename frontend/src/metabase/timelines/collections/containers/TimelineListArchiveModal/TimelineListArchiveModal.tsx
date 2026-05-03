import type { ComponentProps } from "react";
import { push } from "react-router-redux";
import _ from "underscore";

import { useSetArchive } from "metabase/common/hooks";
import { Collections } from "metabase/entities/collections";
import { Timelines } from "metabase/entities/timelines";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import * as Urls from "metabase/urls";
import type { Collection, Timeline } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineListModal from "../../components/TimelineListModal";
import type { ModalParams } from "../../types";

interface TimelineListArchiveModalProps {
  params: ModalParams;
}

const timelineProps = {
  query: (state: State, props: TimelineListArchiveModalProps) => ({
    collectionId: Urls.extractCollectionId(props.params.slug),
    archived: true,
    include: "events",
  }),
  LoadingAndErrorWrapper,
};

const collectionProps = {
  id: (state: State, props: TimelineListArchiveModalProps) =>
    Urls.extractCollectionId(props.params.slug),
  LoadingAndErrorWrapper,
};

const mapStateToProps = () => ({
  isArchive: true,
});

const mapDispatchToProps = (dispatch: any) => ({
  onGoBack: (collection: Collection) => {
    dispatch(push(Urls.timelinesInCollection(collection)));
  },
});

function TimelineListArchiveModalContainer(
  props: ComponentProps<typeof TimelineListModal>,
) {
  const archive = useSetArchive();
  const onUnarchive = (timeline: Timeline) =>
    archive({ id: timeline.id, model: "timeline" }, false);
  return <TimelineListModal {...props} onUnarchive={onUnarchive} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
  connect(mapStateToProps, mapDispatchToProps),
)(TimelineListArchiveModalContainer);
