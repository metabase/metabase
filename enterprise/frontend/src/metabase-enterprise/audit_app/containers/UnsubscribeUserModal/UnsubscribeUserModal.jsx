import { connect } from "react-redux";
import _ from "underscore";
import Users from "metabase/entities/users";
import UnsubscribeUserForm from "../../components/UnsubscribeUserForm";
import { AuditApi } from "../../lib/services";

const mapStateToProps = () => ({
  onUnsubscribe: ({ id }) => AuditApi.unsubscribe_user({ id }),
});

export default _.compose(
  Users.load({
    id: (state, props) => Number.parseInt(props.params.userId),
  }),
  connect(mapStateToProps),
)(UnsubscribeUserForm);
