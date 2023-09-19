import { connect } from "react-redux";
import { push } from "connected-react-router";
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
