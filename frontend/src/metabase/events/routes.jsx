import React, { Fragment } from "react";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import TimelineListModal from "./containers/TimelineListModal";

const getRoutes = () => {
  return (
    <Fragment>
      <ModalRoute path="timelines" modal={TimelineListModal} />
    </Fragment>
  );
};

export default getRoutes;
