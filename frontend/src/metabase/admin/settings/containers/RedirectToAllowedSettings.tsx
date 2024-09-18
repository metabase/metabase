import type { Location, LocationDescriptor } from "history";
import { connect } from "react-redux";
import { push, replace } from "react-router-redux";

import { getAdminPaths } from "metabase/admin/app/selectors";
import type { AdminPath, State } from "metabase-types/store";

const mapStateToProps = (state: State, props: { location: Location }) => ({
  adminItems: getAdminPaths(state),
  path: props.location.pathname,
});

const mapDispatchToProps = {
  push,
  replace,
};

interface RedirectToAllowedSettingsProps {
  adminItems: AdminPath[];
  replace: (path: LocationDescriptor) => void;
}

const RedirectToAllowedSettings = ({
  adminItems,
  replace,
}: RedirectToAllowedSettingsProps) => {
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
