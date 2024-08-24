import _ from "underscore";

import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import * as Urls from "metabase/lib/urls";
import type { State } from "metabase-types/store";

import Loading from "../../components/Loading";
import TimelineListModal from "../../components/TimelineListModal";
import type { ModalParams } from "../../types";

interface TimelineListModalProps {
  params: ModalParams;
}

const timelineProps = {
  query: (state: State, props: TimelineListModalProps) => ({
    collectionId: Urls.extractCollectionId(props.params.slug),
    include: "events",
  }),
  Loading,
};

const collectionProps = {
  id: (state: State, props: TimelineListModalProps) =>
    Urls.extractCollectionId(props.params.slug),
  Loading,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
)(TimelineListModal);
