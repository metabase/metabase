import { push } from "react-router-redux";

import { useCreateTimelineMutation } from "metabase/api";
import { Collections } from "metabase/entities/collections";
import { useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
import NewTimelineModal from "metabase/timelines/common/components/NewTimelineModal";
import * as Urls from "metabase/urls";
import type {
  Collection,
  CreateTimelineRequest,
  Timeline,
} from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

interface NewTimelineModalContainerProps {
  params: ModalParams;
  collection: Collection;
  onClose?: () => void;
}

const collectionProps = {
  id: (state: State, props: NewTimelineModalContainerProps) =>
    Urls.extractCollectionId(props.params.slug),
  LoadingAndErrorWrapper,
};

function NewTimelineModalContainer(props: NewTimelineModalContainerProps) {
  const dispatch = useDispatch();
  const [createTimeline] = useCreateTimelineMutation();

  const onSubmit = async (values: Partial<Timeline>) => {
    const timeline = await createTimeline(
      values as CreateTimelineRequest,
    ).unwrap();
    dispatch(push(Urls.timelineInCollection(timeline)));
  };

  return <NewTimelineModal {...props} onSubmit={onSubmit} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Collections.load(collectionProps)(NewTimelineModalContainer);
