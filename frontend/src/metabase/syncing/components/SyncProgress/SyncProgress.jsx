import PropTypes from "prop-types";
import React, { Fragment } from "react";
import SyncModal from "../../containers/SyncModal";
import SyncSnackbar from "../../containers/SyncSnackbar";

const propTypes = {
  isAdmin: PropTypes.bool,
};

export const SyncProgress = ({ isAdmin }) => {
  return (
    isAdmin && (
      <Fragment>
        <SyncModal />
        <SyncSnackbar />
      </Fragment>
    )
  );
};

SyncProgress.propTypes = propTypes;

export default SyncProgress;
