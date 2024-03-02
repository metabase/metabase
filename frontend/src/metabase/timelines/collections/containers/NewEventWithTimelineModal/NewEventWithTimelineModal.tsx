import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";

import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import * as Urls from "metabase/lib/urls";
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import type { Collection, TimelineEvent } from "metabase-types/api";
import type { State } from "metabase-types/store";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

interface NewEventWithTimelineModalProps {
  params: ModalParams;
}

const collectionProps = {
  id: (state: State, props: NewEventWithTimelineModalProps) =>
    Urls.extractCollectionId(props.params.slug),
  LoadingAndErrorWrapper,
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (values: Partial<TimelineEvent>, collection: Collection) => {
    const query = { collectionId: collection.id, include: "events" };
    await dispatch(Timelines.actions.createWithEvent(values, collection));
    await dispatch(Timelines.actions.fetchList(query));
    dispatch(push(Urls.timelinesInCollection(collection)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(NewEventModal);
