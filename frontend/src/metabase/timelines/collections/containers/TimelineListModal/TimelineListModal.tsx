import _ from "underscore";

import { Collections } from "metabase/entities/collections";
import { Timelines } from "metabase/entities/timelines";
import * as Urls from "metabase/lib/urls";
import type { State } from "metabase-types/store";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineListModal from "../../components/TimelineListModal";
import type { ModalParams } from "../../types";

interface TimelineListModalProps {
  params: ModalParams;
}

const timelineProps = {
  query: (state: State, { params }: TimelineListModalProps) => ({
    collectionId: Urls.extractCollectionId(params.slug),
    include: "events",
  }),
  LoadingAndErrorWrapper,
};

const collectionProps = {
  id: (state: State, { params }: TimelineListModalProps) =>
    Urls.extractCollectionId(params.slug),
  LoadingAndErrorWrapper,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
)(TimelineListModal);
