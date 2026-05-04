import { useCallback } from "react";
import { push } from "react-router-redux";
import _ from "underscore";

import { collectionApi, useGetCollectionQuery } from "metabase/api";
import { useSetCollection } from "metabase/common/hooks";
import { getDefaultTimelineName } from "metabase/common/utils/timelines";
import { Timelines } from "metabase/entities/timelines";
import { useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
import MoveTimelineModal from "metabase/timelines/common/components/MoveTimelineModal";
import * as Urls from "metabase/urls";
import type { CollectionId, Timeline } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

interface MoveTimelineModalProps {
  params: ModalParams;
  timeline: Timeline;
  onClose: () => void;
}

const timelineProps = {
  id: (state: State, props: MoveTimelineModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

function MoveTimelineModalContainer(props: MoveTimelineModalProps) {
  const dispatch = useDispatch();
  const setCollection = useSetCollection();
  const { data: sourceCollection } = useGetCollectionQuery({
    id: props.timeline.collection_id ?? "root",
  });

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

  return <MoveTimelineModal {...props} onSubmit={handleSubmit} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(Timelines.load(timelineProps))(
  MoveTimelineModalContainer,
);
