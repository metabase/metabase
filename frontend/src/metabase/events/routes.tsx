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
          path: "timeline",
          modal: TimelineListModal,
        }}
      />
      <ModalRoute
        {...{
          path: "timeline/new",
          modal: NewTimelineModal,
        }}
      />
      <ModalRoute
        {...{
          path: "timeline/:timelineId",
          modal: TimelineModal,
        }}
      />
      <ModalRoute
        {...{
          path: "timeline/new/event/new",
          modal: NewEventWithTimelineModal,
        }}
      />
      <ModalRoute
        {...{
          path: "timeline/:timelineId/event/new",
          modal: NewEventModal,
        }}
      />
    </Fragment>
  );
};

export default getRoutes;
