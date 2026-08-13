import { Fragment } from "react";

import { modalRoute } from "metabase/common/components/ModalRoute";
import { NO_ANIMATION_MODAL_PROPS } from "metabase/ui";

import DeleteEventModal from "./containers/DeleteEventModal";
import DeleteTimelineModal from "./containers/DeleteTimelineModal";
import EditEventModal from "./containers/EditEventModal";
import EditTimelineModal from "./containers/EditTimelineModal";
import MoveEventModal from "./containers/MoveEventModal";
import MoveTimelineModal from "./containers/MoveTimelineModal";
import NewEventModal from "./containers/NewEventModal";
import NewEventWithTimelineModal from "./containers/NewEventWithTimelineModal";
import NewTimelineModal from "./containers/NewTimelineModal";
import TimelineArchiveModal from "./containers/TimelineArchiveModal";
import TimelineDetailsModal from "./containers/TimelineDetailsModal";
import TimelineIndexModal from "./containers/TimelineIndexModal";
import TimelineListArchiveModal from "./containers/TimelineListArchiveModal";

const options = { modalProps: NO_ANIMATION_MODAL_PROPS };

const getRoutes = () => {
  return (
    <Fragment>
      {modalRoute("timelines", TimelineIndexModal, options)}
      {modalRoute("timelines/new", NewTimelineModal, options)}
      {modalRoute("timelines/archive", TimelineListArchiveModal, options)}
      {modalRoute("timelines/:timelineId", TimelineDetailsModal, options)}
      {modalRoute("timelines/:timelineId/edit", EditTimelineModal, options)}
      {modalRoute("timelines/:timelineId/move", MoveTimelineModal, {
        ...options,
        noWrap: true,
      })}
      {modalRoute(
        "timelines/:timelineId/archive",
        TimelineArchiveModal,
        options,
      )}
      {modalRoute("timelines/:timelineId/delete", DeleteTimelineModal, options)}
      {modalRoute(
        "timelines/new/events/new",
        NewEventWithTimelineModal,
        options,
      )}
      {modalRoute("timelines/:timelineId/events/new", NewEventModal, options)}
      {modalRoute(
        "timelines/:timelineId/events/:timelineEventId/edit",
        EditEventModal,
        options,
      )}
      {modalRoute(
        "timelines/:timelineId/events/:timelineEventId/move",
        MoveEventModal,
        options,
      )}
      {modalRoute(
        "timelines/:timelineId/events/:timelineEventId/delete",
        DeleteEventModal,
        options,
      )}
    </Fragment>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getRoutes;
