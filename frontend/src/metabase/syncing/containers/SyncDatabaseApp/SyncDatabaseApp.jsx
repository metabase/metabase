import React, { Fragment } from "react";
import SyncModalApp from "../SyncModalApp";
import SyncSnackbarApp from "../SyncSnackbarApp";

const SyncDatabaseApp = () => {
  return (
    <Fragment>
      <SyncModalApp />
      <SyncSnackbarApp />
    </Fragment>
  );
};

export default SyncDatabaseApp;
