import Timelines from "metabase/entities/timelines";
import * as Urls from "metabase/lib/urls";
import type { State } from "metabase-types/store";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineIndexModal from "../../components/TimelineIndexModal";
import type { ModalParams } from "../../types";

interface TimelineIndexModalProps {
  params: ModalParams;
}

const timelineProps = {
  query: (state: State, props: TimelineIndexModalProps) => ({
    collectionId: Urls.extractCollectionId(props.params.slug),
    include: "events",
  }),
  LoadingAndErrorWrapper,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Timelines.loadList(timelineProps)(TimelineIndexModal);
