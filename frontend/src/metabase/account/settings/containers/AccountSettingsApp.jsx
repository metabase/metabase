import { connect } from "react-redux";
import { push } from "react-router-redux";
import { getUser } from "metabase/selectors/user";
import { getPath } from "../selectors";
import AccountLayout from "../components/AccountLayout";

const mapStateToProps = (state, props) => ({
  user: getUser(state),
  path: getPath(state, props),
});

const mapDispatchToProps = () => ({
  onChangeLocation: push,
});

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(AccountLayout);
