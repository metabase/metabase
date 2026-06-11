import { useCallback } from "react";
import { push } from "react-router-redux";

import {
  collectionApi,
  skipToken,
  useGetCollectionQuery,
  useGetTimelineQuery,
} from "metabase/api";
import { useSetCollection } from "metabase/common/hooks";
import { getDefaultTimelineName } from "metabase/common/utils/timelines";
import type { ModalComponentProps } from "metabase/hoc/ModalRoute";
import { useDispatch } from "metabase/redux";
import MoveTimelineModal from "metabase/timelines/common/components/MoveTimelineModal";
import * as Urls from "metabase/urls";
import type { CollectionId, Timeline } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";

function MoveTimelineModalContainer({ params, ...props }: ModalComponentProps) {
  const dispatch = useDispatch();
  const setCollection = useSetCollection();
  const id = Urls.extractEntityId(params.timelineId);
  const {
    data: timeline,
    isLoading,
    error,
  } = useGetTimelineQuery(id != null ? { id, include: "events" } : skipToken);

  const { data: sourceCollection } = useGetCollectionQuery(
    timeline ? { id: timeline.collection_id ?? "root" } : skipToken,
  );

  const handleSubmit = useCallback(
    (timeline: Timeline, collectionId: CollectionId) => {
      const name =
        timeline.default && sourceCollection
          ? getDefaultTimelineName(sourceCollection)
          : timeline.name;
      // Fire-and-forget so the modal can close back to the parent path before
      // we push the new timeline detail URL — otherwise ModalRoute's onClose
      // would compute the parent off the post-navigation location and bounce
      // us off the timeline page.
      void (async () => {
        await setCollection(
          { model: "timeline", id: timeline.id, name },
          { id: collectionId },
        );
        const { data: collection } = await dispatch(
          collectionApi.endpoints.getCollection.initiate({ id: collectionId }),
        );
        dispatch(
          push(
            Urls.timelineInCollection({
              ...timeline,
              collection_id:
                typeof collectionId === "number" ? collectionId : null,
              collection,
            } as Timeline),
          ),
        );
      })();
    },
    [dispatch, setCollection, sourceCollection],
  );

  if (isLoading || error || !timeline) {
    return (
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper />
    );
  }

  return (
    <MoveTimelineModal {...props} timeline={timeline} onSubmit={handleSubmit} />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveTimelineModalContainer;
