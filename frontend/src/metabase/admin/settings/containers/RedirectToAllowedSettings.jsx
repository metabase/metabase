import { connect } from "react-redux";
import { push, replace } from "react-router-redux";
import { getUser } from "metabase/selectors/user";
import { getAllowedMenuItems } from "metabase/nav/utils";

const mapStateToProps = (state, props) => ({
  user: getUser(state),
  path: props.location.pathname,
});

const mapDispatchToProps = {
  push,
  replace,
};

const RedirectToAllowedSettings = ({ user, replace }) => {
  const allowedNavItems = getAllowedMenuItems(user);

  if (allowedNavItems.length === 0) {
    replace("/unauthorized");
  } else {
    replace(allowedNavItems[0].path);
  }

  return null;
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(RedirectToAllowedSettings);
