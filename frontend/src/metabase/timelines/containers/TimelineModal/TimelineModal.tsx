import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { State } from "metabase-types/store";
import TimelineModal from "../../components/TimelineModal";
import { ModalProps } from "../../types";

const timelineProps = {
  query: (state: State, props: ModalProps) => ({
    id: Urls.extractEntityId(props.params.timelineId),
  }),
};

const collectionProps = {
  query: (state: State, props: ModalProps) => ({
    id: Urls.extractCollectionId(props.params.slug),
  }),
};

export default _.compose(
  Timelines.load(timelineProps),
  Collections.load(collectionProps),
)(TimelineModal);
