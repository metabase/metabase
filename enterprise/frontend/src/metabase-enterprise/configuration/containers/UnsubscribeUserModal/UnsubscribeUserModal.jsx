import { connect } from "react-redux";
import _ from "underscore";
import Users from "metabase/entities/users";
import UnsubscribeUserForm from "../../components/UnsubscribeUserForm";

const mapDispatchToProps = {
  onUnsubscribe: Users.actions.unsubscribe,
};

export default _.compose(
  Users.load({
    id: (state, props) => Number.parseInt(props.params.userId),
  }),
  connect(
    null,
    mapDispatchToProps,
  ),
)(UnsubscribeUserForm);
