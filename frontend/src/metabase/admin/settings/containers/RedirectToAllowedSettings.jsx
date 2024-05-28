/* eslint-disable react/prop-types */
import { connect } from "react-redux";
import { push, replace } from "react-router-redux";

import { getAdminPaths } from "metabase/admin/app/selectors";

const mapStateToProps = (state, props) => ({
  adminItems: getAdminPaths(state),
  path: props.location.pathname,
});

const mapDispatchToProps = {
  push,
  replace,
};

const RedirectToAllowedSettings = ({ adminItems, replace }) => {
  if (adminItems.length === 0) {
    replace("/unauthorized");
  } else {
    replace(adminItems[0].path);
  }

  return null;
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(RedirectToAllowedSettings);
