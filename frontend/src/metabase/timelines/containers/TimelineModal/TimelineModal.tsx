import { connect } from "react-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { State } from "metabase-types/store";
import TimelineModal from "../../components/TimelineModal";
import { ModalProps } from "../../types";
import { archiveEvent } from "metabase/timelines/actions";

const timelineProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
};

const collectionProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const mapDispatchToProps = {
  onArchive: archiveEvent,
};

export default _.compose(
  Timelines.load(timelineProps),
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(TimelineModal);
