import { push } from "react-router-redux";

import {
  skipToken,
  useCreateTimelineMutation,
  useGetCollectionQuery,
} from "metabase/api";
import { useDispatch } from "metabase/redux";
import NewTimelineModal from "metabase/timelines/common/components/NewTimelineModal";
import * as Urls from "metabase/urls";
import type { CreateTimelineRequest, Timeline } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

interface NewTimelineModalContainerProps {
  params: ModalParams;
  onClose?: () => void;
}

function NewTimelineModalContainer(props: NewTimelineModalContainerProps) {
  const dispatch = useDispatch();
  const [createTimeline] = useCreateTimelineMutation();
  const collectionId = Urls.extractCollectionId(props.params.slug);
  const {
    data: collection,
    isLoading,
    error,
  } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );

  const onSubmit = async (values: Partial<Timeline>) => {
    const timeline = await createTimeline(
      values as CreateTimelineRequest,
    ).unwrap();
    dispatch(push(Urls.timelineInCollection(timeline)));
  };

  if (isLoading || error || !collection) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <NewTimelineModal {...props} collection={collection} onSubmit={onSubmit} />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewTimelineModalContainer;
