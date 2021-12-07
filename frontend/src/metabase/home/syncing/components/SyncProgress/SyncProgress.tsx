import React, { Fragment } from "react";
import SyncModalApp from "../../containers/SyncModalApp";
import SyncSnackbarApp from "../../containers/SyncSnackbarApp";

interface Props {
  isAdmin?: boolean;
}

const SyncProgress = ({ isAdmin }: Props) => {
  if (!isAdmin) {
    return null;
  }

  return (
    <Fragment>
      <SyncModalApp />
      <SyncSnackbarApp />
    </Fragment>
  );
};

export default SyncProgress;
