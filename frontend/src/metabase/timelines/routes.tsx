import React, { Fragment } from "react";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import NewEventModal from "./containers/NewEventModal";
import NewEventWithTimelineModal from "./containers/NewEventWithTimelineModal";
import NewTimelineModal from "./containers/NewTimelineModal";
import TimelineListModal from "./containers/TimelineListModal";
import TimelineModal from "./containers/TimelineModal";

const getRoutes = () => {
  return (
    <Fragment>
      <ModalRoute
        {...{
          path: "timelines",
          modal: TimelineListModal,
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
          modal: TimelineModal,
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
    </Fragment>
  );
};

export default getRoutes;
