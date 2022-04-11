import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { State } from "metabase-types/store";
import TimelineListModal from "../../components/TimelineListModal";
import { ModalProps } from "../../types";

const timelineProps = {
  query: (state: State, props: ModalProps) => ({
    collectionId: Urls.extractCollectionId(props.params.slug),
    include: "events",
  }),
};

const collectionProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

export default _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
)(TimelineListModal);
