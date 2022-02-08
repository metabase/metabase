import React, { Fragment } from "react";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import ListEventTimelineModal from "./containers/TimelineListModal";

const getRoutes = () => {
  return (
    <Fragment>
      <ModalRoute path="timelines" modal={ListEventTimelineModal} />
    </Fragment>
  );
};

export default getRoutes;
