import * as Urls from "metabase/lib/urls";
import Timelines from "metabase/entities/timelines";
import { State } from "metabase-types/store";
import TimelineIndexModal from "../../components/TimelineIndexModal";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import { ModalParams } from "../../types";

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

export default Timelines.loadList(timelineProps)(TimelineIndexModal);
