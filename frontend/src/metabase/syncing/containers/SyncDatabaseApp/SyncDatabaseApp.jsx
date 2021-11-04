import React, { Fragment } from "react";
import SyncModalSwitch from "../../components/SyncModalSwitch";
import SyncSnackbarSwitch from "../../components/SyncSnackbarSwitch";

const SyncDatabaseApp = () => {
  return (
    <Fragment>
      <SyncModalSwitch />
      <SyncSnackbarSwitch />
    </Fragment>
  );
};

export default SyncDatabaseApp;
