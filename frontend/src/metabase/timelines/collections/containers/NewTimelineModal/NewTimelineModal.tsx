import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";

import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import * as Urls from "metabase/lib/urls";
import NewTimelineModal from "metabase/timelines/common/components/NewTimelineModal";
import type { Timeline } from "metabase-types/api";
import type { State } from "metabase-types/store";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

interface NewTimelineModalProps {
  params: ModalParams;
}

const collectionProps = {
  id: (state: State, props: NewTimelineModalProps) =>
    Urls.extractCollectionId(props.params.slug),
  LoadingAndErrorWrapper,
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (values: Partial<Timeline>) => {
    const action = Timelines.actions.create(values);
    const response = await dispatch(action);
    const timeline = Timelines.HACK_getObjectFromAction(response);
    dispatch(push(Urls.timelineInCollection(timeline)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(NewTimelineModal);
