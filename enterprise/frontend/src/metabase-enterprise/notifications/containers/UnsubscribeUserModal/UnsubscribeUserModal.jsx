import _ from "underscore";
import Users from "metabase/entities/users";
import UnsubscribeUserForm from "../../components/UnsubscribeUserForm";

export default _.compose(
  Users.load({
    id: (state, props) => Number.parseInt(props.params.userId),
  }),
)(UnsubscribeUserForm);
