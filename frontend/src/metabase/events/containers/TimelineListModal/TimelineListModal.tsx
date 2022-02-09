import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import EventTimelines from "metabase/entities/event-timelines";
import { State } from "metabase-types/store";
import TimelineListModal from "../../components/TimelineListModal";

export interface TimelineListModalParams {
  slug: string;
}

export interface TimelineListModalProps {
  params: TimelineListModalParams;
}

const collectionProps = {
  id: (state: State, props: TimelineListModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const timelineProps = () => ({
  query: (state: State, props: TimelineListModalProps) => ({
    collectionId: Urls.extractEntityId(props.params.slug),
  }),
});

export default _.compose(
  Collections.load(collectionProps),
  EventTimelines.loadList(timelineProps),
)(TimelineListModal);
