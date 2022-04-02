import { connect } from "react-redux";
import { push } from "react-router-redux";
import { getUser } from "metabase/selectors/user";
import { getAllowedMenuItems } from "metabase/nav/utils";

const mapStateToProps = (state, props) => ({
  user: getUser(state),
  path: props.location.pathname,
});

const mapDispatchToProps = {
  push,
};

const RedirectToAllowedSettings = ({ user, push }) => {
  const allowedNavItems = getAllowedMenuItems(user);

  if (allowedNavItems.length === 0) {
    push("/unauthorized");
  } else {
    push(allowedNavItems[0].path);
  }

  return null;
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(RedirectToAllowedSettings);
