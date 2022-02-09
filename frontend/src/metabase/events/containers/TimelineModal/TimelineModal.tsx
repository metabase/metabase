import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import EventTimelines from "metabase/entities/event-timelines";
import { State } from "metabase-types/store";
import TimelineModal from "../../components/TimelineModal";

export interface TimelineModalParams {
  slug: string;
  timelineId: string;
}

export interface TimelineModalProps {
  params: TimelineModalParams;
}

const collectionProps = {
  id: (state: State, props: TimelineModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const timelineProps = {
  id: (state: State, props: TimelineModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
};

export default _.compose(
  Collections.load(collectionProps),
  EventTimelines.load(timelineProps),
)(TimelineModal);
