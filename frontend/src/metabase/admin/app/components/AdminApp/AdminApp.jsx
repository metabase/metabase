import React from "react";
import PropTypes from "prop-types";
import DriverDeprecationBanner from "metabase/admin/app/containers/DriverDeprecationBanner";

const propTypes = {
  children: PropTypes.node,
};

const AdminApp = ({ children }) => {
  return (
    <div>
      <DriverDeprecationBanner />
      {children}
    </div>
  );
};

AdminApp.propTypes = propTypes;

export default AdminApp;
