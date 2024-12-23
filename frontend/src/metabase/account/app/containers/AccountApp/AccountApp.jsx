import { push } from "react-router-redux";

import { connect } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import AccountLayout from "../../components/AccountLayout";

const mapStateToProps = (state, props) => ({
  user: getUser(state),
  path: props.location.pathname,
});

const mapDispatchToProps = {
  onChangeLocation: push,
};

export default connect(mapStateToProps, mapDispatchToProps)(AccountLayout);
