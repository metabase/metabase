import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { Collection, Timeline } from "metabase-types/api";
import { State } from "metabase-types/store";
import NewTimelineModal from "../../components/NewTimelineModal";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import { ModalProps } from "../../types";

const collectionProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractCollectionId(props.params.slug),
  LoadingAndErrorWrapper,
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (values: Partial<Timeline>, collection: Collection) => {
    const action = Timelines.actions.create(values);
    const response = await dispatch(action);
    const timeline = Timelines.HACK_getObjectFromAction(response);
    dispatch(push(Urls.timelineInCollection(timeline, collection)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

export default _.compose(
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(NewTimelineModal);
