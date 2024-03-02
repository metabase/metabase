import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Users from "metabase/entities/users";
import { addUndo } from "metabase/redux/undo";

import UnsubscribeUserForm from "../../components/UnsubscribeUserForm";
import { AuditApi } from "../../lib/services";

const mapDispatchToProps = dispatch => ({
  onUnsubscribe: async ({ id }) => {
    await AuditApi.unsubscribe_user({ id });
    dispatch(addUndo({ message: t`Unsubscribe successful` }));
  },
});

export default _.compose(
  Users.load({
    id: (state, props) => Number.parseInt(props.params.userId),
  }),
  connect(null, mapDispatchToProps),
)(UnsubscribeUserForm);
