import _ from "underscore";

import { Collections } from "metabase/entities/collections";
import { Timelines } from "metabase/entities/timelines";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { Collection, TimelineEvent } from "metabase-types/api";
import type { State } from "metabase-types/store";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineListModal from "../../components/TimelineListModal";
import { navigateToPath } from "../../navigation";
import type { ModalParams } from "../../types";

interface TimelineListArchiveModalProps {
  params: ModalParams;
}

const timelineProps = {
  query: (state: State, { params }: TimelineListArchiveModalProps) => ({
    collectionId: Urls.extractCollectionId(params.slug),
    archived: true,
    include: "events",
  }),
  LoadingAndErrorWrapper,
};

const collectionProps = {
  id: (state: State, { params }: TimelineListArchiveModalProps) =>
    Urls.extractCollectionId(params.slug),
  LoadingAndErrorWrapper,
};

const mapStateToProps = () => ({
  isArchive: true,
});

const mapDispatchToProps = (dispatch: any) => ({
  onUnarchive: async (event: TimelineEvent) => {
    await dispatch(Timelines.actions.setArchived(event, false));
  },
  onGoBack: (collection: Collection) => {
    navigateToPath(Urls.timelinesInCollection(collection));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelineProps),
  Collections.load(collectionProps),
  connect(mapStateToProps, mapDispatchToProps),
)(TimelineListModal);
