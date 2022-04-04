import { connect } from "react-redux";
import { push } from "react-router-redux";
import { getUser } from "metabase/selectors/user";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

const mapStateToProps = (state, props) => ({
  user: getUser(state),
  path: props.location.pathname,
});

const mapDispatchToProps = {
  push,
};

const RedirectToAllowedSettings = ({ user, push }) => {
  if (user.is_superuser) {
    push("/admin/settings");
  } else if (PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(user)) {
    push("/admin/datamodel");
  } else if (
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDatabaseManagement(user)
  ) {
    push("/admin/databases");
  } else if (user != null) {
    push("/unauthorized");
  }

  return null;
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(RedirectToAllowedSettings);
