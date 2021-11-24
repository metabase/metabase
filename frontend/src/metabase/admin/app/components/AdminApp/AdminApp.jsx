import React from "react";
import PropTypes from "prop-types";
import DatabaseBanner from "metabase/admin/databases/components/DatabaseBanner";

const propTypes = {
  children: PropTypes.node,
};

const AdminApp = ({ children }) => {
  return (
    <div>
      <DatabaseBanner />
      {children}
    </div>
  );
};

AdminApp.propTypes = propTypes;

export default AdminApp;
