import React, { Fragment } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import _ from "underscore";
import { getUserIsAdmin } from "metabase/selectors/user";
import SyncModal from "../../components/SyncModal";
import SyncSnackbar from "../../components/SyncSnackbar";

const propTypes = {
  isAdmin: PropTypes.bool,
};

export const SyncDatabaseApp = ({ isAdmin }) => {
  return (
    isAdmin && (
      <Fragment>
        <SyncModal />
        <SyncSnackbar />
      </Fragment>
    )
  );
};

SyncDatabaseApp.propTypes = propTypes;

export default _.compose(
  connect(state => ({ isAdmin: getUserIsAdmin(state) })),
)(SyncDatabaseApp);
