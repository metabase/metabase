import React, { Fragment } from "react";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import NewTimelineModal from "./containers/NewTimelineModal";
import TimelineListModal from "./containers/TimelineListModal";

const getRoutes = () => {
  return (
    <Fragment>
      <ModalRoute {...{ path: "timelines", modal: TimelineListModal }} />
      <ModalRoute {...{ path: "timelines/new", modal: NewTimelineModal }} />
    </Fragment>
  );
};

export default getRoutes;
