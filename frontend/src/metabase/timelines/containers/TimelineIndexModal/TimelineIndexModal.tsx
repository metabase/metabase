import * as Urls from "metabase/lib/urls";
import Timelines from "metabase/entities/timelines";
import { State } from "metabase-types/store";
import TimelineIndexModal from "../../components/TimelineIndexModal";
import { ModalProps } from "../../types";

const timelineProps = {
  query: (state: State, props: ModalProps) => ({
    collectionId: Urls.extractCollectionId(props.params.slug),
    include: "events",
  }),
};

export default Timelines.loadList(timelineProps)(TimelineIndexModal);
