import _ from "underscore";

import { Collections, ROOT_COLLECTION } from "metabase/entities/collections";
import { TimelineEvents } from "metabase/entities/timeline-events";
import { connect } from "metabase/lib/redux";
import type { TimelineEvent } from "metabase-types/api";
import type { State } from "metabase-types/store";

import TimelinePanel from "../../components/TimelinePanel";

interface TimelinePanelProps {
  collectionId?: number;
}

const collectionProps = {
  id: (state: State, props: TimelinePanelProps) => {
    return props.collectionId ?? ROOT_COLLECTION.id;
  },
};

const mapDispatchToProps = (dispatch: any) => ({
  onArchiveEvent: (event: TimelineEvent) => {
    dispatch(TimelineEvents.actions.setArchived(event, true));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(TimelinePanel);
