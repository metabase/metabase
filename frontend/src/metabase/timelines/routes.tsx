import React, { Fragment } from "react";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import DeleteEventModal from "./containers/DeleteEventModal";
import EditEventModal from "./containers/EditEventModal";
import EditTimelineModal from "./containers/EditTimelineModal";
import NewEventModal from "./containers/NewEventModal";
import NewEventWithTimelineModal from "./containers/NewEventWithTimelineModal";
import NewTimelineModal from "./containers/NewTimelineModal";
import TimelineArchiveModal from "./containers/TimelineArchiveModal";
import TimelineDetailsModal from "./containers/TimelineDetailsModal";
import TimelineIndexModal from "./containers/TimelineIndexModal";

const getRoutes = () => {
  return (
    <Fragment>
      <ModalRoute
        {...{
          path: "timelines",
          modal: TimelineIndexModal,
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/new",
          modal: NewTimelineModal,
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId",
          modal: TimelineDetailsModal,
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/edit",
          modal: EditTimelineModal,
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/archive",
          modal: TimelineArchiveModal,
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/new/events/new",
          modal: NewEventWithTimelineModal,
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/events/new",
          modal: NewEventModal,
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/events/:timelineEventId/edit",
          modal: EditEventModal,
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/events/:timelineEventId/delete",
          modal: DeleteEventModal,
        }}
      />
    </Fragment>
  );
};

export default getRoutes;
