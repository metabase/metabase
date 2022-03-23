import { connect } from "react-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { State } from "metabase-types/store";
import TimelineListModal from "../../components/TimelineListModal";
import { ModalProps } from "../../types";
import { Collection } from "metabase-types/api";
import { push } from "react-router-redux";

const timelineProps = {
  query: (state: State, props: ModalProps) => ({
    collectionId: Urls.extractCollectionId(props.params.slug),
    archived: true,
    include: "events",
  }),
};

const collectionProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const mapStateToProps = () => ({
  isArchive: true,
});

const mapDispatchToProps = (dispatch: any) => ({
  onGoBack: (collection: Collection) => {
    dispatch(push(Urls.timelinesInCollection(collection)));
  },
});

export default _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
  connect(mapStateToProps, mapDispatchToProps),
)(TimelineListModal);
