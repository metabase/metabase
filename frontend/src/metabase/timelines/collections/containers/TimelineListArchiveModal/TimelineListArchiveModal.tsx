import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { Collection, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import TimelineListModal from "../../components/TimelineListModal";
import { ModalParams } from "../../types";

interface TimelineListArchiveModalProps {
  params: ModalParams;
}

const timelineProps = {
  query: (state: State, props: TimelineListArchiveModalProps) => ({
    collectionId: Urls.extractCollectionId(props.params.slug),
    archived: true,
    include: "events",
  }),
};

const collectionProps = {
  id: (state: State, props: TimelineListArchiveModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const mapStateToProps = () => ({
  isArchive: true,
});

const mapDispatchToProps = (dispatch: any) => ({
  onUnarchive: async (event: TimelineEvent) => {
    await dispatch(Timelines.actions.setArchived(event, false));
  },
  onGoBack: (collection: Collection) => {
    dispatch(push(Urls.timelinesInCollection(collection)));
  },
});

export default _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
  connect(mapStateToProps, mapDispatchToProps),
)(TimelineListModal);
