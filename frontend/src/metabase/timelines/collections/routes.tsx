import { Fragment } from "react";

import { ModalRoute } from "metabase/hoc/ModalRoute";

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

const getRoutes = () => {
  return (
    <Fragment>
      <ModalRoute
        {...{
          path: "timelines",
          modal: TimelineIndexModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/new",
          modal: NewTimelineModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/archive",
          modal: TimelineListArchiveModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId",
          modal: TimelineDetailsModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/edit",
          modal: EditTimelineModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/move",
          modal: MoveTimelineModal,
          modalProps: { enableTransition: false },
          noWrap: true,
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/archive",
          modal: TimelineArchiveModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/delete",
          modal: DeleteTimelineModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/new/events/new",
          modal: NewEventWithTimelineModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/events/new",
          modal: NewEventModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/events/:timelineEventId/edit",
          modal: EditEventModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/events/:timelineEventId/move",
          modal: MoveEventModal,
          modalProps: { enableTransition: false },
        }}
      />
      <ModalRoute
        {...{
          path: "timelines/:timelineId/events/:timelineEventId/delete",
          modal: DeleteEventModal,
          modalProps: { enableTransition: false },
        }}
      />
    </Fragment>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getRoutes;
