import { connect } from "react-redux";
import { push } from "react-router-redux";
import { getUser } from "metabase/selectors/user";
import AccountLayout from "../components/AccountLayout";

const mapStateToProps = (state, props) => ({
  tab: props.params.splat,
  user: getUser(state),
});

const mapDispatchToProps = () => ({
  onChangeTab: tab => push(`/account/${tab}`),
});

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(AccountLayout);
