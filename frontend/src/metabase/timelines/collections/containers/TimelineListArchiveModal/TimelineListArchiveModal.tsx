import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { Collection, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import TimelineListModal from "../../components/TimelineListModal";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
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
  onUnarchive: async (event: TimelineEvent) => {
    await dispatch(Timelines.actions.setArchived(event, false));
  },
  onGoBack: (collection: Collection) => {
    dispatch(push(Urls.timelinesInCollection(collection)));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
  connect(mapStateToProps, mapDispatchToProps),
)(TimelineListModal);
