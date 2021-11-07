import React, { Fragment } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import _ from "underscore";
import { getUserIsAdmin } from "metabase/selectors/user";
import SyncModalSwitch from "../../components/SyncModal";
import SyncSnackbarSwitch from "../../components/SyncSnackbarSwitch";

const propTypes = {
  isAdmin: PropTypes.bool,
};

export const SyncDatabaseApp = ({ isAdmin }) => {
  return (
    isAdmin && (
      <Fragment>
        <SyncModalSwitch />
        <SyncSnackbarSwitch />
      </Fragment>
    )
  );
};

SyncDatabaseApp.propTypes = propTypes;

export default _.compose(
  connect(state => ({ isAdmin: getUserIsAdmin(state) })),
)(SyncDatabaseApp);
