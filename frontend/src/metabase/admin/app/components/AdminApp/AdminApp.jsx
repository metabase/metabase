import React from "react";
import PropTypes from "prop-types";
import EngineDeprecationBanner from "metabase/admin/databases/containers/EngineDeprecationBanner";

const propTypes = {
  children: PropTypes.node,
};

const AdminApp = ({ children }) => {
  return (
    <div>
      <EngineDeprecationBanner />
      {children}
    </div>
  );
};

AdminApp.propTypes = propTypes;

export default AdminApp;
